# ffmpeg for packaged builds

Lampstand's livestream and recording use ffmpeg as a separate program (see `docs/streaming.md`).
Each `dist:*` script puts it here first (`apps/desktop/scripts/prepareFfmpeg.mjs`), in a folder
named after the platform and architecture:

```
resources/ffmpeg/mac-arm64/ffmpeg     Lampstand's own build (apps/desktop/scripts/buildFfmpegMac.sh)
resources/ffmpeg/mac-x64/ffmpeg       ″ (cross-compiled on Apple silicon, or native on Intel)
resources/ffmpeg/win-x64/ffmpeg.exe   from ffmpeg-static (`pnpm install` on Windows)
resources/ffmpeg/*/LICENSE.txt        (and SOURCES.txt for the Mac builds)
resources/ffmpeg/.build/              the Mac build's downloaded sources and work folders
```

electron-builder copies the platform's folder to `resources/ffmpeg/` inside the app. None of
this is committed. In development, Lampstand uses `LAMPSTAND_FFMPEG`, a system install (e.g.
`brew install ffmpeg`) or the `ffmpeg-static` package, preferring one that can stream securely.

Why the Mac has its own build: `ffmpeg-static`'s Mac builds have no TLS library, so ffmpeg falls
back on Apple's SecureTransport, whose RTMPS uploads stall after a few frames. Lampstand's build
uses mbedTLS; the app hands it the Mac's trusted root certificates when it streams.
