# Lampstand — Church Projection & Live Production Software
## Build Specification for AI Coding Agents

> **Working name:** Lampstand (rename freely — search/replace `lampstand` / `Lampstand`).
> **Document version:** 1.0
> **Target platforms:** macOS (Apple Silicon + Intel) and Windows 10/11 (x64, ARM64 later)
> **Language:** TypeScript (strict) end to end

---

## 0. How to use this document (instructions for the AI agent)

1. Read this entire document before writing code. Sections reference each other.
2. Build in the **phase order** in §20. Do not start a phase until the previous phase's acceptance criteria pass.
3. Every phase ends with: passing type-check, passing lint, passing unit tests, and a manual smoke-test checklist written to `docs/smoke-tests/phase-N.md`.
4. When this spec is ambiguous, choose the option that is (a) safest, (b) simplest, (c) easiest to extend later — in that order — and record the decision in `docs/adr/NNNN-title.md` (Architecture Decision Record, one short page each).
5. Never weaken a security rule in §17 to make something work. If a rule blocks a feature, stop and write an ADR describing the conflict.
6. Never add a network call, telemetry, or third-party service that is not listed in this spec.
7. Prefer small, typed, testable modules. No file over ~400 lines without a reason recorded in a comment at the top.
8. "Scalable" in this spec means: every subsystem sits behind an interface so it can later be swapped (file storage → SQLite → cloud sync; local accounts → logins; local speech model → cloud model) **without touching UI code**.

---

## 1. Product overview

### 1.1 What it is
A desktop application for churches and live events that:
- Projects **Bible verses, song lyrics, hymns, announcements, media and backgrounds** onto one or more screens (projector, TV, LED wall).
- Provides a **separate stage display** for the speaker/worship team (current slide, next slide, clock, timer, notes).
- Can **stream the service live** (to YouTube, Facebook, or any RTMP server) and record locally, compositing camera + lower-third scripture/lyrics.
- **Listens to the speaker** and automatically detects Bible references and quoted verses, then either **auto-projects** them or places them in an **approval queue** for the operator, depending on the operator's chosen mode.
- Runs **fully offline** after install. No account, no login, no database server.

### 1.2 Who uses it
- **Operator** — volunteer or tech lead in the booth. Often under time pressure, in a dark room, sometimes not technical. The UI must be impossible to misread: what is LIVE must always be obvious.
- **Speaker / worship leader** — sees the stage display only.
- **Congregation / online viewers** — see the output and stream only.

### 1.3 Product principles
1. **The live output never glitches.** Output rendering is isolated from the control UI; a crash or freeze in the control UI must not blank the projector.
2. **Nothing goes live by accident.** Preview → Program flow, clear tally colors, confirmations only where an action is destructive (not where it slows the operator down).
3. **Fast for the panicked volunteer.** Any verse reachable in under 3 seconds via keyboard (type `jn 3 16`, press Enter).
4. **Premium feel.** Smooth 60 fps transitions, considered typography, restrained motion, no clutter.
5. **Offline first, private by default.** Audio for speech detection is processed locally and never stored unless the operator explicitly enables recording.

### 1.4 Non-goals (for v1)
- User accounts, cloud sync, multi-site management (designed for, not built — see §6.5).
- Video editing.
- Acting as a full video switcher replacing OBS/vMix for complex productions (we provide a solid built-in stream path plus integrations with those tools).

---

## 2. Technology stack (decided)

| Concern | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** (latest stable, pinned) | Mature multi-window + multi-display support, Node APIs, same code on Mac/Windows, huge ecosystem. Tauri was considered; rejected because its backend is Rust and this project must stay JavaScript/TypeScript. |
| Build tooling | **electron-vite** + **Vite** | Fast HMR, separate main/preload/renderer builds. |
| Language | **TypeScript** `strict: true`, `noUncheckedIndexedAccess: true` | Safety at scale. |
| UI framework | **React 18+** | Ecosystem, hiring pool, AI agents know it well. |
| State (renderer) | **Zustand** (UI state) + main-process **LiveStateStore** as source of truth for anything that affects output | Avoids output state living in a UI window. |
| Styling | **Tailwind CSS** with design tokens as CSS variables + **Radix UI primitives** for accessible menus, dialogs, popovers | Accessible, unstyled primitives we theme ourselves. |
| Animation | **Framer Motion** (UI) ; CSS/WAAPI or a small custom engine for output transitions | Output transitions must not depend on React re-renders. |
| Validation | **Zod** | Every IPC message, file read, imported module and setting is schema-validated. |
| Search | **MiniSearch** (or FlexSearch) in a worker | In-memory full-text search, no database. |
| Speech-to-text | **whisper.cpp** via a Node binding (e.g. `smart-whisper` / `nodejs-whisper`) or **sherpa-onnx** running in an Electron **utilityProcess** | Fully offline, cross-platform. Do **not** rely on the Web Speech API — inside Electron it is unreliable/unsupported without Google API keys and it sends audio to the cloud. |
| Streaming/recording | **FFmpeg** (bundled LGPL build via a binary package such as `ffmpeg-static`, or a vetted custom LGPL build) spawned as a child process | Industry standard RTMP/RTMPS, hardware encoders (VideoToolbox, NVENC, QSV, AMF). |
| Packaging | **electron-builder** | DMG/ZIP (mac), NSIS (Windows), code-signing, notarization. |
| Updates | **electron-updater** with signed releases | Safe auto-update. |
| Tests | **Vitest** (unit), **Playwright for Electron** (E2E), **@testing-library/react** | |
| Lint/format | **ESLint** (typescript-eslint strict + react + security plugin) + **Prettier** | |
| Monorepo | **pnpm workspaces** | Shared packages between processes. |

**Version policy:** pin exact versions in `package.json`; use Renovate/Dependabot later. Run `pnpm audit` in CI.

---

## 3. Architecture

### 3.1 Process & window model

```
┌──────────────────────────────── MAIN PROCESS (Node) ────────────────────────────────┐
│  AppController                                                                       │
│  ├─ LiveStateStore  ◄── single source of truth for what is on every output           │
│  ├─ CommandBus      ◄── all mutations are Commands (undo/redo, logging, remote API)  │
│  ├─ WindowManager   ◄── creates/positions windows on displays, handles hot-plug      │
│  ├─ Repositories    ◄── Library, Bibles, Songs, Media, Themes, Services, Settings    │
│  ├─ ModuleManager   ◄── Bible/hymnal download, verify, install                       │
│  ├─ SecretStore     ◄── stream keys via Electron safeStorage                         │
│  └─ IPC Router      ◄── typed, validated channels only                               │
└──────────────┬──────────────────────┬──────────────────────┬────────────────────────┘
               │ utilityProcess        │ utilityProcess        │ child_process
      ┌────────▼────────┐    ┌─────────▼────────┐    ┌────────▼─────────┐
      │ SpeechWorker    │    │ SearchWorker     │    │ FFmpeg (stream/  │
      │ (whisper.cpp)   │    │ (MiniSearch idx) │    │  record)         │
      └─────────────────┘    └──────────────────┘    └──────────────────┘

 RENDERER WINDOWS (Chromium, sandboxed, no Node):
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐
  │ Control UI   │  │ Output #1..n │  │ Stage Display│  │ Stream Compositor │
  │ (operator)   │  │ (projector)  │  │ (speaker)    │  │ (hidden/offscreen)│
  └──────────────┘  └──────────────┘  └──────────────┘  └───────────────────┘

 LOCAL NETWORK (optional, off by default):
  Remote control web app (phone/tablet) ── HTTPS/WSS on LAN, PIN-paired
```

