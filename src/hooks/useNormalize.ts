import { readLocalStorageValue } from '@mantine/hooks';
import { join } from '@tauri-apps/api/path';
import { exists, readDir, remove, rename } from '@tauri-apps/plugin-fs';
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

    // If a "normalized" subdir exists, write outputs there instead of overwriting sources.
    const normalizedDir = await join(dir, 'normalized');
    const useNormalizedDir = await exists(normalizedDir);

    try {
      await Promise.all(
        files.map((entry) =>
          limit(async () => {
            if (ctrl.current?.signal.aborted) return;

            const name = entry.name!;
            const ext = name.split('.').pop()!.toLowerCase();
            const nameNoExt = name.slice(0, -(ext.length + 1));
            const inputPath = await join(dir, name);
            const outputPath = useNormalizedDir
              ? await join(normalizedDir, name)
              : await join(dir, `${nameNoExt}.normalizing.${ext}`);

            const isVideo = VIDEO_EXTENSIONS.has(ext);
            const args = isVideo
              ? ['-v', 'quiet', '-y', '-i', inputPath, '-c:v', 'copy', '-af', 'dynaudnorm=f=150:g=13', outputPath]
              : ['-v', 'quiet', '-y', '-i', inputPath, '-af', 'dynaudnorm=f=150:g=13', outputPath];

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
              if (!useNormalizedDir) {
                // Overwrite the source only when not writing into a normalized subdir.
                await rename(outputPath, inputPath);
              } else {
                // Move into normalized/ succeeded — remove the now-redundant source.
                // Failure here doesn't invalidate the normalized output, so don't
                // let it cascade into deleting outputPath below.
                await remove(inputPath).catch(() => {});
              }
              done++;
            } catch (e) {
              remove(outputPath).catch(() => {});
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
