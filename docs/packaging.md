# Making installers

Lampstand is packaged with electron-builder (`apps/desktop/electron-builder.yml`). Each
installer is built on its own platform: the native libraries (NDI, PDF rendering) are fetched
for the machine doing the build, so build the Windows installer on Windows and the Mac ones on
a Mac (or let GitHub do all three, below).

## Before the first build

1. **ffmpeg** (livestream and recording) is automatic: every `dist:*` script puts it in
   `resources/ffmpeg/<os>-<arch>/` first (`apps/desktop/scripts/prepareFfmpeg.mjs`).
   - **Mac:** Lampstand's own build (`apps/desktop/scripts/buildFfmpegMac.sh`), made the first
     time and kept: ffmpeg 9 with mbedTLS (secure streaming), VideoToolbox and AudioToolbox (GPU
     encoding) and libx264 (the fallback), from pinned, checksum-verified sources, statically
     linked so it runs on any Mac from macOS 12. Either kind of Mac builds both kinds (the
     other is cross-compiled). Needs `xcode-select --install` and `brew install nasm pkgconf`;
     without them the build falls back on `ffmpeg-static`, whose Mac builds can't stream
     securely (RTMPS stalls after a few frames: YouTube then uses its standard RTMP address,
     and Facebook, secure only, won't work), with a warning. mbedTLS has no trust store of its
     own: at stream time the app gives ffmpeg the Mac's trusted root certificates
     (`tlsOptionsFor` in `main/stream/ffmpeg.ts`), so servers are still verified.
   - **Windows:** ffmpeg 9.0.2, Gyan's "essentials" build (the Windows build ffmpeg.org links
     to: x264, NVENC, Quick Sync, AMF, Media Foundation, SRT, GnuTLS), downloaded once from its
     pinned GitHub release, checked against its SHA-256 and kept (`WIN` in `prepareFfmpeg.mjs`
     says which). That works on any computer, so a Windows installer made on a Mac gets it too.
     Without internet the first time, the build falls back on `ffmpeg-static` (ffmpeg 6.0) on a
     PC, or none on a Mac, with a warning. ffmpeg 9 checks secure servers' certificates (6.0
     didn't); on Windows it uses the Windows certificate store, as browsers do.
     *To move to a newer release:* change `WIN` (version, URL, folder and the SHA-256 GitHub
     shows for the asset); the next build downloads it.

   These ffmpeg builds are GPL v3: shipping them means offering their source. The Mac build's
   `SOURCES.txt` (packaged next to it) lists the exact source archives and checksums.
   *Why build it rather than download one:* the ready-made static Mac builds either lack a TLS
   library (`ffmpeg-static`) or would be unpinned third-party binaries fetched on every build;
   building gives a known feature set, a known licence, and reproducible inputs, in about two
   minutes per Mac kind.
2. **Icon**: put a 1024×1024 PNG at `apps/desktop/build/icon.png`. electron-builder makes the
   Mac and Windows icons from it. Without it the installers use Electron's default icon.
3. Set `version` in `apps/desktop/package.json`: it names the installers
   (`apps/desktop/release/<version>/`).

## On your Mac, for your own computers

```sh
pnpm install
pnpm dist:mac:local
```

You get `Lampstand-<version>-arm64.dmg` (and a `.zip`) in `apps/desktop/release/<version>/`.
It's signed "ad-hoc" (no Apple account needed), which is enough to run on this Mac. On another
Mac, the first time, right-click the app › Open (or System Settings › Privacy & Security ›
Open Anyway): macOS warns about apps that aren't notarized.

## For other people: signed and notarized (Mac)

Needs an Apple Developer account (Developer ID Application certificate). Export the
certificate as a `.p12`, then:

```sh
export CSC_LINK=/path/to/certificate.p12 CSC_KEY_PASSWORD=…
export APPLE_ID=you@example.com APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=…
pnpm dist:mac
```

The app is signed with the hardened runtime and notarized, so it opens on any Mac without a
warning. Never commit these values; keep them in your shell or in CI secrets.

## Windows

**From your Mac:** `pnpm-workspace.yaml` also installs the Windows native libraries, so a Mac
can build the Windows installer too. Its NSIS tool is an Intel program, so an Apple-silicon Mac
needs Rosetta once (`softwareupdate --install-rosetta --agree-to-license`), then:

```sh
pnpm dist:win
```

**Or on a Windows PC** (Node 22 and pnpm installed):

```sh
pnpm install
pnpm dist:win
```

You get `Lampstand Setup <version>.exe`. Unsigned installers make Windows SmartScreen warn
("Windows protected your PC" › More info › Run anyway). To sign, set `CSC_LINK` and
`CSC_KEY_PASSWORD` to a code-signing certificate before building.

## All three on GitHub

`.github/workflows/release.yml` builds Mac (Apple silicon and Intel) and Windows installers on
GitHub's machines, each with its own ffmpeg. Start it by pushing a version tag
(`git tag v0.1.0 && git push origin v0.1.0`), or from Actions › Release builds › Run workflow
once the workflow is on the default branch; the installers are under Artifacts on the run's
page. For signed builds add these repository
secrets: `CSC_LINK` (the .p12, base64-encoded), `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and for Windows `WIN_CSC_LINK`,
`WIN_CSC_KEY_PASSWORD`. Without them the Mac builds are ad-hoc signed and the Windows one
unsigned.