### 3.2 Key architectural rules
- **Main process owns live state.** Output windows subscribe to `LiveStateStore` snapshots/patches over IPC. The control UI sends **Commands**, never writes to outputs directly.
- **Every output (projector, stage, stream, remote preview) uses the same `@lampstand/renderer` package** to draw a `Scene`. One rendering engine → WYSIWYG everywhere.
- **Heavy work never runs in a renderer or the main thread**: speech → SpeechWorker, indexing/search → SearchWorker, encoding → FFmpeg.
- **Output windows are dumb and resilient**: if they lose IPC they keep showing the last frame; if they crash, WindowManager respawns them within 1 s and restores state.
- **Event-driven core**: internal `EventBus` with typed events (`live.changed`, `detection.found`, `stream.status`, …). Features plug in by subscribing — this is how future features (cloud sync, analytics, integrations) attach without editing core code.

### 3.3 Command pattern
All state mutations are commands:

```ts
interface Command<P = unknown> {
  type: string;                 // e.g. "live.goLive", "service.addItem"
  payload: P;                   // zod-validated
  source: 'ui' | 'remote' | 'auto-detect' | 'shortcut' | 'api' | 'midi';
  undoable: boolean;
}
```
Benefits: undo/redo, an audit log of what went live and why (useful for "why did that verse appear?"), the same command used by UI, keyboard shortcuts, remote phone, Stream Deck, and HTTP API.

### 3.4 Preview / Program model (broadcast convention)
- **Preview** (green tally): what the operator is preparing.
- **Program / Live** (red tally): what is on screen.
- `Go Live` (Space/Enter) moves Preview → Program with the selected transition.
- Optional "**Live editing**" mode where clicking a slide sends it straight to program (many churches prefer this for lyrics). Setting per service item type.

### 3.5 Output layers (from bottom to top)
1. **Background layer** — color, gradient, image, video, motion loop, live camera.
2. **Media layer** — full-screen video/image/PDF page/presentation slide.
3. **Content layer** — scripture, lyrics, text slides.
4. **Overlay layer** — lower third, logo bug, countdown, alert/ticker (e.g. "Parent of child #42, please come to nursery").
5. **Mask layer** — black, logo screen, freeze.

Each layer can be cleared independently. Standard shortcuts:
`F1` clear content, `F2` clear media, `F3` clear background, `F4` clear overlays, `F5` clear all, `B` black screen, `L` logo, `Esc` panic (clear all but background).

---

## 4. Repository structure

```
lampstand/
├─ apps/
│  ├─ desktop/                  # Electron app
│  │  ├─ src/main/              # main process
│  │  │  ├─ app/                # AppController, lifecycle, single-instance lock
│  │  │  ├─ commands/           # command handlers, one file per domain
│  │  │  ├─ ipc/                # typed router, channel definitions
│  │  │  ├─ live/               # LiveStateStore, transitions timing
│  │  │  ├─ windows/            # WindowManager, display detection
│  │  │  ├─ storage/            # FileStore, repositories, migrations
│  │  │  ├─ modules/            # Bible/hymnal module manager
│  │  │  ├─ speech/             # SpeechService (talks to SpeechWorker)
│  │  │  ├─ streaming/          # StreamService, FFmpeg supervisor
│  │  │  ├─ remote/             # LAN remote server (off by default)
│  │  │  ├─ security/           # CSP, permission handlers, protocol handlers
│  │  │  └─ updater/
│  │  ├─ src/preload/           # contextBridge APIs, one per window type
│  │  ├─ src/renderer/
│  │  │  ├─ control/            # operator UI (React)
│  │  │  ├─ output/             # projector window
│  │  │  ├─ stage/              # stage display
│  │  │  └─ compositor/         # stream compositor
│  │  └─ src/workers/
│  │     ├─ speech/             # utilityProcess entry
│  │     └─ search/             # utilityProcess entry
│  └─ remote-web/               # phone/tablet remote (static SPA served on LAN)
├─ packages/
│  ├─ core/                     # domain types, zod schemas, pure logic (no Electron)
│  ├─ renderer/                 # Scene → DOM renderer, text fitting, transitions
│  ├─ scripture/                # reference parser, book names, versification, formatting
│  ├─ detection/                # transcript → candidate verse matching
│  ├─ lyrics/                   # song parsing, importers (OpenLyrics, ChordPro, txt)
│  ├─ ui/                       # design system components + tokens
│  └─ ipc-contract/             # shared channel names + zod schemas
├─ resources/
│  ├─ bibles/                   # bundled KJV only (see §8.2)
│  ├─ hymns/                    # bundled public-domain hymnal
│  ├─ backgrounds/              # bundled royalty-free backgrounds
│  ├─ fonts/                    # bundled OFL fonts
│  └─ models/                   # optional bundled small speech model
├─ docs/
│  ├─ adr/
│  ├─ smoke-tests/
│  └─ module-format.md
└─ scripts/                     # build, sign, module packaging tools
```

**Rule:** `packages/*` must not import Electron. They are pure TypeScript and fully unit-testable. This also lets them be reused by a future web or mobile version.

---

## 5. Core domain model (in `packages/core`)

All IDs are UUID v7 strings (time-sortable). All entities carry `schemaVersion` for migrations. All schemas defined with Zod; TypeScript types inferred from them.

