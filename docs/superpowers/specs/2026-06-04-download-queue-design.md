# Download Queue Design

Date: 2026-06-04

## Summary

Add a sequential download queue to the m3u8 downloader. Users can queue multiple URLs; downloads process one at a time in order. Queue persists across app restarts via localStorage.

## Requirements

- Sequential downloads (1 at a time)
- Queue persists across app restarts
- User actions: cancel (remove pending), abort (stop + discard active), retry (re-queue failed)
- Completed items removed from queue immediately
- Duplicate URLs allowed (with different filenames)
- Right sidebar panel, auto show/hide based on queue contents
- Form stays enabled during downloads, clears after each submit

## useDownload Changes

### Remove Auto-Retry

Current `useDownload` auto-retries on error (`setTimeout(() => download(params), 100)`). Remove this. Errors are reported, not retried.

### Rename Callbacks

Change `useDownload` props from:

```ts
{ onStart, onDownload, onEnd }
```

To:

```ts
{
  onStart: () => void
  onProgress: (progress: number, total: number) => void
  onSuccess: () => void
  onError: (error: string) => void
}
```

- `onProgress` — renamed from `onDownload` (clearer name)
- `onSuccess` — download completed normally (yt-dlp + ffmpeg both done)
- `onError` — download failed with error message
- `onEnd` removed — abort fires neither `onSuccess` nor `onError`
- Audio normalization toast preserved inside `useDownload` as-is
- IndexedDB download history recording preserved inside `useDownload` as-is

## Data Model

```ts
type QueueItem = {
  id: string          // crypto.randomUUID()
  url: string
  filename: string
  referer?: string
  status: 'pending' | 'downloading' | 'failed'
  error?: string      // error message if failed
  addedAt: number     // Date.now()
}
```

Queue stored as `QueueItem[]` in localStorage under key `"download-queue"`.

- First item with `status: 'downloading'` is the active download
- Remaining `pending` items wait in order
- `failed` items show retry button

## Hook Architecture

New `useDownloadQueue` hook wraps modified `useDownload`:

```ts
useDownloadQueue() → {
  queue: QueueItem[]
  activeItem: QueueItem | null    // currently downloading
  pendingCount: number
  enqueue(params: { url, filename, referer? }): void
  cancel(id: string): void        // remove pending item
  abort(): void                   // abort active, discard it, advance to next
  retry(id: string): void         // re-queue failed item
}
```

### Flow

1. `enqueue()` pushes item with `status: 'pending'`, saves to localStorage
2. If no `activeItem`, advance queue: set head to `'downloading'`, call `useDownload.download()`
3. On `onSuccess`: remove item from queue, advance to next `pending` item
4. On `onError`: set item `status: 'failed'` + store error message, advance to next `pending` item
5. `abort()` calls `useDownload.abort()`, removes active item entirely (not failed), advances queue
6. `retry(id)` sets failed item back to `'pending'`, advances if idle

### Directory Handling

`dir` read from localStorage at download time, not snapshot at enqueue. Matches current behavior — respects current settings.

### Persistence

- Every mutation writes full queue to localStorage
- On mount, read from localStorage and resume processing if queue has pending items
- Active download at crash time resets to `'pending'` (cannot resume mid-download)

## UI Components

### Layout (`App.tsx`)

- Flex row when queue has items: left (form + progress) + right (queue panel)
- Single column when queue empty (current layout)
- Transition smooth, no layout jump

### Queue Panel (`QueuePanel`)

- Fixed-width right sidebar (~240px)
- Auto-shows when queue non-empty, auto-hides when empty
- Header: "Queue" label + pending count badge
- Scrollable item list

### Queue Item Display

- **Active** (downloading): highlighted border, spinner, filename, abort ⏹ button
- **Pending**: filename, cancel ✕ button
- **Failed**: filename in red, error message, retry 🔄 button

### Form Behavior (`DownloadForm`)

- Form stays enabled at all times (fields never locked during download)
- Button text: "Download" when idle, "Add to Queue" when another download active
- Submit always calls `enqueue()` — hook decides whether to start immediately or queue
- Form clears after each submit (ready for next URL)
- Keep existing IndexedDB duplicate filename check as-is

## Error Handling

### Download Failure

- Set item `status: 'failed'`, store error message from yt-dlp/ffmpeg
- Do NOT auto-retry
- Advance to next pending item automatically

### Abort

- Abort during ffmpeg post-processing: kill ffmpeg process, remove item, advance
- Aborted items removed entirely (not marked failed) — intentional cancellation

### App Restart

- Read queue from localStorage on mount
- Resume processing head if pending items exist
- Crashed active download resets to `'pending'`

### Empty Queue

- Panel auto-hides
- Form returns to full-width layout
- Form button says "Download"

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/useDownload.ts` | Modify — remove auto-retry, rename callbacks |
| `src/hooks/useDownloadQueue.ts` | New — queue state management hook |
| `src/components/queue-panel.tsx` | New — right sidebar queue UI |
| `src/App.tsx` | Modify — flex layout, integrate queue hook |
| `src/components/download-form.tsx` | Modify — always-enabled form, enqueue instead of download |
