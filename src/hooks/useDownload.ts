import { readLocalStorageValue } from '@mantine/hooks';
import { remove } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4-mini';

import { recordDownload } from '@/lib/downloads-db';

export const downloadParamsSchema = z.object({
  url: z.url(),
  filename: z.string().check(z.minLength(1)),
  referer: z.optional(z.string()),
});
export type DownloadParams = z.infer<typeof downloadParamsSchema>;

const waitForCommand = (name: string, command: Command<string>) =>
  new Promise<void>((resolve, reject) => {
    command.once('close', (data) => {
      if (data.code !== 0) reject(new Error(`${name} exited with code ${data.code}`));
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

      const tsFilename = `${params.filename}.ts`;
      const mp4Path = `${dir}\\${params.filename}.mp4`;

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
          '--abort-on-unavailable-fragments',
        ];

        if (params.referer) {
          args.push('--referer', params.referer);
        }

        args.push('-o', tsFilename, params.url);

        const ytdlp = Command.sidecar('binaries/yt-dlp', args, { cwd: dir });
        ctrl.current = new AbortController();

        const onProgress = (line: string) => {
          console.debug('yt-dlp:', line);
          try {
            const json = JSON.parse(line.trim()) as {
              fragment_index?: number;
              fragment_count?: number;
              status?: string;
            };
            if (json.status === 'finished' && json.fragment_count != null) {
              onDownload(json.fragment_count, json.fragment_count);
            } else if (json.fragment_index != null && json.fragment_count != null) {
              onDownload(json.fragment_index, json.fragment_count);
            }
          } catch {}
        };

        ytdlp.stdout.on('data', onProgress);
        ytdlp.stderr.on('data', (line) => {
          console.error('yt-dlp error:', line);
          toast.error(line);
        });

        const waitForExit = waitForCommand('yt-dlp', ytdlp);
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
        ctrl.current.signal.removeEventListener('abort', killTree);

        const ffmpeg = Command.sidecar('binaries/ffmpeg', [
          '-v', 'quiet',
          '-y',
          '-i', `${dir}\\${tsFilename}`,
          '-c:v', 'copy',
          '-af', 'dynaudnorm=f=150:g=13',
          mp4Path,
        ]);
        const waitForFfmpeg = waitForCommand('ffmpeg', ffmpeg);
        const ffmpegChild = await ffmpeg.spawn();

        if (ctrl.current.signal.aborted) {
          ffmpegChild.kill().catch(() => {});
        }

        ctrl.current.signal.addEventListener('abort', () => ffmpegChild.kill().catch(() => {}));

        await waitForFfmpeg;
        await Promise.all([remove(`${dir}/${tsFilename}`), recordDownload(params.filename)]);
      } catch (e) {
        console.error(e);

        if (ctrl.current?.signal?.aborted) {
          toast.error(`${e}`);
        } else {
          toast.error(`${e}`, { duration: Infinity, closeButton: true });
          setTimeout(() => download(params), 100);
        }
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