```ts
type ID = string;

interface EntityMeta {
  id: ID;
  schemaVersion: number;
  createdAt: string;   // ISO 8601
  updatedAt: string;
}

// ---------- Scripture ----------
interface BibleVersionInfo {
  id: string;                 // "kjv", "web", "bsb"
  name: string;               // "King James Version"
  abbreviation: string;       // "KJV"
  language: string;           // BCP-47, e.g. "en", "yo", "fr"
  direction: 'ltr' | 'rtl';
  versification: 'kjv' | 'lxx' | 'vulgate' | 'custom';
  license: { kind: 'public-domain' | 'licensed' | 'permission'; text: string; url?: string };
  copyrightLine?: string;     // shown on slides when license requires it
  source: 'bundled' | 'downloaded' | 'imported';
  checksumSha256: string;
  moduleVersion: string;
}

interface VerseRef { book: BookId; chapter: number; verse: number }
interface PassageRef { start: VerseRef; end: VerseRef }  // ranges, cross-chapter allowed
type BookId = 'GEN' | 'EXO' | /* … USFM 3-letter codes … */ 'REV';

// ---------- Songs ----------
interface Song extends EntityMeta {
  title: string;
  alternateTitles: string[];
  authors: string[];
  copyright?: string;
  ccliNumber?: string;        // for CCLI reporting
  hymnNumber?: { hymnalId: string; number: string }[];
  key?: string; tempo?: number;
  sections: SongSection[];    // verse 1, chorus, bridge…
  arrangements: Arrangement[];// ordered list of section ids, e.g. V1 C V2 C B C C
  defaultArrangementId: ID;
  tags: string[];
  themeId?: ID;               // optional per-song theme
  language?: string;
  translations?: Record<string, SongSection[]>; // bilingual lyrics
}
interface SongSection { id: ID; kind: 'verse'|'chorus'|'pre-chorus'|'bridge'|'tag'|'intro'|'outro'|'ending'|'other'; label: string; lines: string[] }
interface Arrangement { id: ID; name: string; sectionOrder: ID[] }

// ---------- Presentation ----------
interface Slide { id: ID; elements: SlideElement[]; notes?: string; backgroundOverride?: BackgroundRef }
type SlideElement = TextElement | ImageElement | VideoElement | ShapeElement;

interface Theme extends EntityMeta {
  name: string;
  appliesTo: ('scripture'|'lyrics'|'text'|'lower-third')[];
  canvas: { width: number; height: number };   // logical units, default 1920×1080
  safeArea: { top: number; right: number; bottom: number; left: number }; // %
  text: TextStyle; reference: TextStyle;       // verse text vs "John 3:16 (KJV)"
  background: BackgroundRef;
  layout: 'center' | 'lower-third' | 'top' | 'split' | 'custom';
  autoFit: { enabled: boolean; minSize: number; maxSize: number };
  transition: TransitionSpec;
}
interface TextStyle {
  fontFamily: string; fontWeight: number; fontSize: number; lineHeight: number;
  letterSpacing: number; color: string; align: 'left'|'center'|'right'|'justify';
  shadow?: { x: number; y: number; blur: number; color: string };
  outline?: { width: number; color: string };
  backgroundBox?: { color: string; padding: number; radius: number }; // readability
  textTransform?: 'none'|'uppercase';
}
interface TransitionSpec { kind: 'cut'|'fade'|'dissolve'|'slide'|'zoom'|'blur'; durationMs: number; easing: string }

// ---------- Service plan (playlist) ----------
interface ServicePlan extends EntityMeta {
  name: string; date?: string;
  items: ServiceItem[];
}
type ServiceItem =
  | { id: ID; kind: 'song'; songId: ID; arrangementId?: ID; themeId?: ID }
  | { id: ID; kind: 'scripture'; passage: PassageRef; versionIds: string[]; themeId?: ID }
  | { id: ID; kind: 'media'; mediaId: ID; loop: boolean; autoAdvance: boolean }
  | { id: ID; kind: 'presentation'; slides: Slide[] }
  | { id: ID; kind: 'announcements'; slides: Slide[]; loopIntervalSec: number }
  | { id: ID; kind: 'countdown'; target: string | { durationSec: number }; themeId?: ID }
  | { id: ID; kind: 'header'; label: string };  // visual divider, e.g. "Sermon"

// ---------- Live state ----------
interface LiveState {
  revision: number;                       // increments on every change
  outputs: Record<OutputId, OutputState>;
  preview: SceneRef | null;
  program: SceneRef | null;
  masks: { black: boolean; logo: boolean; freeze: boolean };
  overlays: OverlayState[];
  detection: DetectionState;
  stream: StreamStatus;
}

// ---------- Detection ----------
interface DetectionCandidate {
  id: ID;
  detectedAt: string;
  transcriptSnippet: string;
  kind: 'explicit-reference' | 'quoted-text' | 'lyric-line';
  passage?: PassageRef;
  versionId?: string;          // which version the quoted text matched best
  confidence: number;          // 0..1
  status: 'pending' | 'approved' | 'rejected' | 'auto-projected' | 'expired';
}
```

---

## 6. Storage (no database) — file-based, swappable

### 6.1 Approach
- All data lives in the OS app-data directory (`app.getPath('userData')`):
  - macOS: `~/Library/Application Support/Lampstand/`
  - Windows: `%APPDATA%\Lampstand\`
- User-visible **library folder** (configurable, defaults to `Documents/Lampstand Library`) for songs, media, themes, services — so churches can back it up or share it via Dropbox/OneDrive/USB.

```
Lampstand Library/
├─ songs/            <uuid>.song.json        (one file per song)
├─ services/         <uuid>.service.json
├─ themes/           <uuid>.theme.json
├─ media/            originals + media/.thumbs/
├─ backgrounds/
└─ library.manifest.json     (schema version, created-with app version)

