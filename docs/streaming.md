# Livestream and recording

Lampstand streams the service to YouTube, Facebook or any RTMP(S) service, and records it to a
file, by itself — no OBS. The toolbar's **Live** button opens the controls; **Settings ›
Streaming** sets it up.

## How it works

```
control window ──commands──▶ main: StreamController ──frames (BGRA, pipe:0)──▶ ffmpeg ─┬─▶ RTMP(S) destination(s)
                                   ▲        ▲          ──sound (f32le, fd 3)───▶        └─▶ recording.mp4
                                   │        │
                         paint events   PCM (IPC)
                                   │        │
                    stream window (offscreen BrowserWindow, renderer/stream)
                    camera · program background/video · lower-third band · words & overlays
                    sound: room audio (tracks, video sound) + chosen microphones (AudioWorklet)
```

- **Picture.** The stream window (`apps/desktop/src/renderer/stream`) is an offscreen window at
  the stream size (720p or 1080p). It draws with the same `SceneRenderer` as the outputs, in two
  layers so lower-third words can sit over a soft band: the background and video behind, the words,
  props, messages and the Black / Logo masks in front. A camera can sit at the back.
- **Frames.** Main receives `paint` events and writes the latest frame to ffmpeg at a **steady**
  frame rate (offscreen windows only paint on change, so the last frame repeats). If ffmpeg can't
  take a frame in time it is dropped and counted.
- **Sound.** The stream window mixes room audio (Audio tab tracks via `AudioPlayer`, and the sound
  of videos, captured with `createMediaElementSource` so it never plays on the speakers) with the
  chosen microphones. An `AudioWorklet` sends ~21 ms batches of stereo float32 to main, which writes
  them to ffmpeg's fd 3. Main tops up with silence whenever the mix falls behind the clock, so
  ffmpeg never waits for sound and audio and video stay in step.
- **Encoding.** ffmpeg encodes once (H.264 + AAC, a keyframe every 2 s) and the `tee` muxer sends it
  to every destination (FLV, each `onfail=ignore` so one failing doesn't stop the others) and to the
  recording (fragmented MP4: playable even after a crash).
- **Encoder.** The best available is chosen: `h264_videotoolbox` (macOS), `h264_nvenc`,
  `h264_qsv`, `h264_amf`, else `libx264` (veryfast, zerolatency). A hardware encoder that fails at
  start is dropped for the rest of the session.
- **Recovery.** If ffmpeg stops on its own, it restarts after 2, 5, 10, 20… seconds (up to 10
  tries); a recording carries on as "part 2". Quitting the app finishes the recording first.

## Stream keys

Keys are stored with the OS keychain/DPAPI (`SecretStore`, `userData/secrets.json`, encrypted),
never in `settings.json`, never logged, and never sent back to a window: the renderer can only
*set* or *forget* a key (`stream.setKey`) and ask whether one is saved (`stream.keys`). Only
`rtmp://` and `rtmps://` addresses are accepted.

## ffmpeg

Lampstand looks for ffmpeg in this order: `LAMPSTAND_FFMPEG`; the copy shipped in the app
(`resources/ffmpeg/`, see `resources/ffmpeg/README.md`); the `ffmpeg-static` package if installed;
then a system install (Homebrew, `/usr/local`, `PATH`). Without one, the Live panel says so and
nothing else changes.

**Licence.** ffmpeg is a separate program run by Lampstand (not linked into it). Builds that include
x264 are GPL; ship its licence text and a link to the matching source with the app. An LGPL build
with only the hardware encoders avoids the GPL if that matters for distribution.

## Tuning (later)

- GPU shared-texture capture instead of copying bitmaps (`offscreen.useSharedTexture`).
- Adaptive bitrate when the connection struggles; per-destination reconnect without restarting.
- YouTube / Facebook sign-in to create and schedule broadcasts (titles, privacy, chat).
- Picture-in-picture camera; NDI and alpha output; output profiles for other screens.

## Tests

- `apps/desktop/src/main/stream/ffmpegArgs.test.ts`: arguments, tee escaping, URLs, keys,
  progress parsing, recording names.
- e2e: records a live slide (checks h264 + aac, duration, a non-black frame) and streams to a local
  RTMP server started by the test (`ffmpeg -listen 1`), set up through Settings › Streaming and
  started from the Live panel.
