import { readLocalStorageValue } from '@mantine/hooks';
import { remove } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4-mini';

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
  new Promise<void>((resolve, reject) => {
    command.once('close', (data) => {
      if (data.code !== 0) reject(new Error(`yt-dlp exited with code ${data.code}`));
      else resolve();
    });
    command.once('error', reject);
  });

type UseDownloadProps = {
  onStart: () => void;
  onDownload: (progress: number, total: number) => void;
  onEnd: () => void;
};

export const useDownload = ({ onStart, onDownload, onEnd }: UseDownloadProps) => {
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
      onStart();

      const filename = params.filename || (await generateFileName(params.url));

      try {
        const args = [
          '--progress-template',
          'download:%(progress)j',
          '--progress-delta',
          '0.25',
          '--newline',
          '--concurrent-fragments',
          String(Math.max(threads, 1)),
          '--hls-use-mpegts',
          '--no-part',
          '--abort-on-unavailable-fragments',
          '--no-continue',
        ];

        if (params.referer) {
          args.push('--referer', params.referer);
        }

        args.push('-o', filename, params.url);

        const ytdlp = Command.sidecar('binaries/yt-dlp', args, { cwd: dir });
        ctrl.current = new AbortController();

        const onProgress = (line: string) => {
          try {
            const json = JSON.parse(line.trim()) as {
              fragment_index?: number;
              fragment_count?: number;
            };
            if (json.fragment_index != null && json.fragment_count != null) {
              onDownload(json.fragment_index, json.fragment_count);
            }
          } catch {}
        };

        ytdlp.stdout.on('data', onProgress);

        const waitForExit = waitForCommand(ytdlp);
        const child = await ytdlp.spawn();

        const killTree = () => {
          Command.create('taskkill', ['/F', '/T', '/PID', String(child.pid)])
            .spawn()
            .catch(() => {});
        };

        if (ctrl.current.signal.aborted) {
          killTree();
        }

        ctrl.current.signal.addEventListener('abort', killTree);

        await waitForExit;
      } catch (e) {
        toast.error(`${e}`);
        await remove(`${dir}/${filename}`).catch(() => {});
      } finally {
        setDownloading(false);
        onEnd();
      }
    },
    [onStart, onDownload, onEnd],
  );

  const abort = useCallback(() => {
    ctrl?.current?.abort('User aborted.');
  }, []);

  return { downloading, download, abort };
};
