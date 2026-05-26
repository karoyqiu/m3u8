import { join } from '@tauri-apps/api/path';
import { readDir, remove, rename } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

const AUDIO_VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v',
  'mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus', 'wma',
]);

// Video streams are copied as-is; audio-only files omit -c:v copy
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

  const normalize = useCallback(async (dir: string) => {
    const entries = await readDir(dir);
    const files = entries.filter((e) => {
      if (!e.isFile || !e.name) return false;
      const ext = e.name.split('.').pop()?.toLowerCase();
      return ext != null && AUDIO_VIDEO_EXTENSIONS.has(ext) && !e.name.includes('.normalizing.');
    });

    if (files.length === 0) {
      toast.warning('No audio/video files found in the selected directory.');
      return;
    }

    setNormalizing(true);
    ctrl.current = new AbortController();

    let done = 0;
    const toastId = toast.loading(`Normalizing 0 / ${files.length} files...`);

    try {
      for (const entry of files) {
        if (ctrl.current.signal.aborted) break;

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

        if (ctrl.current.signal.aborted) {
          ffmpegChild.kill().catch(() => {});
        }

        const killFfmpeg = () => ffmpegChild.kill().catch(() => {});
        ctrl.current.signal.addEventListener('abort', killFfmpeg);

        try {
          await waitForFfmpeg;
          await remove(inputPath);
          await rename(tempPath, inputPath);
          done++;
          toast.loading(`Normalizing ${done} / ${files.length} files...`, { id: toastId });
        } catch (e) {
          remove(tempPath).catch(() => {});
          throw e;
        } finally {
          ctrl.current.signal.removeEventListener('abort', killFfmpeg);
        }
      }

      if (ctrl.current.signal.aborted) {
        toast.warning('Normalization aborted.', { id: toastId });
      } else {
        toast.success(`Normalized ${done} file${done !== 1 ? 's' : ''}.`, { id: toastId });
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (ctrl.current?.signal.aborted) {
        toast.warning('Normalization aborted.', { id: toastId });
      } else {
        toast.error(msg, { id: toastId, duration: Infinity, closeButton: true });
      }
    } finally {
      setNormalizing(false);
    }
  }, []);

  const abortNormalize = useCallback(() => {
    ctrl.current?.abort('User aborted.');
  }, []);

  return { normalizing, normalize, abortNormalize };
};
