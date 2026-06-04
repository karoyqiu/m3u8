# Download Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sequential download queue with right sidebar panel, localStorage persistence, and auto-advancing downloads.

**Architecture:** New `useDownloadQueue` hook wraps modified `useDownload`. Queue state persisted to localStorage. Right sidebar `QueuePanel` component auto-shows when queue non-empty. Form stays enabled during downloads.

**Tech Stack:** React 19, TypeScript, localStorage, existing shadcn UI primitives (Button, ScrollArea)

**No tests** — project has no test infrastructure (per CLAUDE.md).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useDownload.ts` | Modify | Remove auto-retry, rename callbacks to `onProgress`/`onSuccess`/`onError` |
| `src/hooks/useDownloadQueue.ts` | Create | Queue state management, localStorage persistence, advances downloads sequentially |
| `src/components/queue-panel.tsx` | Create | Right sidebar with queue item list, cancel/abort/retry actions |
| `src/components/download-form.tsx` | Modify | Accept `enqueue` prop, remove `useLocalStorage`, stay enabled always |
| `src/App.tsx` | Modify | Integrate queue hook, flex layout with QueuePanel, both submit+abort buttons visible |

---

### Task 1: Modify useDownload — rename callbacks, remove auto-retry

**Files:**
- Modify: `src/hooks/useDownload.ts`

- [ ] **Step 1: Update `UseDownloadProps` type and destructuring**

Change the type at line 26-30:

```ts
type UseDownloadProps = {
  onStart: () => void;
  onProgress: (progress: number, total: number) => void;
  onSuccess: () => void;
  onError: (error: string) => void;
};
```

Update the function signature at line 32:

```ts
export const useDownload = ({ onStart, onProgress, onSuccess, onError }: UseDownloadProps) => {
```

- [ ] **Step 2: Replace all `onDownload` calls with `onProgress`**

In `useDownload.ts`, rename the two calls from `onDownload(...)` to `onProgress(...)`:
- Line 83: `onProgress(json.fragment_count, json.fragment_count);`
- Line 85: `onProgress(json.fragment_index, json.fragment_count);`

- [ ] **Step 3: Replace the try/catch/finally block**

Replace lines 132-145 (the try/catch/finally block). The new structure:

```ts
        await waitForFfmpeg;
        await Promise.all([remove(`${dir}/${tsFilename}`), recordDownload(params.filename)]);
        onSuccess();
      } catch (e) {
        console.error(e);

        if (ctrl.current?.signal?.aborted) {
          // Aborted — no callback
        } else {
          onError(`${e}`);
        }
      } finally {
        setDownloading(false);
      }
```

Key changes:
- Add `onSuccess()` call after ffmpeg completes and download is recorded
- Remove the auto-retry `setTimeout(() => download(params), 100)` line
- Remove `onEnd()` call
- On non-abort error: call `onError`
- On abort: do nothing (no callback)

- [ ] **Step 4: Update useCallback dependency array**

Change line 147 from:

```ts
    [onStart, onDownload, onEnd],
```

To:

```ts
    [onStart, onProgress, onSuccess, onError],
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDownload.ts
git commit -m "refactor: rename useDownload callbacks, remove auto-retry

- onDownload → onProgress
- onEnd → onSuccess + onError
- Remove auto-retry setTimeout
- Abort fires no callback"
```

---

### Task 2: Create useDownloadQueue hook

**Files:**
- Create: `src/hooks/useDownloadQueue.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { type DownloadParams, useDownload } from '@/hooks/useDownload';

export type QueueItem = {
  id: string;
  url: string;
  filename: string;
  referer?: string;
  status: 'pending' | 'downloading' | 'failed';
  error?: string;
  addedAt: number;
};

type EnqueueParams = {
  url: string;
  filename: string;
  referer?: string;
};

