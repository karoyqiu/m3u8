import { readLocalStorageValue } from '@mantine/hooks';
import { remove } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4-mini';

const OUT_TIME_US = 'out_time_us=';
const DURATION = '  Duration: ';

export const downloadParamsSchema = z.object({
  /// 要下载的 URL
  url: z.url(),
  /// 要保存的文件名
  filename: z.optional(z.string()),
  /// Referer 请求头
  referer: z.optional(z.string()),
});
export type DownloadParams = z.infer<typeof downloadParamsSchema>;

const hash = async (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  const array = Array.from(new Uint8Array(buffer));
  return array.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const generateFileName = async (s: string) => {
  const filename = await hash(s);
  return `${filename}.mp4`;
};

const waitForCommand = (command: Command<string>) =>
  new Promise((resolve, reject) => {
    command.once('close', resolve);
    command.once('error', reject);
  });

const parseDuration = (text: string) => {
  const match = /(?<h>\d{2,}):(?<m>\d{2}):(?<s>\d{2}).(?<ms>\d{2})/.exec(text);

  if (match?.groups) {
    const h = parseInt(match.groups.h, 10);
    const m = parseInt(match.groups.m, 10);
    const s = parseInt(match.groups.s, 10);
    const ms = parseInt(match.groups.ms, 10);
    return h * 3600 + m * 60 + s + ms / 100;
  }

  return 0;
};

type UseDownloadProps = {
  onStart: () => void;
  onDownload: (progress: number, total: number) => void;
  onEnd: () => void;
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
      props.onStart();

      const filename = params.filename || (await generateFileName(params.url));

      try {
        let duration = 1;

        const args = [
          '-y',
          '-progress',
          'pipe:1',
          '-hide_banner',
          '-allowed_extensions',
          'ALL',
          '-extension_picky',
          'false',
        ];

        if (params.referer) {
          args.push('-headers', `Referer: ${params.referer}`);
        }

        args.push('-i', params.url, '-c', 'copy', filename);
        const ffmpeg = Command.sidecar('binaries/ffmpeg', args, { cwd: dir });
        ctrl.current = new AbortController();

        ffmpeg.stdout.on('data', (line) => {
          if (line.startsWith(OUT_TIME_US)) {
            const value = line.substring(OUT_TIME_US.length);
            const us = parseFloat(value);
            props.onDownload(us / 1_000_000, duration);
          }
        });
        ffmpeg.stderr.on('data', (line) => {
          if (line.startsWith(DURATION)) {
            const comma = line.indexOf(',');
            const dur = line.substring(DURATION.length, comma);
            duration = parseDuration(dur);
          }
        });

        const waitForExit = waitForCommand(ffmpeg);
        const child = await ffmpeg.spawn();

        if (ctrl.current.signal.aborted) {
          child.kill();
          return;
        }

        ctrl.current.signal.addEventListener('abort', () => child.kill());

        await waitForExit;
      } catch (e) {
        toast.error(`${e}`);
        await remove(filename);
      }

      setDownloading(false);
      props.onEnd();
    },
    [props.onStart, props.onDownload, props.onEnd],
  );

  const abort = useCallback(() => {
    ctrl?.current?.abort('User aborted.');
  }, []);

  return { downloading, download, abort };
};