userData/
├─ settings.json
├─ bibles/           <id>/  (module files, see §8)
├─ hymnals/          <id>/
├─ models/           speech models
├─ cache/            search indexes (rebuildable, safe to delete)
├─ logs/             rotating logs
└─ backups/          automatic snapshots
```

### 6.2 Rules for file storage
- **Atomic writes:** write to `file.tmp`, `fsync`, then `rename` over the original. Never leave half-written JSON.
- **Validate on read** with Zod. Invalid file → move to `quarantine/`, log, notify user non-intrusively; never crash.
- **Migrations:** each entity has `schemaVersion`; `storage/migrations/` holds pure functions `vN → vN+1`. Run on read, persist on next write.
- **Debounced autosave** (500 ms) + save on blur/quit. Crash recovery: on start, detect `.tmp` files and unsaved-session journal.
- **In-memory indexes** built at startup (in SearchWorker) and cached to `cache/` with a content hash so startup stays fast with 10k+ songs.
- **File watching** (chokidar) on the library folder so external edits/shared folders refresh live.
- **Automatic backups:** daily zip snapshot of the library (keep last 14), plus manual "Export library" / "Import library".

### 6.3 Repository interface (the key to scalability)
```ts
interface Repository<T extends EntityMeta> {
  get(id: ID): Promise<T | null>;
  list(query?: ListQuery): Promise<T[]>;
  upsert(entity: T): Promise<T>;
  remove(id: ID): Promise<void>;
  watch(cb: (change: RepoChange<T>) => void): Unsubscribe;
}
```
v1 implementation: `JsonFileRepository<T>`. Later: `SqliteRepository<T>` or `CloudSyncRepository<T>` — **no UI or command code changes required.** Write repository contract tests once and run them against every implementation.

### 6.4 Settings
- `settings.json` validated by a Zod schema with defaults; unknown keys preserved.
- Secrets (stream keys, remote-control PIN hash) are **never** in settings.json — stored via `SecretStore` (Electron `safeStorage`, which uses macOS Keychain / Windows DPAPI).

### 6.5 Future: accounts & sync (design only, do not build)
- Add `ownerId` / `orgId` fields as optional now so data doesn't need reshaping later.
- `SyncEngine` would subscribe to repository change events and push/pull; conflict resolution by `updatedAt` + per-field merge for songs.

---

## 7. Output rendering engine (`packages/renderer`)

### 7.1 Scene model
A `Scene` is a pure description (layers + elements + theme). The renderer turns it into DOM (absolutely positioned, GPU-composited layers). The same `Scene` renders in: operator thumbnails, preview, program, output windows, stage display, stream compositor, remote app.

### 7.2 Requirements
- **Logical canvas** 1920×1080 by default, scaled to any output resolution with `transform: scale()`; support 4K, ultra-wide LED walls, portrait screens, and custom sizes per output.
- **Auto-fit text**: binary-search the font size between min/max so text fits the safe area. Measure off-screen with the same font. Cache results per (text, theme, size).
- **Smart verse splitting**: long passages split into multiple slides at sentence/clause boundaries, never mid-word; option "one verse per slide" or "fit as many as possible".
- **Transitions**: cross-fade between two stacked layer instances using CSS opacity/transform only (GPU-friendly). 60 fps target. No layout-triggering properties during animation.
- **Video backgrounds**: `<video>` with hardware decoding, seamless loop, keep playing across slide changes (background continuity — the background must NOT restart when lyrics change).
- **Font loading**: all fonts bundled locally and preloaded before first render; render waits on `document.fonts.ready` to avoid flashes.
- **Readability helpers**: text shadow, outline, background box, automatic background dimming option.
- **Right-to-left & complex scripts** supported (Arabic, Hebrew, Amharic, etc.) — use `dir` attributes and proper fonts.

### 7.3 Output windows
- `WindowManager` lists displays (`screen.getAllDisplays()`), lets the operator assign roles: Main Output, Stage Display, Secondary Output (e.g. lobby TV showing lyrics with a different theme), None.
- Output windows: frameless, fullscreen on assigned display, `backgroundThrottling: false`, cursor hidden, no menu.
- **Hot-plug**: when a projector is connected/disconnected, re-map automatically using the saved display fingerprint (resolution + position + name); never put the output window on the operator's main screen without asking.
- **Test pattern** button per output (color bars + resolution + display name) for setup.
- Optional **"Window mode"** for outputs (for use as a capture source in OBS or for single-screen testing).

---

## 8. Bible module

### 8.1 Module format (own, versioned, documented in `docs/module-format.md`)
A Bible module is a `.lsbible` file (zip) containing:
```
manifest.json           # BibleVersionInfo + file list + per-file sha256
books/GEN.json ...      # { book, chapters: [ [ "verse 1 text", "verse 2 text", ... ], ... ] }
headings.json           # optional section headings
footnotes.json          # optional
signature.sig           # Ed25519 signature over manifest.json (for official catalog modules)
```
- Store per-book JSON so loading one chapter doesn't parse the whole Bible.
- Text uses a minimal markup for red letters (`<wj>`), italics for added words (`<add>`), small caps for LORD (`<nd>`). Renderer maps these to styles; users can toggle them.
- Versification maps convert references between systems (e.g. Psalms numbering differences).

### 8.2 Bundled versions and licensing (IMPORTANT — read before shipping)
- **KJV**: public domain in most countries. (Note: in the United Kingdom the KJV is under Crown copyright administered by Cambridge University Press; include the standard notice.) Safe to bundle.
- **KJV is the only bundled version in v1.** Do not bundle, download, or reference any other copyrighted translation in code, fixtures, or the catalog. Every other version comes through the download catalog (§8.3) or user import.
- The bundling pipeline must still be generic (any module dropped into `resources/bibles/` with a valid manifest is bundled), so adding a second bundled version later is a content change, not a code change.
- Whenever a projected or streamed version's manifest has a `copyrightLine`, display it per its license rules.
- Use a reputable, verifiable source text for each version and record its provenance (source URL, date, checksum) in the module manifest.

### 8.3 Downloadable versions
- **Catalog**: a signed JSON catalog hosted on a static URL the owner controls (e.g. GitHub Releases / a CDN). App fetches it only when the user opens "Get more Bibles" — no background calls.
- Start the catalog with clearly redistributable texts, e.g. World English Bible (WEB), American Standard Version (ASV), Berean Standard Bible (BSB, released to public domain), Young's Literal Translation, plus public-domain translations in other languages (e.g. Louis Segond 1910 French, Reina-Valera 1909 Spanish, Luther 1912 German, Almeida (older editions) Portuguese, and available public-domain African-language editions). **Verify each license before adding.**
- Modern copyrighted translations (NIV, ESV, NKJV, NLT, AMP…) require licensing agreements with the publishers. Architect for it (`license.kind: 'licensed'`, optional license key field, per-version display rules like max verses per slide) but do not include them.
- **Download flow**: fetch → verify size limit → verify SHA-256 from catalog → verify Ed25519 signature with public key compiled into the app → extract to temp dir with **zip-slip protection** → validate every JSON with Zod → atomic move into `bibles/<id>/` → build search index in SearchWorker → notify UI. Show progress; resumable downloads.
- **Import from file**: allow importing user-provided modules (e.g. a church's own licensed copy) from `.lsbible`, OSIS XML, USFM, Zefania XML, or a simple CSV/JSON. Unsigned imports are allowed but marked "Imported" and still fully validated.

### 8.4 Scripture reference parser (`packages/scripture`)
Must handle typed **and** spoken forms:
- `John 3:16`, `Jn 3.16`, `jn3 16`, `1 Cor 13:4-7`, `1st Corinthians 13 4 to 7`, `First Corinthians chapter thirteen verses four through seven`, `Ps 23`, `Psalm 119:105`, `Romans 8:28, 31-39`, `Gen 1:1-2:3`, `Song of Songs` = `Song of Solomon` = `Canticles`.
- Book-name aliases table per language (start with English; structure for French, Spanish, Portuguese, Yoruba, Igbo, Hausa, Swahili, Twi, etc. so localized churches can add them).
- Spoken number words → digits (`twenty-three` → 23, `one hundred and nineteen` → 119).
- Ambiguity handling: return ranked candidates with confidence (e.g. "John" vs "1 John").
- 100% unit-test coverage of the parser with a large table of fixtures. This is the heart of the quick-search and auto-detect features.

### 8.5 Scripture features
- **Quick bar** (`Ctrl/Cmd+K` or just start typing): `jn 3 16` → instant preview. Arrow keys move verse by verse; `Shift+→` extends range.
- **Full-text search** across installed versions ("for God so loved") with ranking, phrase matching, typo tolerance.
- **Multi-version display**: side-by-side or stacked (e.g. KJV + local-language version), each with its own label.
- **Verse history** for the service and **"Sermon prep" list**: speaker's verses entered before the service, queued in order.
- **Display options**: show reference at top/bottom, include version abbreviation, verse numbers on/off, red letters on/off, one verse per slide.
- **Cross-references** and **chapter browser** in the control UI (not on output).

---

## 9. Lyrics & hymnal

### 9.1 Song library
- Create/edit songs in a fast **plain-text editor** with section markers:
  ```
  [Verse 1]
  Amazing grace how sweet the sound
  That saved a wretch like me

  [Chorus]
  ...
  ```
  Live preview of slides as you type. Automatic slide splitting by blank lines or max lines-per-slide.
- **Arrangements**: drag sections into order (V1 C V2 C B C C); multiple named arrangements per song.
- **Search** by title, first line, any lyric line, author, CCLI number, hymn number, tag.
- **Importers** (`packages/lyrics`): plain text, OpenLyrics XML, ChordPro (strip chords for display, keep for musician view), OpenSong, and common exports from other presentation software where formats are documented. Report import results (imported / skipped / errors) clearly.
- **Exporters**: OpenLyrics, plain text, JSON.
- **Bilingual lyrics**: show two languages on one slide (common in multilingual congregations).
- **Musician/stage view**: chords visible on stage display only.

### 9.2 Hymnal
- Hymnal = a collection of songs with numbers (`hymnNumber`). Ship one **public-domain hymnal collection** (classic hymns whose words are public domain — verify each; many popular hymns from before 1929 are safe in the US).
- Jump by number: type `h 23` or `#23` in the quick bar.
- Downloadable hymnal modules (`.lshymnal`, same verification pipeline as Bibles).
- Many denominational hymnals are copyrighted; support importing a church's licensed copy, never bundle without permission.

### 9.3 CCLI & licensing support
- Store CCLI song number and copyright; optional "show copyright on first/last slide" with the church's CCLI license number from settings.
- **Usage report**: count of songs projected/streamed per period, exportable CSV to help with CCLI reporting.

---

## 10. Automatic quotation detection (speech → scripture)

