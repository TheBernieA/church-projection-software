# Lampstand

Church projection and live-production software for macOS and Windows: scripture, lyrics, media and backgrounds on any
number of screens, a stage display, and (coming next) speech-driven verse detection and streaming. Fully offline, with
no accounts and no telemetry.

`BUILD_SPEC.md` is the source of truth. This repository is at **Phase 0 (foundations) + Phase 1 (projection MVP)**; see
[Status](#status).

## Quick start

```sh
pnpm install
pnpm dev                 # run the app: UI hot-reloads; main-process changes restart the app automatically
pnpm verify              # typecheck + lint + unit/integration tests + security checklist
pnpm e2e                 # build, then Playwright-for-Electron end-to-end tests
pnpm --filter @lampstand/desktop dist:mac   # or dist:win — signed installers need certificates (see §17.6)
```

> In VS Code's integrated terminal, run Electron commands as `env -u ELECTRON_RUN_AS_NODE pnpm dev`. VS Code sets that
> variable, and it makes Electron run as plain Node.

## Layout

```
apps/desktop/          Electron app
  src/main/            main process — AppController, LiveStateStore wiring, WindowManager, IPC router,
                       storage (atomic JSON repos), Bible/hymnal package installer, protocols, security
  src/preload/         minimal contextBridge APIs (control = commands/queries, output = read-only)
  src/renderer/        control (React operator UI), output (projector), stage (speaker display)
  src/workers/search/  SearchWorker (utilityProcess, MiniSearch over Bibles + songs)
  e2e/                 Playwright for Electron
packages/
  core/                domain schemas (Zod), CommandBus (undo/redo + audit), LiveStateStore, EventBus, themes
  scripture/           reference parser (typed + spoken), formatting, navigation, slide splitting
  lyrics/              song text format, arrangements, slide building, hymnal conversion
  renderer/            Scene → DOM renderer: layers, auto-fit, transitions, background continuity, masks
  ipc-contract/        every IPC channel + Zod request schemas
  ui/                  design tokens + base components
resources/bibles/      bundled KJV (`.lsbible`, built by scripts/build-kjv-module.mjs)
docs/                  ADRs, package formats, smoke-test checklists
```

## Key ideas

- **Main process owns live state.** Every change is a validated Command on the CommandBus, whether it comes from the
  UI, a shortcut or later the remote/API. Outputs only render snapshots, so a control-UI crash never blanks the
  projector (covered by an E2E test).
- **One renderer everywhere.** Projector, stage, preview/program monitors and thumbnails all use `@lampstand/renderer`.
- **Preview (green) → Program (red).** Tally colours are reserved for those states only.
- **Bibles and hymnals are packages** installed from Settings → Bibles & hymnals, verified and validated before
  install (see `docs/module-format.md`). Only KJV is bundled.

## Keyboard

Space/Enter go live · ←/→ previous/next slide · F1–F5 clear text/media/background/overlays/all · B black · L logo ·
F freeze · Esc panic · ⌘/Ctrl+K quick bar (`jn 3 16`, `#23`, song words) · ⌘/Ctrl+Z undo · `?` all shortcuts (remappable).

## Status

| Phase | State |
|---|---|
| 0 — Foundations | Done: monorepo, strict TS, ESLint (strict-type-checked + security), Vitest, Playwright E2E, CI workflow, Electron hardening + fuses config, typed IPC, logging with secret scrubbing, settings, atomic file storage, i18n, design tokens |
| 1 — Projection MVP | Mostly done (see below) |
| 2 — Detection, 3 — Go Live, 4 — v1.0 polish | Not started |

Phase 1 is implemented: multi-display outputs with test patterns, hot-plug re-mapping, window/rehearsal mode and
respawn; the renderer (themes, auto-fit, transitions, video/generated backgrounds with continuity, masks, ticker);
preview/program, layer clearing and remappable shortcuts; KJV, the reference parser, quick bar, chapter browser and
full-text search; the song editor with sections and arrangements; hymnal packages with number lookup; the service
plan with drag-and-drop, templates, autosave and undo/redo; daily backups and library export/import; media import
with thumbnails; the stage display; the theme editor.

Phase 1 gaps:

- Video thumbnails rely on the OS thumbnailer (no FFmpeg yet); there is no codec probe or transcode.
- The performance budgets (search < 50 ms, 60 fps, < 600 MB) need measurement on reference hardware.
- Light-theme UI and RTL scripts are wired but untested.
- Not yet tested on Windows.
