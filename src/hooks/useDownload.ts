import { join } from '@tauri-apps/api/path';
import { exists, mkdir, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { Command } from '@tauri-apps/plugin-shell';
import { download as downloadAs } from '@tauri-apps/plugin-upload';
import { Parser, type Segment } from 'm3u8-parser';
import pLimit from 'p-limit';
import { retry } from 'radashi';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useReadLocalStorage } from 'usehooks-ts';
import { z } from 'zod/v4-mini';

export const downloadParamsSchema = z.object({
  /// 要下载的 URL
  url: z.url(),
  /// 要保存的文件名
  filename: z.optional(z.string()),
});
export type DownloadParams = z.infer<typeof downloadParamsSchema>;

const hash = async (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  const array = Array.from(new Uint8Array(buffer));
  return array.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const downloadM3u8 = async (url: URL, signal?: AbortSignal) => {
  console.debug('Downloading', url);
  const response = await fetch(url, { signal, connectTimeout: 30000 });
  const text = await response.text();

  const parser = new Parser();
  parser.push(text);
  parser.end();
  return parser.manifest;
};

const downloadSegments = async (
  baseUrl: URL,
  segments: Segment[],
  dir: string,
  filename: string,
  onStart: (segments: string[]) => void,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
) => {
  const subdir = await join(dir, `.tmp-${filename}`);
  await mkdir(subdir, { recursive: true });

  onStart(segments.map((seg) => seg.uri));
  const limit = pLimit(8);

  await Promise.allSettled(
    segments.map((seg, index) =>
      limit(async () => {
        if (signal?.aborted) {
          return;
        }

        const url = new URL(seg.uri, baseUrl);
        const file = await join(subdir, seg.uri);

        // 如果文件存在，则跳过
        if (await exists(file)) {
          onProgress({
            index,
            downloaded: 1,
            total: 1,
            speed: 0,
          });
          return;
        }

        // 文件不存在，先下载到临时文件
        const temp = `${file}.dl`;

        // 下载
        await retry({ times: 10, backoff: (c) => 2 ** c, signal }, () => {
          console.debug('Downloading', url.toString());
          return downloadAs(url.toString(), temp, (progress) =>
            onProgress({
              index,
              downloaded: progress.progressTotal,
              total: progress.total,
              speed: progress.transferSpeed,
            }),
          );
        });

        // 下载完成，重命名文件
        await rename(temp, file);
      }),
    ),
  );
};

const OUT_TIME_US = 'out_time_us=';

const mergeFiles = async (
  dir: string,
  filename: string,
  segments: Segment[],
  onMerge: (percent: number) => void,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) {
    return;
  }

  const subdir = await join(dir, `.tmp-${filename}`);
  const filelistPath = await join(subdir, 'filelist.txt');
  const filelist: string[] = [];
  let duration = 0;

  for (const seg of segments) {
    filelist.push(`file '${seg.uri}'`);
    duration += seg.duration;
  }

  await writeTextFile(filelistPath, filelist.join('\n'));

  if (signal?.aborted) {
    return;
  }

  onMerge(0);

  const args = [
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-i',
    filelistPath,
    '-c',
    'copy',
    `../${filename}`,
  ];
  const ffmpeg = Command.sidecar('binaries/ffmpeg', args, { cwd: subdir });
  ffmpeg.stdout.on('data', (line) => {
    if (line.startsWith(OUT_TIME_US)) {
      const value = line.substring(OUT_TIME_US.length);
      const seconds = (parseFloat(value) || 0) / 1000000;
      const percent = Math.min(Math.round((seconds * 100) / duration), 99);
      onMerge(percent);
    }
  });

  const waitForExit = waitForCommand(ffmpeg);
  const child = await ffmpeg.spawn();

  if (signal) {
    if (signal.aborted) {
      child.kill();
      return;
    }

    signal.addEventListener('abort', () => child.kill());
  }

  await waitForExit;
  onMerge(100);
};

const waitForCommand = (command: Command<string>) =>
  new Promise((resolve, reject) => {
    command.once('close', resolve);
    command.once('error', reject);
  });

export type DownloadProgress = {
  index: number;
  downloaded: number;
  total: number;
  speed: number;
};

type UseDownloadProps = {
  onStart: (segments: string[]) => void;
  onDownload: (progress: DownloadProgress) => void;
  onMerge: (percent: number) => void;
};

export const useDownload = (props: UseDownloadProps) => {
  const { onStart, onDownload, onMerge } = props;
  const [downloading, setDownloading] = useState(false);
  const dir = useReadLocalStorage<string>('dir');
  const ctrl = useRef<AbortController>(null);

  const download = useCallback(
    async (params: DownloadParams) => {
      if (!dir) {
        toast.error('The download directory is not set.');
        return;
      }

      setDownloading(true);
      onStart([]);

      try {
        const url = new URL(params.url);
        const filename = params.filename || (await hash(params.url));

        ctrl.current = new AbortController();
        const file = await downloadM3u8(url, ctrl.current.signal);
        console.debug('m3u8', file);

        if (file.playlists && file.playlists.length > 0) {
          // 播放列表，查找最佳分辨率
          type Resolution = {
            width: number;
            height: number;
          };
          file.playlists.sort((a, b) => {
            const ar = a.attributes.RESOLUTION as Resolution;
            const br = b.attributes.RESOLUTION as Resolution;
            return br.height - ar.height;
          });

          const best = file.playlists[0];
          console.debug('Best', file.playlists[0]);

          /// @ts-expect-error: 为啥没定义这个
          const bestUrl = new URL(best.uri as string, url);
          const bestFile = await downloadM3u8(bestUrl, ctrl.current.signal);
          console.debug('Best m3u8', bestFile);

          await downloadSegments(
            bestUrl,
            bestFile.segments,
            dir,
            filename,
            onStart,
            onDownload,
            ctrl.current.signal,
          );
          await mergeFiles(dir, filename, bestFile.segments, onMerge, ctrl.current.signal);
        } else {
          await downloadSegments(
            url,
            file.segments,
            dir,
            filename,
            onStart,
            onDownload,
            ctrl.current.signal,
          );
          await mergeFiles(dir, filename, file.segments, onMerge, ctrl.current.signal);
        }
      } catch (e) {
        console.error(e);
      }

      setDownloading(false);
    },
    [dir, onStart, onDownload, onMerge],
  );

  const abort = useCallback(() => {
    ctrl?.current?.abort();
  }, []);

  return { downloading, download, abort };
};
