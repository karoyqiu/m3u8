# yt-dlp Concurrent Fragments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FFmpeg sidecar with yt-dlp to download HLS streams with concurrent fragment downloading, switching the progress model from time-based to fragment-based.

**Architecture:** yt-dlp is registered as the sole Tauri sidecar; it emits JSON progress lines to stderr via `--progress-template`; the frontend parses `fragment_index`/`fragment_count` and passes them directly to `SegmentProgress` where each canvas block represents one fragment.

**Tech Stack:** Tauri 2, React 19, TypeScript, yt-dlp (sidecar binary)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe` | Create (manual) | New sidecar binary |
| `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` | Delete | Removed dependency |
| `src-tauri/tauri.conf.json` | Modify | `externalBin` array: ffmpeg → yt-dlp |
| `src-tauri/capabilities/default.json` | Modify | `shell:allow-spawn` sidecar name: ffmpeg → yt-dlp |
| `src/hooks/useDownload.ts` | Modify | Replace FFmpeg args + progress parsing with yt-dlp |
| `src/components/segment-progress.tsx` | Modify | Remove `/3` division from segments/value |
| `src/components/settings-dialog.tsx` | Modify | Rename "Threads" label → "Concurrent Fragments" |

---

## Task 1: Place yt-dlp Binary

**Files:**
- Create: `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`
- Delete: `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`

- [ ] **Step 1: Download yt-dlp Windows binary**

  Go to https://github.com/yt-dlp/yt-dlp/releases/latest and download `yt-dlp.exe`.

- [ ] **Step 2: Place and rename binary**

  Copy the downloaded file to `src-tauri/binaries/` and rename it:

  ```bash
  cp ~/Downloads/yt-dlp.exe src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe
  ```

- [ ] **Step 3: Remove ffmpeg binary**

  ```bash
  rm src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
  ```

- [ ] **Step 4: Verify binary exists**

  ```bash
  ls src-tauri/binaries/
  ```

  Expected: `yt-dlp-x86_64-pc-windows-msvc.exe` (and nothing else)

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/binaries/
  git commit -m "chore: replace ffmpeg sidecar with yt-dlp"
  ```

---

## Task 2: Update Tauri Config

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Update `tauri.conf.json` externalBin**

  In `src-tauri/tauri.conf.json`, change line 41:

  ```json
  "externalBin": ["binaries/yt-dlp"],
  ```

  (was `"externalBin": ["binaries/ffmpeg"]`)

- [ ] **Step 2: Update `capabilities/default.json` sidecar permission**

  In `src-tauri/capabilities/default.json`, change the `shell:allow-spawn` entry's `name` field:

  ```json
  {
    "identifier": "shell:allow-spawn",
    "allow": [
      {
        "sidecar": true,
        "name": "binaries/yt-dlp",
        "args": true
      }
    ]
  }
  ```

  (was `"name": "binaries/ffmpeg"`)

- [ ] **Step 3: Commit**

  ```bash
  git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json
  git commit -m "chore: update Tauri sidecar config for yt-dlp"
  ```

---

## Task 3: Replace Download Logic in useDownload.ts

**Files:**
- Modify: `src/hooks/useDownload.ts`

- [ ] **Step 1: Replace the file content**

  Replace the entire contents of `src/hooks/useDownload.ts` with:

  ```ts
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
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  yarn build
  ```

  Expected: no type errors. (Build may fail on Tauri-specific steps — TypeScript errors are what matter here.)

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useDownload.ts
  git commit -m "feat: replace ffmpeg with yt-dlp, parse fragment progress from JSON"
  ```

---

## Task 4: Update SegmentProgress to Fragment-Based Blocks

**Files:**
- Modify: `src/components/segment-progress.tsx`

- [ ] **Step 1: Remove the `/3` division**

  In `src/components/segment-progress.tsx`, find lines 36–37:

  ```ts
  // 3 秒一块
  const segments = Math.round(total / 3);
  const value = Math.round(progress / 3);
  ```

  Replace with:

  ```ts
  const segments = total;
  const value = progress;
  ```

  Also remove the `// 3 秒一块` comment (it no longer applies).

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  yarn build
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/segment-progress.tsx
  git commit -m "feat: segment progress blocks now represent HLS fragments"
  ```

---

## Task 5: Update Settings Label

**Files:**
- Modify: `src/components/settings-dialog.tsx`

- [ ] **Step 1: Update the Threads field label and description**

  In `src/components/settings-dialog.tsx`, find the `FormField` for `threads`. Change:

  ```tsx
  <FormLabel>Threads</FormLabel>
  ```
  to:
  ```tsx
  <FormLabel>Concurrent Fragments</FormLabel>
  ```

  And change:

  ```tsx
  <FormDescription>
    Number of FFmpeg threads. 0 = auto.
  </FormDescription>
  ```
  to:
  ```tsx
  <FormDescription>
    Number of fragments to download in parallel. Default: 1.
  </FormDescription>
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/settings-dialog.tsx
  git commit -m "chore: rename Threads setting to Concurrent Fragments"
  ```

---

## Task 6: Manual End-to-End Verification

- [ ] **Step 1: Run the app**

  ```bash
  yarn tauri dev
  ```

- [ ] **Step 2: Set download directory**

  Open Settings → set a download directory.

- [ ] **Step 3: Download a test HLS stream**

  Paste a `.m3u8` URL into the URL field and click Download. Verify:
  - The segment grid appears and fills with green blocks as fragments complete
  - The taskbar progress bar updates
  - A `.ts` file appears in the download directory when complete
  - Clicking Abort stops the download

- [ ] **Step 4: Test concurrent fragments**

  Open Settings → set Concurrent Fragments to 5. Re-download the same URL. Confirm it completes (speed may visibly increase for large streams).

- [ ] **Step 5: Test referer field**

  Enter a URL that requires a Referer header, fill in the Referer field, and confirm download succeeds.