### 10.1 Pipeline
```
Audio input (mic / mixer / virtual audio device)
   │  getUserMedia in a hidden renderer or native capture → 16 kHz mono PCM
   ▼
Voice Activity Detection (Silero VAD via ONNX, or energy-based fallback)
   ▼
SpeechWorker (utilityProcess): streaming whisper.cpp / sherpa-onnx
   │  rolling window (e.g. 5–8 s with overlap), partial + final transcripts
   ▼
DetectionEngine (packages/detection)
   ├─ A. Explicit reference detector  → scripture parser on transcript
   │     ("turn with me to John chapter 3 verse 16")
   ├─ B. Quoted-text detector          → fuzzy match transcript n-grams against
   │     verse index of installed versions (speaker reads without saying the reference)
   └─ C. (optional) Lyric-line detector → match against current service songs
   ▼
Candidate scoring + de-duplication + cooldown
   ▼
DetectionQueue (main) → mode router
   ├─ AUTO mode: confidence ≥ autoThreshold → Command("live.goLive", source:'auto-detect')
   ├─ APPROVE mode: push to approval queue in UI (toast + queue panel)
   └─ SUGGEST-ONLY mode: show in a side list, never auto-anything
```

### 10.2 Detection details
- **A. Explicit references**: highest confidence. Handle "verse 16 … and verse 17", "let's continue to verse 18", "same chapter verse 20" by keeping **context** (current book/chapter from last detection).
- **B. Quoted text**:
  - Pre-built index of normalized verse text (lowercase, punctuation stripped, number words normalized) per installed version.
  - Candidate retrieval via n-gram/shingle overlap (MiniSearch or custom inverted index), then re-rank with token-level similarity (e.g. Jaro-Winkler / Levenshtein on word sequences, longest common subsequence ratio).
  - Require minimum matched length (e.g. ≥ 6 consecutive-ish words) to avoid false positives on common phrases ("the Lord is").
  - Detect **which version** the speaker is reading from by comparing scores across versions; if the operator pinned a "sermon version", prefer it.
  - **Future (designed for, behind interface `SemanticMatcher`)**: local sentence-embedding model (e.g. via transformers.js / ONNX) for paraphrased quotes.
- **Scoring**: combine detector confidence, transcript confidence, recency, context continuity, and whether the passage is in the pre-loaded "sermon verses" list (boost).
- **Cooldown & dedupe**: same passage not re-suggested within N seconds; consecutive verses merge into a range.
- **Timeout**: pending suggestions expire after configurable time (default 60 s).

### 10.3 Operator controls (must feel instant and trustworthy)
- Mode switch in the top bar, always visible: **Off · Suggest · Approve · Auto**.
- Auto threshold slider (default high, e.g. 0.9) — anything below threshold falls back to Approve.
- Approval queue panel: each card shows the transcript snippet, matched passage, version, confidence bar; actions **Show now** (Enter), **Send to preview**, **Dismiss** (Backspace), **Edit range**.
- Global hotkeys for approving the newest suggestion without touching the mouse.
- "**Don't suggest this again today**" for false positives.
- Audio input selector, live input level meter, model selector (tiny/base/small — speed vs accuracy), language selector, test mode with a sample audio file.
- Transcript panel (optional) showing live text — doubles as a **live captions** feature (§16).

### 10.4 Performance & privacy
- Target: detection within **1.5–3 s** of the speaker finishing the reference on a mid-range laptop with the "base" model; GPU/Metal acceleration where the binding supports it.
- Models downloaded on demand with checksum verification (not bundled, except optionally the smallest).
- Audio is processed in memory and discarded. No audio or transcript leaves the machine. Saving transcripts is an explicit opt-in setting.
- Speech worker crash → auto-restart, show a small warning, never affect output.

---

## 11. Go Live (streaming & recording)

### 11.1 Modes
1. **Built-in streaming** (simple path for small churches):
   - Stream Compositor window (hidden, offscreen) composes: camera input (USB/capture card via `getUserMedia`) or the program output + optional lower-third scripture/lyrics overlay + logo bug.
   - Capture via `canvas.captureStream(30|60)` / `MediaStreamTrack` + audio from selected input (mixer feed).
   - Encode: pipe to **FFmpeg** child process (prefer raw frames or MediaRecorder chunks into FFmpeg stdin) → H.264 + AAC → RTMP/RTMPS.
   - Hardware encoder auto-detection: `h264_videotoolbox` (mac), `h264_nvenc` / `h264_qsv` / `h264_amf` (Windows); fallback `libx264` veryfast.
   - Destinations: YouTube, Facebook, custom RTMP(S). Multiple destinations simultaneously (FFmpeg `tee` muxer) as a later feature.
   - Local recording (MP4/MKV) simultaneously or alone.
   - Presets: 720p30 (2.5–4 Mbps), 1080p30 (4.5–6 Mbps), 1080p60 (6–9 Mbps).
2. **Integration path** (for churches already using OBS/vMix/ATEM):
   - **Alpha/key output**: a dedicated output with transparent or green/chroma background showing only lyrics/scripture lower-thirds, so OBS can key it over the camera.
   - **Browser source URL** on localhost (`http://127.0.0.1:<port>/overlay?token=…`) rendering the same scene for OBS browser sources.
   - **NDI output** (later phase — requires NDI SDK licensing review; behind feature flag).

### 11.2 Stream UX
- "Go Live" button in top bar, with a pre-flight checklist sheet: destination, stream key present, audio level present, encoder test, bitrate, internet upload speed test (to the RTMP ingest only).
- Live status pill: duration, bitrate, dropped frames, CPU, encoder, connection health; red when live.
- Auto-reconnect with exponential backoff on network drop; keep local recording going.
- Stop requires confirmation (hold-to-stop or confirm dialog) — ending a stream by accident is costly.
- Stream keys stored only via SecretStore; never logged; masked in UI with reveal-on-hold.
- Supervisor: FFmpeg process monitored; stderr parsed for stats; zombie process cleanup on app quit/crash.

### 11.3 Separate stream look
Projector and stream usually need different designs (full-screen lyrics in the room vs lower-third lyrics on stream). Each output (projector, stream, stage, secondary) can map content types to a different theme: **"Output profiles."**

---

## 12. Backgrounds & media

- **Bundled library**: curated set of high-quality, royalty-free still and motion backgrounds (verify licenses; prefer CC0 or commissioned). Categories: Worship, Scripture, Seasonal (Christmas, Easter, Advent, Pentecost), Abstract, Nature, Solid/Gradient.
- **User media**: drag & drop images (JPG, PNG, WebP, HEIC→convert), video (MP4/H.264, HEVC where supported, WebM, MOV), audio (MP3, AAC, WAV), PDFs (page-by-page slides via pdf.js), PowerPoint (export to images/PDF — see §16).
- **Media processing** (in a worker/FFmpeg): thumbnail generation, duration, codec probe, warn on codecs that won't play smoothly and offer one-click transcode to a playback-friendly format.
- **Background controls**: per-item, per-theme, or global; playback speed; blur; dim/brightness; color overlay; Ken Burns slow zoom for still images.
- **Background continuity**: changing slides never restarts a looping background unless the background itself changes; cross-fade between different backgrounds.
- **Media items**: play/pause/scrub, loop, mark in/out, volume, audio output device selection, auto-advance to next item.
- **Generated backgrounds**: animated gradients/particles rendered in-engine (WebGL/Canvas) — lightweight, infinite, resolution-independent.
- Media served to renderers via a **custom secure protocol** (`lampstand-media://<id>`) that only resolves IDs in the library — never arbitrary file paths (§17).

