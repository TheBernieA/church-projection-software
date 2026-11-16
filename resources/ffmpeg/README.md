# ffmpeg for packaged builds

Lampstand's livestream and recording use ffmpeg as a separate program (see `docs/streaming.md`).
Before packaging, put the platform's binary (and its licence) in a folder named after the
platform and architecture, e.g.:

```
resources/ffmpeg/mac-arm64/ffmpeg
resources/ffmpeg/mac-x64/ffmpeg
resources/ffmpeg/win-x64/ffmpeg.exe
resources/ffmpeg/*/LICENSE.txt
```

electron-builder copies it to `resources/ffmpeg/` inside the app. In development, Lampstand
uses `LAMPSTAND_FFMPEG`, the `ffmpeg-static` package if installed, or a system install
(e.g. `brew install ffmpeg`).
