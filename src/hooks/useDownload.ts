import { join } from '@tauri-apps/api/path';
import { mkdir, stat, writeTextFile } from '@tauri-apps/plugin-fs';
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

const getFileSize = async (path: string) => {
  try {
    const fileInfo = await stat(path);

    if (fileInfo.isFile) {
      return fileInfo.size;
    }
  } catch (e) {}

  return 0;
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
        const fileSize = await getFileSize(file);

        if (fileSize > 0) {
          return;
          // 获取分片长度
          console.debug('Heading', seg.uri);
          const response = await retry({ signal }, () => fetch(url, { method: 'HEAD', signal }));
          const contentLength = response.headers.get('Content-Length');
          const size = parseInt(contentLength ?? '0', 10);

          // 如果文件长度一致，则认为已下载完成
          if (fileSize === size) {
            onProgress({
              index,
              downloaded: fileSize,
              total: fileSize,
              speed: 0,
            });
            return;
          }
        }

        // 下载
        await retry({ times: 10, backoff: (c) => 2 ** c, signal }, () => {
          console.debug('Downloading', url.toString());
          return downloadAs(url.toString(), file, (progress) =>
            onProgress({
              index,
              downloaded: progress.progressTotal,
              total: progress.total,
              speed: progress.transferSpeed,
            }),
          );
        });
      }),
    ),
  );
};

const mergeFiles = async (
  dir: string,
  filename: string,
  segments: Segment[],
  signal?: AbortSignal,
) => {
  if (signal?.aborted) {
    return;
  }

  const subdir = await join(dir, `.tmp-${filename}`);
  const filelistPath = await join(subdir, 'filelist.txt');
  const filelist: string[] = [];

  for (const seg of segments) {
    filelist.push(`file '${seg.uri}'`);
  }

  await writeTextFile(filelistPath, filelist.join('\n'));

  if (signal?.aborted) {
    return;
  }

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
    // const key = 'out_time_us=';

    // if (line.startsWith(key)) {
    //   console.debug(line);
    // }
    console.debug(line);
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
  onProgress: (progress: DownloadProgress) => void;
};

export const useDownload = (props: UseDownloadProps) => {
  const { onStart, onProgress } = props;
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
            onProgress,
            ctrl.current.signal,
          );
          await mergeFiles(dir, filename, bestFile.segments, ctrl.current.signal);
        } else {
          await downloadSegments(
            url,
            file.segments,
            dir,
            filename,
            onStart,
            onProgress,
            ctrl.current.signal,
          );
          await mergeFiles(dir, filename, file.segments, ctrl.current.signal);
        }
      } catch (e) {
        console.error(e);
      }

      setDownloading(false);
    },
    [dir, onStart, onProgress],
  );

  const abort = useCallback(() => {
    ctrl?.current?.abort();
  }, []);

  return { downloading, download, abort };
};
