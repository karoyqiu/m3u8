# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Tauri 2 m3u8 downloader. React 19 + TS frontend, Rust backend, FFmpeg sidecar.

## Commands

```bash
yarn dev          # Vite dev server (frontend only)
yarn tauri dev    # Full Tauri dev (frontend + Rust)
yarn build        # tsc + Vite build
yarn tauri build  # Production native installer
yarn format       # Prettier src/
yarn lint         # Oxlint --fix
yarn ui           # shadcn add
```

No tests.

## Architecture

- `src/` — React SPA, Vite port 1420
  - `App.tsx` — root, window mgmt, taskbar progress
  - `components/download-form.tsx` — URL/filename form (react-hook-form + zod)
  - `components/segment-progress.tsx` — canvas progress grid (3s blocks)
  - `components/settings-dialog.tsx` — directory picker
  - `hooks/useDownload.ts` — FFmpeg sidecar, progress parsing
  - `components/ui/` — shadcn primitives
- `src-tauri/` — Rust. Plugin registration only (dialog, fs, shell, process, persisted-scope). No custom Tauri commands.
- `src-tauri/binaries/ffmpeg` — sidecar. Spawned via `Command.sidecar()`. Progress: stdout `out_time_us=`, duration: stderr `Duration:`.

## Key Patterns

- `@/` → `src/` (vite.config.ts + tsconfig.json)
- React Compiler via `babel-plugin-react-compiler`
- Tailwind CSS 4 (`@tailwindcss/vite`, not PostCSS)
- Forms: zod mini (`zod/v4-mini`) + `standardSchemaResolver`
- State: `localStorage` via `@mantine/hooks` — keys: `dir`, `url`
- Window: hidden on launch, `appWindow.show()` after mount

## Lint & Format

- Oxlint plugins: import, jsx-a11y, oxc, react, react-perf, typescript, unicorn
- Prettier: printWidth 100, singleQuote, import sort (`@trivago/prettier-plugin-sort-imports`), attribute organize
- Import order: `@/` first, then relative