const STORAGE_KEY = 'download-queue';

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export const useDownloadQueue = (opts: {
  onProgress: (progress: number, total: number) => void;
}) => {
  const [queue, setQueue] = useState<QueueItem[]>(loadQueue);
  const processingRef = useRef(false);
  const isFirstRender = useRef(true);

  const onStart = useCallback(() => {
    // no-op — queue hook manages state externally
  }, []);

  const onSuccess = useCallback(() => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.status !== 'downloading');
      saveQueue(next);
      return next;
    });
    processingRef.current = false;
  }, []);

  const onError = useCallback((error: string) => {
    setQueue((prev) => {
      const next = prev.map((item) =>
        item.status === 'downloading' ? { ...item, status: 'failed' as const, error } : item,
      );
      saveQueue(next);
      return next;
    });
    processingRef.current = false;
  }, []);

  const { downloading, download, abort: abortDownload } = useDownload({
    onStart,
    onProgress: opts.onProgress,
    onSuccess,
    onError,
  });

  const processNext = useCallback(
    (currentQueue: QueueItem[]) => {
      if (processingRef.current) return;

      const next = currentQueue.find((item) => item.status === 'pending');
      if (!next) return;

      processingRef.current = true;

      const updated = currentQueue.map((item) =>
        item.id === next.id ? { ...item, status: 'downloading' as const } : item,
      );
      setQueue(updated);
      saveQueue(updated);

      const params: DownloadParams = {
        url: next.url,
        filename: next.filename,
        ...(next.referer ? { referer: next.referer } : {}),
      };
      download(params);
    },
    [download],
  );

  // Auto-advance + mount recovery
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      const hasActive = queue.some((item) => item.status === 'downloading');
      if (hasActive) {
        // Reset crashed active download back to pending
        setQueue((prev) => {
          const next = prev.map((item) =>
            item.status === 'downloading' ? { ...item, status: 'pending' as const } : item,
          );
          saveQueue(next);
          return next;
        });
        return; // state update will re-trigger this effect
      }
    }

    if (!downloading && queue.length > 0) {
      const hasActive = queue.some((item) => item.status === 'downloading');
      const hasPending = queue.some((item) => item.status === 'pending');

      if (!hasActive && hasPending) {
        processNext(queue);
      } else if (!hasActive && !hasPending) {
        // Only failed items remain — no processing needed
        processingRef.current = false;
      }
    }
  }, [downloading, queue, processNext]);

  const enqueue = useCallback(
    (params: EnqueueParams) => {
      const item: QueueItem = {
        id: crypto.randomUUID(),
        url: params.url,
        filename: params.filename,
        referer: params.referer,
        status: 'pending',
        addedAt: Date.now(),
      };

      setQueue((prev) => {
        const next = [...prev, item];
        saveQueue(next);
        return next;
      });
    },
    [],
  );

  const cancel = useCallback((id: string) => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveQueue(next);
      return next;
    });
  }, []);

  const abort = useCallback(() => {
    abortDownload();
    // Remove active item after abort
    setQueue((prev) => {
      const next = prev.filter((item) => item.status !== 'downloading');
      saveQueue(next);
      return next;
    });
    processingRef.current = false;
  }, [abortDownload]);

  const retry = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const next = prev.map((item) =>
          item.id === id ? { ...item, status: 'pending' as const, error: undefined } : item,
        );
        saveQueue(next);
        return next;
      });
    },
    [],
  );

  const activeItem = queue.find((item) => item.status === 'downloading') ?? null;
  const pendingCount = queue.filter((item) => item.status === 'pending').length;

  return { queue, activeItem, pendingCount, enqueue, cancel, abort, retry, downloading };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDownloadQueue.ts
git commit -m "feat: add useDownloadQueue hook

