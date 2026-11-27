# Lampstand

Church projection and live-production software for macOS and Windows: scripture, lyrics, media and backgrounds on any
number of screens, a stage display, streaming, and listening: scripture the preacher reads and voice commands ("next",
"show John 3:16"), recognised on the computer itself. Works offline, with no accounts and no telemetry; the optional
assistant (planning a service, structuring lyrics) uses Claude with the church's own key. See [docs/ai.md](docs/ai.md).

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
3. Install the tools for Lampstand's own ffmpeg (step 3 below): Apple's command-line tools, then
   [Homebrew](https://brew.sh) and two small programs:
   ```sh
   xcode-select --install
   brew install nasm pkgconf
   ```
4. Get the project (it's a private repository, so sign in to GitHub when asked), on the branch
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

#### 3. ffmpeg (streaming and recording) is built for you

The Mac installers carry Lampstand's own ffmpeg, built from source so it can stream securely
(the ready-made Mac downloads can't: YouTube's secure address stalls, and Facebook won't work).
The first `pnpm dist:mac…` builds it (`ffmpeg: building Lampstand's own…`, a few minutes per Mac
kind); later builds reuse it (`ffmpeg: using the one in resources/ffmpeg/mac-arm64/`). Either
kind of Mac builds both the Apple-silicon and the Intel one. To build it on its own:

```sh
bash apps/desktop/scripts/buildFfmpegMac.sh        # both kinds (or: arm64, x64)
```

If the build can't run (the tools from step 1 missing), the installer falls back on the
ready-made ffmpeg with a warning: everything works except secure streaming.

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

Nothing to do: the first `pnpm dist:win` downloads ffmpeg 9 for Windows (about 110 MB, a
pinned release of the build ffmpeg.org links to, checked against its checksum) and puts it
inside the installer; later builds reuse it. You'll see `ffmpeg: ffmpeg 9.0.2 →
resources/ffmpeg/win-x64/` (or `using ffmpeg 9.0.2…`) as the build starts. Without internet
the first time, it falls back on the older ffmpeg that `pnpm install` brought, with a warning.

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
2. Build (the Windows ffmpeg is downloaded on the Mac too, the first time):
   ```sh
   pnpm dist:win
   ```

### Before sharing it widely

- **No install warnings:** sign with an Apple Developer ID and notarize (Mac, $99 a year), and
  use a code-signing certificate (Windows). See [docs/packaging.md](docs/packaging.md).
- **ffmpeg is GPL-licensed:** when sharing the app, keep its `LICENSE.txt` (the build copies it
  in) and point people to the source: the Mac build's `SOURCES.txt`, next to it, lists exactly
  which sources it was built from.
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
