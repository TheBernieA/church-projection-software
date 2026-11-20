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
pnpm dist:mac:local     # a Mac installer (see "Building the installers" below for Windows and more)
```

> In VS Code's integrated terminal, run Electron commands as `env -u ELECTRON_RUN_AS_NODE pnpm dev`. VS Code sets that
> variable, and it makes Electron run as plain Node.

## Building the installers

How to make the installable apps: a `.dmg` for Mac and a setup `.exe` for Windows. Signing,
notarizing and building on GitHub are covered in [docs/packaging.md](docs/packaging.md).

### Part 1: Mac installers (on a Mac)

#### 1. One-time setup on a new Mac

1. Install **Node.js 22**: download "LTS" from https://nodejs.org and run the installer.
2. In Terminal, turn on pnpm (the project fixes the version itself):
   ```sh
   corepack enable
   ```
3. Get the project (it's a private repository, so sign in to GitHub when asked), on the branch
   you want to build (`git clone` alone gives the default branch, `develop`):
   ```sh
   git clone --branch redesign/show-workspace https://github.com/TheBernieA/church-projection-software.git
   cd church-projection-software
   ```

#### 2. Install the project's dependencies

From the project folder:

```sh
pnpm install
```

Run this again whenever you pull new changes.

#### 3. ffmpeg (streaming and recording) comes along

Nothing to do: `pnpm install` downloads ffmpeg for this Mac, and the build commands below put
it inside the app (you'll see `ffmpeg: packaged from ffmpeg-static` as they start). The one
exception: building the **Intel** installer on an Apple-silicon Mac. Its ffmpeg has to be an
Intel one, so put it (and its `LICENSE.txt`) in `resources/ffmpeg/mac-x64/` first, or build
that one on an Intel Mac. Without it, the build warns and the app can't stream or record.

#### 4. Optional: app icon and version

- **Icon:** a square 1024×1024 PNG at `apps/desktop/build/icon.png`. Without it, the app uses
  Electron's default icon.
- **Version:** `"version"` in `apps/desktop/package.json` (now `0.1.0`). The installer file
  names use it.

#### 5. Build

- For Apple-silicon Macs (M1 and later):
  ```sh
  pnpm dist:mac:local
  ```
- For Intel Macs:
  ```sh
  pnpm dist:mac:local:intel
  ```

Each takes about 1–3 minutes. The installers appear in `apps/desktop/release/<version>/`:

- `Lampstand-<version>-arm64.dmg`: Apple silicon
- `Lampstand-<version>.dmg`: Intel

#### 6. Install on a Mac

1. Double-click the `.dmg` and drag **Lampstand** into **Applications**.
2. The first time, right-click Lampstand in Applications and choose **Open**, then **Open**
   again. macOS asks because the app isn't notarized by Apple. If there's no Open button, go to
   **System Settings › Privacy & Security** and click **Open Anyway**.
3. When asked, allow the camera and microphone if you want to use them.

### Part 2: Windows installer (on a Windows PC)

#### 1. One-time setup

1. Install **Node.js 22 LTS** from https://nodejs.org (accept the defaults).
2. Install **Git** from https://git-scm.com/download/win (accept the defaults).
3. Open **PowerShell** (Start menu, type "PowerShell", press Enter), then:
   ```powershell
   corepack enable
   ```
   If that says "access denied", open PowerShell with **Run as administrator** for this one
   command.
4. Get the project:
   ```powershell
   cd $HOME\Documents
   git clone --branch redesign/show-workspace https://github.com/TheBernieA/church-projection-software.git
   cd church-projection-software
   ```
   `--branch` picks the branch to build; without it you get the default branch (`develop`),
   which may not have the latest work. Already cloned? `git checkout <branch>` then `git pull`.
   Or copy the project folder over from a Mac (leave out `node_modules` and
   `apps\desktop\release`).

#### 2. Install the project's dependencies

```powershell
pnpm install
```

#### 3. ffmpeg (streaming and recording) comes along

Nothing to do: `pnpm install` downloads the Windows ffmpeg, and `pnpm dist:win` puts it inside
the installer. You'll see `ffmpeg: packaged from ffmpeg-static` as the build starts; if the
download is missing, the build stops and says to run `pnpm install` again.

To check an installed copy has it, this file should exist:
`C:\Users\<you>\AppData\Local\Programs\Lampstand\resources\resources\ffmpeg\ffmpeg.exe`.

#### 4. Build

```powershell
pnpm dist:win
```

It takes about 2–4 minutes. The installer appears at
`apps\desktop\release\<version>\Lampstand Setup <version>.exe`.

If the build stops with **"Cannot create symbolic link"**, turn on Developer Mode
(**Settings › System › For developers › Developer Mode**; on Windows 10, **Settings › Update &
Security › For developers**) and build again. Running PowerShell as administrator also works.

#### 5. Install on a Windows PC

1. Double-click `Lampstand Setup <version>.exe`.
2. When Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
   That's because the installer isn't code-signed.
3. Choose where to install, then finish. Lampstand appears in the Start menu.

### Building the Windows installer on a Mac instead

1. Install Rosetta once (the Windows installer tool is an Intel program). In Terminal, enter
   your Mac password when asked:
   ```sh
   sudo softwareupdate --install-rosetta --agree-to-license
   ```
2. Put a Windows `ffmpeg.exe` (and its licence as `LICENSE.txt`) in
   `resources/ffmpeg/win-x64/`. On a Mac, `pnpm install` only downloads the Mac ffmpeg, so take
   the `.exe` from a Windows PC (`node_modules\ffmpeg-static\` after `pnpm install` there) or
   the ffmpeg website. Without it, the build warns and the app can't stream or record.
3. Build:
   ```sh
   pnpm dist:win
   ```

### Before sharing it widely

- **No install warnings:** sign with an Apple Developer ID and notarize (Mac, $99 a year), and
  use a code-signing certificate (Windows). See [docs/packaging.md](docs/packaging.md).
- **ffmpeg is GPL-licensed:** when sharing the app, keep its `LICENSE.txt` (the build copies it
  in) and point people to the ffmpeg source.
- **New versions:** for each release, change `version` in `apps/desktop/package.json` and build
  again.

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
  core/                domain schemas (Zod), CommandBus (undo/redo + audit), LiveStateStore, themes
  scripture/           reference parser (typed + spoken), formatting, navigation, slide splitting
  lyrics/              song text format, arrangements, slide building, hymnal conversion
  renderer/            Scene → DOM renderer: layers, auto-fit, transitions, background continuity, masks
  ipc-contract/        every IPC channel + Zod request schemas
  ui/                  design tokens + base components
resources/bibles/      bundled public-domain Bibles (`.lsbible`, built by scripts/buildBibleModules.mjs)
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