Sequential queue with localStorage persistence.
Auto-advances to next download on success/failure.
Crash recovery resets active downloads to pending.
Forwards onProgress to useDownload."
```

---

### Task 3: Update App.tsx — integrate queue hook

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace imports**

Final imports:

```ts
import { useElementSize } from '@mantine/hooks';
import { ProgressBarStatus, getCurrentWindow } from '@tauri-apps/api/window';
import { relaunch } from '@tauri-apps/plugin-process';
import { DownloadIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';

import '@/App.css';
import DownloadForm from '@/components/download-form';
import QueuePanel from '@/components/queue-panel';
import SegmentProgress from '@/components/segment-progress';
import SettingsDialog from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { useDownloadQueue } from '@/hooks/useDownloadQueue';
```

- [ ] **Step 2: Replace hook usage and callbacks**

Replace the entire `App` function body:

```ts
function App() {
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(0);

  const onProgress = useCallback((value: number, t: number) => {
    setProgress(value);
    setTotal(t);
    updateProgress(Math.round((value * 100) / t));
  }, []);

  const { queue, activeItem, pendingCount, enqueue, cancel, abort, retry, downloading } =
    useDownloadQueue({ onProgress });

  // Sync taskbar progress with download state
  useEffect(() => {
    if (downloading) {
      updateProgress(-1); // indeterminate until first progress event
    } else {
      appWindow.setProgressBar({ status: ProgressBarStatus.None });
    }
  }, [downloading]);

  // Reset progress when active item changes
  useEffect(() => {
    if (activeItem) {
      setProgress(0);
      setTotal(0);
    }
  }, [activeItem?.id]);

  const dfId = useId();
  const { ref, width } = useElementSize();

  useEffect(() => {
    appWindow.show();
  }, []);

  return (
    <>
      <main className="flex h-screen w-screen gap-4 p-4">
        <div className={`flex flex-1 flex-col gap-4 ${queue.length > 0 ? 'max-w-[calc(100%-260px)]' : ''}`}>
          <DownloadForm id={dfId} enqueue={enqueue} />
          <div className="flex gap-2">
            <Button form={dfId} type="submit">
              <DownloadIcon />
              {downloading ? 'Add to Queue' : 'Download'}
            </Button>
            {downloading && (
              <Button variant="destructive" type="button" onClick={abort}>
                <SquareIcon fill="white" />
                Abort
              </Button>
            )}
            <SettingsDialog className="ms-auto" />
            <Button variant="secondary" onClick={relaunch}>
              <RotateCcwIcon />
              Restart
            </Button>
          </div>
          <ScrollArea className="min-h-0" ref={ref} nonce="huahC9gksP5zq3dBQmX97mb9m5FEyGCt">
            <SegmentProgress {...{ width, total, progress }} />
          </ScrollArea>
        </div>
        {queue.length > 0 && (
          <QueuePanel queue={queue} pendingCount={pendingCount} onCancel={cancel} onAbort={abort} onRetry={retry} />
        )}
      </main>
      <Toaster richColors />
    </>
  );
}
```

Key changes from original:
- `useDownloadQueue({ onProgress })` replaces `useDownload` — progress forwarded through queue hook
- Submit button always visible, text changes based on `downloading`
- Abort button shown alongside submit when downloading (not either/or toggle)
- Flex layout with max-width constraint when queue panel visible
- `onProgress` replaces `onDownload`, `onStart`/`onEnd` removed
- `activeItem?.id` effect resets progress between downloads

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate download queue into App layout

Flex layout with auto-show queue panel.
Submit + Abort both visible when downloading.
Taskbar progress syncs with download state."
```

---

### Task 4: Update DownloadForm — accept enqueue, stay enabled

**Files:**
- Modify: `src/components/download-form.tsx`

- [ ] **Step 1: Update imports**

Remove `useLocalStorage` import from `@mantine/hooks`. Change the `@/hooks/useDownload` import to only import types/schema. Final imports:

```ts
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { type DownloadParams, downloadParamsSchema } from '@/hooks/useDownload';
import { checkDownloaded } from '@/lib/downloads-db';
```

- [ ] **Step 2: Replace props type and component body**

Replace the entire `DownloadFormProps` type and component:

```ts
type DownloadFormProps = {
  id: string;
  enqueue: (params: { url: string; filename: string; referer?: string }) => void;
};

export default function DownloadForm(props: DownloadFormProps) {
  const { id, enqueue } = props;
  const form = useForm<DownloadParams>({
    resolver: standardSchemaResolver(downloadParamsSchema),
    defaultValues: { url: '', filename: '', referer: '' },
  });

  return (
    <Form {...form}>
      <form
        id={id}
        className="flex flex-col gap-6"
        autoComplete="off"
        onSubmit={form.handleSubmit((values) => {
          enqueue(values);
          form.reset({ url: '', filename: '', referer: '' });
        })}
      >
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl>
                <Input {...field} type="url" required />
              </FormControl>
              <FormDescription>The URL of the m3u8 file.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="filename"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Filename</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  required
                  onBlur={async (e) => {
                    field.onBlur();
                    const basename = e.target.value.trim();
                    if (basename) {
                      const already = await checkDownloaded(basename);
                      if (already) toast.warning(`"${basename}" has already been downloaded.`);
                    }
                  }}
                />
              </FormControl>
              <FormDescription>The output filename without extension. Saved as &lt;filename&gt;.mp4.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="referer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Referer</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Optional" />
              </FormControl>
              <FormDescription>The Referer header to send when downloading.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
```

Key changes:
- Removed `useLocalStorage` — form always starts empty, no persistence needed (queue handles that)
- Removed `busy` prop — form doesn't need to know download state
- Removed all `disabled` props from fields — form always editable
- `enqueue(values)` replaces `download(values)` — queue decides when to start
- `form.reset({ url: '', filename: '', referer: '' })` — empty strings, not undefined
- Removed `setValues` call — no localStorage persistence
- Submit handler is synchronous (no `async`) since `enqueue` returns void

- [ ] **Step 3: Commit**

```bash
git add src/components/download-form.tsx
git commit -m "feat: form stays enabled, calls enqueue, clears on submit

Remove useLocalStorage — queue handles persistence.
Remove disabled props — fields always editable.
Form clears to empty strings after enqueue."
```

---

### Task 5: Create QueuePanel component

**Files:**
- Create: `src/components/queue-panel.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { CircleSlashIcon, LoaderIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type QueueItem } from '@/hooks/useDownloadQueue';

type QueuePanelProps = {
  queue: QueueItem[];
  pendingCount: number;
  onCancel: (id: string) => void;
  onAbort: () => void;
  onRetry: (id: string) => void;
};

export default function QueuePanel({ queue, pendingCount, onCancel, onAbort, onRetry }: QueuePanelProps) {
  return (
    <div className="flex w-[240px] shrink-0 flex-col border-l">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold">Queue</span>
        {pendingCount > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {pendingCount}
          </span>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-2">
          {queue.map((item) => (
            <QueueRow key={item.id} item={item} onCancel={onCancel} onAbort={onAbort} onRetry={onRetry} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function QueueRow({
  item,
  onCancel,
  onAbort,
  onRetry,
}: {
  item: QueueItem;
  onCancel: (id: string) => void;
  onAbort: () => void;
  onRetry: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
        item.status === 'downloading'
          ? 'border-primary bg-primary/5'
          : item.status === 'failed'
            ? 'border-destructive/40 bg-destructive/5'
            : 'border-border bg-card'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {item.status === 'downloading' && <LoaderIcon className="size-3 animate-spin shrink-0" />}
        {item.status === 'failed' && <CircleSlashIcon className="size-3 shrink-0 text-destructive" />}
        <span
          className={`truncate ${item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
          title={item.error ?? item.filename}
        >
          {item.filename}
        </span>
      </div>
      {item.status === 'downloading' && (
        <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={onAbort} title="Abort">
          <XIcon className="size-3" />
        </Button>
      )}
      {item.status === 'pending' && (
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={() => onCancel(item.id)}
          title="Cancel"
        >
          <XIcon className="size-3" />
        </Button>
      )}
      {item.status === 'failed' && (
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 text-primary"
          onClick={() => onRetry(item.id)}
          title="Retry"
        >
          <LoaderIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/queue-panel.tsx
git commit -m "feat: add QueuePanel sidebar component

Right sidebar with active/pending/failed item rows.
Cancel, abort, retry actions per item."
```

---

### Task 6: Smoke test and fix

**Files:**
- May modify any file from Tasks 1-5

- [ ] **Step 1: Run the dev server**

```bash
yarn tauri dev
```

- [ ] **Step 2: Test single download (no queue)**

1. Enter URL + filename
2. Click Download
3. Verify progress bar works
4. Verify download completes
5. Verify audio normalization toast appears

- [ ] **Step 3: Test queue**

1. Start first download
2. While downloading, enter second URL + filename
3. Verify submit button now says "Add to Queue"
4. Click "Add to Queue"
5. Verify form clears to empty strings
6. Verify queue panel appears on right with 2 items
7. Verify first download completes, second starts automatically
8. Verify queue panel hides when empty

- [ ] **Step 4: Test cancel**

1. Start download, add 2 items to queue
2. Cancel a pending item — verify it disappears
3. Verify remaining items still process

- [ ] **Step 5: Test abort**

1. Start download
2. Click abort (appears alongside "Add to Queue" button)
3. Verify download stops, item removed from queue

- [ ] **Step 6: Test retry**

1. Enter an invalid URL
2. Download starts, fails
3. Verify item shows in queue as failed with error
4. Click retry
5. Verify it re-attempts

- [ ] **Step 7: Test persistence**

1. Add items to queue, start download
2. Close app (not minimize)
3. Reopen app
4. Verify queue items restored, processing resumes

- [ ] **Step 8: Fix any issues found, commit**

```bash
git add -u
git commit -m "fix: address queue smoke test issues"
```
