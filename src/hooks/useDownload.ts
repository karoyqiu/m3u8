import { readLocalStorageValue } from '@mantine/hooks';
import { join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { Command } from '@tauri-apps/plugin-shell';
import { Parser, type Segment } from 'm3u8-parser';
import pLimit from 'p-limit';
import { retry, timeout } from 'radashi';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4-mini';

type UseDownloadProps = {
  onStart: (segments: string[]) => void;
  onDownload: (progress: DownloadProgress) => void;
  onMerge: (percent: number) => void;
  onEnd: () => void;
};

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

const downloadM3u8 = async (
  url: URL,
  dir: string,
  filename: string,
  m3u8Filename: string,
  signal?: AbortSignal,
) => {
  const subdir = await join(dir, `.tmp-${filename}`);
  await mkdir(subdir, { recursive: true });

  const path = await join(subdir, m3u8Filename);
  let text = '';

  try {
    text = await readTextFile(path);
  } catch (e) {
    console.debug('Downloading', url);
    const resp = await Promise.race([
      fetch(url, { connectTimeout: 30000, keepalive: true, signal }),
      timeout(3 * 60 * 1000),
    ]);
    text = await resp.text();

    await writeTextFile(path, text);
  }

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
  props: UseDownloadProps,
  signal?: AbortSignal,
) => {
  const { onStart, onDownload, onMerge, onEnd } = props;
  const subdir = await join(dir, `.tmp-${filename}`);

  console.info(`Downloading ${segments.length} segments`);
  onStart(segments.map((seg) => seg.uri));
  const limit = pLimit(8);

  await Promise.all(
    segments.map((seg, index) =>
      limit(async () => {
        if (signal?.aborted) {
          return;
        }

        const url = new URL(seg.uri, baseUrl);
        const file = await join(subdir, seg.uri);

        // 如果文件存在，则跳过
        if (!(await exists(file))) {
          // 文件不存在
          onDownload({
            index,
            downloaded: 1,
            total: 100,
          });

          // 下载
          await retry({ times: 10, delay: 3000, signal }, async () => {
            console.debug('Downloading', url.toString());
            const resp = await Promise.race([
              fetch(url, { connectTimeout: 30000, keepalive: true, signal }),
              timeout(3 * 60 * 1000),
            ]);

            if (resp.body) {
              const bytes = await resp.bytes();
              await writeFile(file, bytes);
            } else {
              console.warn(`No body for index ${index}`);
            }
          });
        }

        // 下载完成
        onDownload({
          index,
          downloaded: 100,
          total: 100,
        });
      }),
    ),
  );

  await mergeFiles(subdir, filename, segments, onMerge, signal);

  console.info('Cleaning up');
  await remove(subdir, { recursive: true });

  console.info('All done');
  onEnd();
};

const OUT_TIME_US = 'out_time_us=';

const mergeFiles = async (
  subdir: string,
  filename: string,
  segments: Segment[],
  onMerge: (percent: number) => void,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) {
    return;
  }

  console.info('Merging');
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
};

export type DownloadSegment = Omit<DownloadProgress, 'index'> & {
  _id: string;
  segment: string;
};

export const useDownload = (props: UseDownloadProps) => {
  const [downloading, setDownloading] = useState(false);
  const ctrl = useRef<AbortController>(null);

  const download = useCallback(
    async (params: DownloadParams) => {
      const dir = readLocalStorageValue<string>({ key: 'dir' });

      if (!dir) {
        toast.error('The download directory is not set.');
        return;
      }

      setDownloading(true);
      props.onStart([]);

      try {
        const url = new URL(params.url);
        const filename = params.filename || (await hash(params.url));

        console.info('Downloading top level playlist');
        ctrl.current = new AbortController();
        const file = await downloadM3u8(url, dir, filename, 'playlist.m3u8', ctrl.current.signal);
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

          console.info('Downloading the best playlist');
          const best = file.playlists[0];
          console.debug('Best', file.playlists[0]);

          /// @ts-expect-error: 为啥没定义这个
          const bestUrl = new URL(best.uri as string, url);
          const bestFile = await downloadM3u8(
            bestUrl,
            dir,
            filename,
            'best.m3u8',
            ctrl.current.signal,
          );
          console.debug('Best m3u8', bestFile);

          await downloadSegments(
            bestUrl,
            bestFile.segments,
            dir,
            filename,
            props,
            ctrl.current.signal,
          );
        } else {
          await downloadSegments(url, file.segments, dir, filename, props, ctrl.current.signal);
        }
      } catch (e) {
        console.error(e);
        ctrl.current?.abort(e);
      }

      setDownloading(false);
    },
    [props],
  );

  const abort = useCallback(() => {
    ctrl?.current?.abort();
  }, []);

  return { downloading, download, abort };
};
