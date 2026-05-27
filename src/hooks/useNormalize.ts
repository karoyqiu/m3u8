import { readLocalStorageValue } from '@mantine/hooks';
import { join } from '@tauri-apps/api/path';
import { readDir, remove, rename } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import pLimit from 'p-limit';
import { useCallback, useRef, useState } from 'react';

const AUDIO_VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v',
  'mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus', 'wma',
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v']);

const waitForCommand = (name: string, command: Command<string>) =>
  new Promise<void>((resolve, reject) => {
    command.once('close', (data) => {
      if (data.code !== 0) reject(new Error(`${name} exited with code ${data.code}`));
      else resolve();
    });
    command.once('error', reject);
  });

export const useNormalize = () => {
  const [normalizing, setNormalizing] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const normalize = useCallback(async (dir: string): Promise<string> => {
    const entries = await readDir(dir);
    const files = entries.filter((e) => {
      if (!e.isFile || !e.name) return false;
      const ext = e.name.split('.').pop()?.toLowerCase();
      return ext != null && AUDIO_VIDEO_EXTENSIONS.has(ext) && !e.name.includes('.normalizing.');
    });

    if (files.length === 0) {
      throw new Error('No audio/video files found in the selected directory.');
    }

    setNormalizing(true);
    ctrl.current = new AbortController();

    const threads = readLocalStorageValue<number>({ key: 'threads', defaultValue: 1 });
    const limit = pLimit(Math.max(threads, 1));
    let done = 0;

    try {
      await Promise.all(
        files.map((entry) =>
          limit(async () => {
            if (ctrl.current?.signal.aborted) return;

            const name = entry.name!;
            const ext = name.split('.').pop()!.toLowerCase();
            const nameNoExt = name.slice(0, -(ext.length + 1));
            const inputPath = await join(dir, name);
            const tempPath = await join(dir, `${nameNoExt}.normalizing.${ext}`);

            const isVideo = VIDEO_EXTENSIONS.has(ext);
            const args = isVideo
              ? ['-v', 'quiet', '-y', '-i', inputPath, '-c:v', 'copy', '-af', 'dynaudnorm=f=150:g=13', tempPath]
              : ['-v', 'quiet', '-y', '-i', inputPath, '-af', 'dynaudnorm=f=150:g=13', tempPath];

            const ffmpeg = Command.sidecar('binaries/ffmpeg', args);
            const waitForFfmpeg = waitForCommand('ffmpeg', ffmpeg);
            const ffmpegChild = await ffmpeg.spawn();

            if (ctrl.current?.signal.aborted) {
              ffmpegChild.kill().catch(() => {});
              return;
            }

            const killFfmpeg = () => ffmpegChild.kill().catch(() => {});
            ctrl.current?.signal.addEventListener('abort', killFfmpeg);

            try {
              await waitForFfmpeg;
              await rename(tempPath, inputPath);
              done++;
            } catch (e) {
              remove(tempPath).catch(() => {});
              if (!ctrl.current?.signal.aborted) throw e;
            } finally {
              ctrl.current?.signal.removeEventListener('abort', killFfmpeg);
            }
          })
        )
      );

      if (ctrl.current.signal.aborted) {
        return `Normalized ${done} of ${files.length} file${files.length !== 1 ? 's' : ''} (aborted).`;
      }
      return `Normalized ${done} file${done !== 1 ? 's' : ''}.`;
    } finally {
      setNormalizing(false);
    }
  }, []);

  const abortNormalize = useCallback(() => {
    ctrl.current?.abort('User aborted.');
  }, []);

  return { normalizing, normalize, abortNormalize };
};
