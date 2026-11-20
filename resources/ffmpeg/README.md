# ffmpeg for packaged builds

Lampstand's livestream and recording use ffmpeg as a separate program (see `docs/streaming.md`).
It's packaged automatically: `pnpm install` downloads ffmpeg for this computer (the
`ffmpeg-static` package), and each `dist:*` script copies it here first
(`apps/desktop/scripts/prepareFfmpeg.mjs`), into a folder named after the platform and
architecture:

```
resources/ffmpeg/mac-arm64/ffmpeg
resources/ffmpeg/mac-x64/ffmpeg
resources/ffmpeg/win-x64/ffmpeg.exe
resources/ffmpeg/*/LICENSE.txt
```

electron-builder copies it to `resources/ffmpeg/` inside the app. Building for another
platform than this computer's (the Windows installer on a Mac), put that platform's binary and
licence in its folder by hand. These folders are not committed. In development, Lampstand uses
`LAMPSTAND_FFMPEG`, the `ffmpeg-static` package, or a system install (e.g. `brew install ffmpeg`).
