import { join } from '@tauri-apps/api/path';
import { mkdir, stat } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { download as downloadAs } from '@tauri-apps/plugin-upload';
import { Parser, type Segment } from 'm3u8-parser';
import pLimit from 'p-limit';
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
  console.log('Downloading', url);
  const response = await fetch(url, { signal, connectTimeout: 30000 });
  const text = await response.text();

  const parser = new Parser();
  parser.push(text);
  parser.end();
  return parser.manifest;
};

const isNonEmptyFile = async (path: string) => {
  try {
    const fileInfo = await stat(path);
    return fileInfo.isFile && fileInfo.size > 0;
  } catch (e) {
    return false;
  }
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

  await Promise.all(
    segments.map((seg, index) =>
      limit(async () => {
        if (signal?.aborted) {
          return;
        }

        const file = await join(subdir, seg.uri);

        // 如果文件已存在且不为空，就当作已经下载完成
        if (await isNonEmptyFile(file)) {
          onProgress({
            index,
            downloaded: 1,
            total: 1,
            speed: 1,
          });
          return;
        }

        const url = new URL(seg.uri, baseUrl);
        console.log('Downloading', url);
        await downloadAs(url.toString(), file, (progress) =>
          onProgress({
            index,
            downloaded: progress.progressTotal,
            total: progress.total,
            speed: progress.transferSpeed,
          }),
        );
      }),
    ),
  );
};

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

      try {
        const url = new URL(params.url);
        const filename = params.filename || (await hash(params.url));

        ctrl.current = new AbortController();
        const file = await downloadM3u8(url, ctrl.current.signal);
        console.log('m3u8', file);

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
          console.log('Best', file.playlists[0]);

          /// @ts-expect-error: 为啥没定义这个
          const bestUrl = new URL(best.uri as string, url);
          const bestFile = await downloadM3u8(bestUrl, ctrl.current.signal);
          console.log('Best m3u8', bestFile);

          await downloadSegments(
            bestUrl,
            bestFile.segments,
            dir,
            filename,
            onStart,
            onProgress,
            ctrl.current.signal,
          );
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
        }
      } catch (e) {
        console.error(e);
      }

      setDownloading(false);
    },
    [dir],
  );

  const abort = useCallback(() => {
    ctrl?.current?.abort();
    //setDownloading(false);
  }, []);

  return { downloading, download, abort };
};
