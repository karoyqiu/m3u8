import { readLocalStorageValue } from '@mantine/hooks';
import { remove } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4-mini';

const PROGRESS_PREFIX = 'download:';

export const downloadParamsSchema = z.object({
  url: z.url(),
  filename: z.optional(z.string()),
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
  return `${filename}.ts`;
};

const waitForCommand = (command: Command<string>) =>
  new Promise((resolve, reject) => {
    command.once('close', resolve);
    command.once('error', reject);
  });

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
      const threads = readLocalStorageValue<number>({ key: 'threads', defaultValue: 0 });

      if (!dir) {
        toast.error('The download directory is not set.');
        return;
      }

      setDownloading(true);
      props.onStart();

      const filename = params.filename || (await generateFileName(params.url));

      try {
        const args = [
          '--progress-template',
          'download:%(progress)j',
          '--newline',
          '--concurrent-fragments',
          String(Math.max(threads ?? 1, 1)),
          '--hls-use-mpegts',
          '--no-part',
        ];

        if (params.referer) {
          args.push('--referer', params.referer);
        }

        args.push('-o', filename, params.url);

        const ytdlp = Command.sidecar('binaries/yt-dlp', args, { cwd: dir });
        ctrl.current = new AbortController();

        ytdlp.stderr.on('data', (line) => {
          if (!line.startsWith(PROGRESS_PREFIX)) return;
          try {
            const json = JSON.parse(line.slice(PROGRESS_PREFIX.length)) as {
              fragment_index?: number;
              fragment_count?: number;
            };
            if (json.fragment_index != null && json.fragment_count != null) {
              props.onDownload(json.fragment_index, json.fragment_count);
            }
          } catch {}
        });

        const waitForExit = waitForCommand(ytdlp);
        const child = await ytdlp.spawn();

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