---

## 13. Themes & text

- **Theme editor** with live preview on real content (a long verse, a short verse, a 4-line chorus) to make sure designs hold up.
- Starter themes: Classic Center, Modern Lower Third, Bold Worship, Minimal Serif Scripture, Stream Lower Third, Kids, High Contrast (accessibility).
- Per-content-type defaults (scripture theme, lyrics theme, announcement theme) + per-item override + per-output profile.
- Bundled OFL fonts (e.g. Inter, Montserrat, Lora, Source Serif 4, Playfair Display, Bebas Neue, Noto Sans/Serif families for broad language coverage). Users can also use system fonts.
- Export/import themes as `.lstheme` (zip with fonts/background assets where licenses allow).

---

## 14. Stage display, remote control & integrations

### 14.1 Stage display
- Layout editor with widgets: current slide, next slide, clock, countdown/elapsed timer, service timer, speaker notes, message from booth ("Wrap up — 5 min"), chord view, current song section label, detection transcript.
- Booth-to-stage **message** feature with flash/attention option.

### 14.2 Remote control (LAN, off by default)
- Operator enables "Remote control" → app starts an HTTPS/WSS server on the LAN with a self-signed certificate (fingerprint shown), plus a QR code that includes a one-time pairing token.
- Phone/tablet web app (`apps/remote-web`): next/previous, service list, quick scripture search, clear layers, approve detected verses, stage message, timers.
- Pairing with 6-digit PIN; rate-limited; per-device revocation; session tokens rotate; remote roles (full control vs "next/previous only" for worship leader).
- Bind only to the selected network interface; never expose on 0.0.0.0 silently.

### 14.3 Control surfaces & API
- **Keyboard shortcuts**: fully remappable; cheat-sheet overlay (`?`).
- **MIDI** input mapping (Web MIDI in control renderer) for church keyboards/controllers.
- **Stream Deck / Companion**: local HTTP/WebSocket API (`/api/v1/...`) accepting the same Commands, token-protected, localhost-only by default. Document with OpenAPI.
- **OSC** support (later) for lighting/sound desk integration.
- Future integrations behind `IntegrationProvider` interface: Planning Center, ChurchTools, ProPresenter import, CCLI SongSelect (requires API partnership).

---

## 15. UI / UX & design system

### 15.1 Feel
Premium, calm, confident, fast. Think of a well-made broadcast tool, not a website. Dark by default (booths are dark; bright UIs blind operators and leak light into the room), with a light theme option.

### 15.2 Design tokens (starting point — refine, don't default)
| Token | Value | Use |
|---|---|---|
| `--surface-0` | `#171A24` (ink indigo) | App background |
| `--surface-1` | `#1F2331` | Panels |
| `--surface-2` | `#2A2F40` | Raised elements, inputs |
| `--text-1` | `#ECEEF4` | Primary text |
| `--text-2` | `#9AA1B5` | Secondary text |
| `--accent` | `#E8B04B` (candle gold) | Focus, selection, primary actions |
| `--tally-program` | `#E5484D` | LIVE / program — reserved, used only for live state |
| `--tally-preview` | `#30A46C` | Preview — reserved |
| `--warning` | `#F5A524` | Warnings |

Rules: tally red and green are **never** used decoratively — they mean live and preview, nothing else. Accent gold is for interaction. Spacing scale 4/8/12/16/24/32. Radius by hierarchy: 6 px controls, 10 px panels, 0 px for slide thumbnails (they represent real screens).

UI typeface: **IBM Plex Sans** (bundled, OFL) — clear at small sizes, distinct numerals for verse numbers and timers; tabular figures for clocks and timers. Sentence case for all labels.

### 15.3 Main layout (control window)
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Top bar: Service name │ Detection mode [Off|Suggest|Approve|Auto] │ ● LIVE 00:41:12 │ Outputs │
├──────────────┬──────────────────────────────────────────┬─────────────────────┤
│ Service plan │  Slides of selected item (grid)          │  PREVIEW            │
│ (drag/drop)  │                                          │  ┌───────────────┐  │
│              │                                          │  └───────────────┘  │
│ ── Library ──│                                          │  PROGRAM (LIVE)     │
│ Bible        │                                          │  ┌───────────────┐  │
│ Songs        │                                          │  └───────────────┘  │
│ Hymns        │                                          │  Layer clear buttons│
│ Media        │                                          │                     │
│ Backgrounds  ├──────────────────────────────────────────┤  Detection queue    │
│ Themes       │  Quick bar / search  (⌘K)                │  (approval cards)   │
└──────────────┴──────────────────────────────────────────┴─────────────────────┘
```
- Panels are resizable and collapsible; layout persisted.
- **Single-screen mode** for laptop-only rehearsal: outputs shown as floating windows.
- **Motion**: transitions in the UI only respond to operator actions (opening panels, confirming go-live). No decorative ambient animation in the control UI.
- **Accessibility**: full keyboard operation, visible focus rings, WCAG AA contrast, respects reduced motion, screen-reader labels on all controls, UI scale setting (90–150%).
- **Copy**: plain verbs, sentence case. Buttons say exactly what happens ("Show on screen", "Clear lyrics", "Start stream"). Error messages say what happened and how to fix it.
- **Onboarding**: first-run wizard — pick displays, pick default themes, test output, optional speech model download. Sample service pre-loaded.
- **Localization**: all strings via i18n (e.g. `i18next`) from day one; English first; RTL UI support.

### 15.4 Smoothness requirements
- Control UI interactions respond < 100 ms; search results < 50 ms for 10k songs / all installed Bibles.
- Virtualized lists everywhere (songs, verses, media) — `@tanstack/react-virtual`.
- No synchronous file I/O in the main process during a service.
- Thumbnails rendered lazily and cached.

---
## 16. Feature brainstorm — what projection tools commonly offer

Prioritized: **P0** = MVP, **P1** = v1.0, **P2** = later. Build P0 fully before touching P1.

### Presentation core
| Feature | Priority |
|---|---|
| Service plan (playlist) with drag-and-drop, headers, notes, duplicate, templates ("Sunday morning") | P0 |
| Preview/Program with transitions, layer clearing, black/logo screens | P0 |
| Multi-display output assignment + test patterns + hot-plug recovery | P0 |
| Undo/redo for all editing | P0 |
| Quick bar (⌘K) for everything: verses, songs, hymns by number, media, commands | P0 |
| Announcements loop (auto-advancing slides with timer) before/after service | P1 |
| Countdown timers to service start ("Service begins in 04:59") with themes | P1 |
| Text slides / simple slide editor (title, body, image) | P1 |
| PDF import as slides | P1 |
| PowerPoint/Keynote import (convert via installed Office/Keynote or LibreOffice to PDF/images; detect availability) | P2 |
| Slide-level speaker notes | P1 |
| Clocks and service timers on stage display | P1 |
| Props/logo bug, live ticker/alert messages (nursery calls, parking) | P1 |
| Scheduled auto-advance & cues (e.g. start background video when item goes live) | P2 |
| Audio playback with crossfade (walk-in music) | P2 |

### Scripture
| Feature | Priority |
|---|---|
| Bundled KJV, instant reference search, full-text search | P0 |
| Smart slide splitting, verse numbers, reference formatting | P0 |
| Multi-version side-by-side | P1 |
| Downloadable versions via signed catalog, file import | P1 |
| Sermon verse list prepared in advance, also shareable as a file from the pastor | P1 |
| Highlight/emphasize words within a projected verse (operator taps a word) | P2 |
| Bookmarks & verse history | P1 |

### Lyrics & hymns
| Feature | Priority |
|---|---|
| Song editor with sections, arrangements, auto-split | P0 |
| Public-domain hymnal with number lookup | P0 |
| Importers (txt, OpenLyrics, ChordPro, OpenSong) | P1 |
| CCLI number, copyright display, usage report CSV | P1 |
| Bilingual lyrics | P1 |
| Chord view for musicians on stage display | P2 |
| Song key/tempo metadata and transposition for chord view | P2 |

### Live & AI
| Feature | Priority |
|---|---|
| Speech-driven scripture detection with Off / Suggest / Approve / Auto | P1 (core differentiator — prototype early, see §20) |
| Live captions output (transcript as subtitles on stream or a dedicated screen for hearing-impaired members) | P2 |
| Live translation captions (local model) | P2 |
| Lyric follow mode: detect sung lyric line and advance slides automatically | P2 |
| Sermon summary / verse list export after service (opt-in, local) | P2 |

### Streaming & production
| Feature | Priority |
|---|---|
| Built-in RTMP streaming + local recording, hardware encoding | P1 |
| Alpha/chroma key output and OBS browser-source overlay | P1 |
| Lower thirds: speaker name/title, scripture, lyrics for stream | P1 |
| Separate themes per output (output profiles) | P1 |
| Multi-destination streaming | P2 |
| NDI output/input | P2 |
| Camera input as background (e.g. live camera behind lyrics on LED wall) | P2 |

### Control & integration
| Feature | Priority |
|---|---|
| Remappable keyboard shortcuts with cheat sheet | P0 |
| LAN phone/tablet remote with pairing | P1 |
| Local HTTP/WebSocket API for Stream Deck / Bitfocus Companion | P1 |
| MIDI mapping | P2 |
| OSC | P2 |
| Planning Center / ChurchTools import | P2 |

### Reliability & admin
| Feature | Priority |
|---|---|
| Autosave, crash recovery, automatic backups | P0 |
| Library export/import (move to a new computer) | P0 |
| Rehearsal mode (outputs shown in windows, stream disabled) | P1 |
| Service log ("what was shown when") export | P1 |
| Diagnostics bundle for support (logs with secrets redacted) | P1 |
| Auto-update with release notes, ability to defer updates until after a service (never update mid-service) | P1 |

---

## 17. Security requirements (non-negotiable)

### 17.1 Electron hardening (apply to EVERY BrowserWindow)
```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  spellcheck: false,          // outputs; enable only in editor inputs if needed
  preload: <window-specific preload>,
}
```
- One preload per window type exposing the **minimum API** through `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer` itself or generic `invoke(channel, …)`.
- **Strict Content-Security-Policy** on every renderer (set via response headers for the custom app protocol):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' lampstand-media: data: blob:; media-src 'self' lampstand-media: blob: mediastream:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`
  (Adjust only via ADR. No remote scripts, ever.)
