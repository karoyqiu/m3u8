# yt-dlp + Concurrent Fragments Design

**Date:** 2026-05-20  
**Scope:** Replace FFmpeg sidecar with yt-dlp; use `--concurrent-fragments` for parallel HLS segment download; switch progress model from time-based to fragment-based.

---

## 1. Sidecar & Command

Replace `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` with `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`. No ffmpeg sidecar remains.

yt-dlp invocation:

```
yt-dlp
  --progress-template "download:%(progress)j"
  --newline
  --concurrent-fragments <N>
  --hls-use-mpegts
  --no-part
  -o <filename>
  [--referer <url>]
  <url>
```

- `--progress-template "download:%(progress)j"` — emits JSON progress object per line on stderr, prefixed with `download:`
- `--newline` — one progress line per update (not overwriting in place)
- `--concurrent-fragments <N>` — parallel HLS segment downloads; N comes from settings; if N is 0, pass 1 (yt-dlp has no auto/0 semantic)
- `--hls-use-mpegts` — native HLS concatenation, no ffmpeg remux needed
- `--no-part` — write output file directly, no `.part` intermediary

Output extension: `.ts` (MPEG-TS). Hash-generated filenames use `.ts` instead of `.mp4`. User-specified filenames are passed as-is.

---

## 2. Progress Parsing

Remove from `src/hooks/useDownload.ts`:
- `OUT_TIME_US` constant
- `DURATION` constant
- `parseDuration` function

Add:

```ts
const PROGRESS_PREFIX = 'download:';

ytdlp.stderr.on('data', (line) => {
  if (!line.startsWith(PROGRESS_PREFIX)) return;
  try {
    const json = JSON.parse(line.slice(PROGRESS_PREFIX.length));
    if (json.fragment_index != null && json.fragment_count != null) {
      props.onDownload(json.fragment_index, json.fragment_count);
    }
  } catch {}
});
```

`onDownload(progress, total)` signature is unchanged. Semantics shift: `progress` = `fragment_index`, `total` = `fragment_count`. No changes needed in `App.tsx`.

---

## 3. SegmentProgress

Single change in `src/components/segment-progress.tsx`:

```ts
// Before
const segments = Math.round(total / 3);
const value = Math.round(progress / 3);

// After
const segments = total;
const value = progress;
```

Each canvas block now represents one HLS fragment. All other rendering logic (grid layout, gap, colors, roundRect) is unchanged. With concurrent fragments, yt-dlp emits monotonically increasing `fragment_index`, so the grid fills correctly left-to-right.

---

## 4. Settings

Changes in `src/components/settings-dialog.tsx`:

- Label: `"Threads"` → `"Concurrent Fragments"`
- Description: `"Number of FFmpeg threads. 0 = auto."` → `"Number of fragments to download in parallel. Default: 1."`
- localStorage key `threads` unchanged (no migration required)

In `useDownload.ts`, `threads` value maps to `--concurrent-fragments` arg. Value 0 is passed as 1.

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/binaries/` | Remove ffmpeg exe, add yt-dlp exe |
| `src-tauri/tauri.conf.json` | Update sidecar name from `ffmpeg` to `yt-dlp` |
| `src/hooks/useDownload.ts` | Replace FFmpeg args + progress parsing with yt-dlp |
| `src/components/segment-progress.tsx` | Remove `/3` division |
| `src/components/settings-dialog.tsx` | Rename label + description |

---

## Out of Scope

- Multiple simultaneous downloads (queue system)
- yt-dlp cookie/auth support
- Non-HLS URL support
- Progress for non-fragment formats (percentage fallback)