- Load app content from a **custom privileged protocol** (`app://`) or `file://` with strict handling — not `http://localhost` in production.
- Block navigation and new windows: `will-navigate` → prevent; `setWindowOpenHandler` → deny (open allow-listed external links with `shell.openExternal` only after URL validation, https only).
- `session.setPermissionRequestHandler`: allow `media` (camera/mic) only for the control/compositor windows and only after user enables the feature; deny everything else (geolocation, notifications from renderers, etc.).
- Disable/verify **Electron Fuses**: `RunAsNode` off, `EnableNodeCliInspectArguments` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `EnableCookieEncryption` on.
- Keep Electron updated (security releases); CI fails if Electron is more than one major version behind supported.
- No `remote` module. No `eval`, `new Function`, or `innerHTML` with untrusted content (song lyrics, imported files and transcripts are untrusted). Render text via React text nodes; the tiny Bible markup (`<wj>`, `<add>`, `<nd>`) is parsed by our own parser into elements — never injected as HTML.

### 17.2 IPC
- All channels declared in `packages/ipc-contract` with Zod request/response schemas.
- Main process validates **every** incoming payload and checks `event.senderFrame` origin and which window type sent it (output windows may only subscribe, never mutate).
- Return typed errors; never leak stack traces or file system paths to renderers.

### 17.3 File system
- Renderers never receive or send raw file paths for reading. Media is referenced by ID and served by the `lampstand-media://` protocol handler that resolves IDs → paths inside allowed directories only (canonicalize with `realpath`, reject anything outside the library/userData roots, reject symlink escapes).
- File pickers (`dialog.showOpenDialog`) run in main; the selected file is copied/imported into the library.
- Imports: size limits, file-type sniffing (magic bytes, not just extension), XML parsing with external entities **disabled** (XXE protection), zip extraction with path traversal (zip-slip) and zip-bomb (total size / ratio / file count) protection.

### 17.4 Network
- App makes network requests **only** for: module catalog/downloads, speech model downloads, update checks, and streaming to the user's configured RTMP destination. Each is user-initiated or explicitly enabled (update checks can be on by default but must be disclosed in settings).
- All downloads HTTPS + SHA-256 + Ed25519 signature verification for catalog content. Public key embedded at build time; private key stored offline by the owner, never in the repo or CI logs.
- LAN remote and local API: off by default, token auth, rate limiting, CORS locked, bind to chosen interface/localhost, TLS for LAN remote.
- No telemetry in v1. If added later: opt-in, documented, anonymized.

### 17.5 Secrets & privacy
- Stream keys and tokens via `safeStorage` (Keychain/DPAPI). Redact them from logs (log scrubber with patterns for keys/tokens/URLs with credentials).
- Audio for detection processed in memory; never written to disk unless the user turns on recording/transcript saving.
- Logs rotate (e.g. 5 × 5 MB) and contain no lyrics/scripture text beyond IDs by default.

### 17.6 Build & supply chain
- Lockfile committed; `pnpm install --frozen-lockfile` in CI; `pnpm audit` and a license checker (fail on GPL in shipped JS dependencies; FFmpeg must be an LGPL build distributed per LGPL terms).
- **Code signing**: macOS Developer ID + hardened runtime + notarization; Windows Authenticode (EV or OV certificate, or Azure Trusted Signing). Without signing, macOS Gatekeeper and Windows SmartScreen will scare users — budget for certificates.
- macOS entitlements: only what's needed (`com.apple.security.device.audio-input`, `com.apple.security.device.camera`, plus JIT entitlements required by Electron). Info.plist usage strings for mic and camera explaining why.
- Auto-update only from signed artifacts over HTTPS; verify signatures (electron-updater does this when configured correctly).

---

## 18. Performance & reliability budgets

| Metric | Budget |
|---|---|
| Cold start to usable UI | < 3 s on a 4-year-old mid-range laptop |
| Reference search (`jn 3 16`) to preview | < 50 ms |
| Full-text search across 3 Bibles + 5k songs | < 100 ms |
| Go Live command to pixels on output | < 1 frame + transition duration |
| Output transition frame rate | 60 fps sustained, no dropped frames on 1080p |
| Memory (idle, 2 outputs, 3 Bibles) | < 600 MB total |
| Output window crash recovery | < 1 s, last state restored |
| Speech detection latency | 1.5–3 s (base model, mid-range CPU) |
| Streaming 1080p30 with HW encoder | < 25% CPU on mid-range machine |

- Add a hidden **performance HUD** (`Ctrl+Alt+P`) showing fps per output, IPC latency, worker status.
- Power: prevent display sleep while outputs are active (`powerSaveBlocker`).
- Long-run test: 4-hour soak test with continuous slide changes and streaming, checking memory growth.

---

## 19. Engineering standards

### 19.1 Code
- TypeScript strict; no `any` (use `unknown` + Zod parse). ESLint rules: `@typescript-eslint/strict-type-checked`, `eslint-plugin-security`, `react-hooks`, no floating promises, exhaustive switch checks.
- Pure business logic in `packages/*`, side effects at the edges (ports & adapters / hexagonal style).
- Dependency injection via simple constructor injection / a small container — no globals for services.
- Errors: typed `Result<T, E>` or custom error classes with codes; user-facing messages via i18n keys.
- Logging: structured (pino or electron-log), levels, per-module loggers, secret scrubber.
- Feature flags: `featureFlags.ts` + settings override for experimental features (NDI, semantic matching, live translation).
- Comments explain **why**, not what. Public functions in packages have TSDoc.
- Conventional commits; small PRs; CHANGELOG generated from commits.

### 19.2 Testing
- **Unit** (Vitest): scripture parser (huge fixture table incl. spoken forms), detection matcher (precision/recall on a labeled fixture set of sermon transcripts), text auto-fit, song parser/importers, migrations, repository contract tests, command handlers.
- **Integration**: IPC router validation, module install pipeline (valid, tampered, zip-slip, oversize fixtures), FFmpeg supervisor with a mock RTMP server.
- **E2E** (Playwright for Electron): create service → add song + verse → go live → verify output window DOM; display hot-plug simulation; crash/respawn of output window.
- **Visual regression** on renderer scenes (screenshot comparisons for themes).
- **Detection benchmark**: script that runs recorded sermon audio samples through the pipeline and reports latency, precision, recall. Track over time; precision matters more than recall in Auto mode.
- CI matrix: macOS (arm64 + x64) and Windows x64.

### 19.3 Packaging & release
- electron-builder targets: mac `dmg` + `zip` (universal or per-arch), Windows `nsis` (per-user install by default, no admin needed) — consider `msi` later for church IT.
- Native modules (whisper binding, etc.) rebuilt per platform/arch in CI; prefer prebuilt binaries.
- Release channels: `stable`, `beta`.
- **Never auto-restart to update.** Download in background, install on next launch or when the user clicks "Restart to update", and suppress update prompts while any output or stream is live.

---

## 20. Build roadmap (phases & acceptance criteria)

### Phase 0 — Foundations
- Monorepo, tooling, lint, test, CI on both OSes, Electron security baseline (§17.1), typed IPC skeleton, logging, settings, FileStore with atomic writes, i18n setup, design tokens + base UI components.
- ✅ Accept: app launches on mac & Windows with a hardened empty shell; security checklist script passes; CI green.

### Phase 1 — Projection MVP (P0)
- WindowManager + multi-display outputs + test patterns.
- Renderer engine with themes, auto-fit, transitions, background video continuity.
- LiveStateStore, CommandBus, preview/program, layer clearing, masks, shortcuts.
- KJV bundled, reference parser, quick bar, chapter browser, full-text search in SearchWorker.
- Songs: editor, sections, arrangements; bundled public-domain hymnal with number lookup.
- Service plan with drag-and-drop; autosave; backups; library export/import.
- Bundled backgrounds and media import with thumbnails.
- ✅ Accept: an operator can run a complete Sunday service (walk-in background, 4 songs, 3 scripture passages, announcements) on a projector + laptop with no glitches; output survives a forced crash of the control renderer; search budgets met.

### Phase 2 — Detection prototype (de-risk early)
- SpeechWorker with whisper.cpp, audio input selection, VAD, level meter.
- Explicit reference detection + context continuity; Suggest and Approve modes; approval queue UI.
- Quoted-text detection against installed versions; Auto mode with threshold.
- Detection benchmark harness with recorded samples (include different accents and speaking speeds — e.g. American, British, Nigerian, Ghanaian, Kenyan, South African, Caribbean English — and noisy rooms).
- ✅ Accept: on the benchmark set, explicit-reference precision ≥ 95% and quoted-text precision ≥ 90% at the default Auto threshold; latency within budget; zero impact on output fps while detection runs.

### Phase 3 — Go Live
- Stream compositor, FFmpeg supervisor, HW encoder detection, RTMP(S) to YouTube/Facebook/custom, local recording, pre-flight checklist, reconnect, stream status.
- Output profiles (different theme per output), lower thirds, alpha/chroma output, OBS browser-source overlay.
- ✅ Accept: 2-hour 1080p30 stream to a test RTMP server with < 0.5% dropped frames on a mid-range machine; recovers from a 30-second network outage automatically.

### Phase 4 — v1.0 polish (P1)
- Bible module catalog + signed downloads + import formats.
- Multi-version display, sermon verse list.
- Song importers, CCLI fields & report, bilingual lyrics.
- Stage display editor, booth messages, timers, countdowns, announcements loop.
- LAN remote, local API, rehearsal mode, service log, diagnostics bundle.
- Onboarding wizard, auto-update, code signing & notarization.
- ✅ Accept: full E2E suite green on both OSes; signed installers install without security warnings; first-run to first projected verse < 2 minutes for a new user.

### Phase 5 — P2 backlog
Live captions, lyric-follow mode, NDI, multi-destination streaming, MIDI/OSC, PowerPoint import, semantic quote matching, integrations, accounts/sync (via repository interfaces).

---

## 21. Definition of done (every task)
- [ ] Types strict, no `any`, lint clean, formatted.
- [ ] Unit tests for logic; E2E updated if user flow changed.
- [ ] All new IPC channels in `ipc-contract` with Zod schemas, validated in main.
- [ ] No new network calls, permissions, or dependencies without an ADR.
- [ ] User-facing strings in i18n files; keyboard accessible; works in dark and light UI themes.
- [ ] Doesn't block the main thread; heavy work in workers.
- [ ] Output windows unaffected by failures in the feature (tested by forcing an error).
- [ ] Docs updated (`docs/` and inline TSDoc).
- [ ] Manually verified on macOS and Windows (or CI E2E covers it).

---

## 22. Open questions & risks (owner decisions needed)

1. **Business model** — "premium" free vs paid? Affects licensing for Bibles, hymnals, fonts, backgrounds and NDI. If paid without accounts, licensing would need offline license keys (designable later via a `LicenseProvider` interface).
2. **Code-signing certificates** — Apple Developer Program and a Windows signing certificate are required for a trustworthy install experience.
3. **Speech accuracy on accents and noisy rooms** — the reason Phase 2 is early. Plan to test with real recordings from target churches; may need the "small" model or GPU acceleration on weaker machines.
4. **FFmpeg licensing** — ship an LGPL build, dynamically invoked as a separate process, with source/offer notice per LGPL.
5. **Minimum hardware** — define a reference low-end machine for performance testing (suggest: 8 GB RAM, 4-core CPU, integrated graphics, Windows 10).
6. **Languages** — which UI languages and Bible languages matter most to your target churches? This decides the first book-alias tables and speech model language settings.
