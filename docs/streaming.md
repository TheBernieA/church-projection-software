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
- **Frames.** Main keeps only the latest painted frame (one BGRA buffer) and a **frame clock**
  (`framePump.ts`) writes frames on wall-clock time: after a late tick it writes the frames that
  were due (the same buffer, no copies), and aims the next tick at the next frame's time, so the
  picture never falls behind the sound. If ffmpeg's input is backed up the frame is dropped and
  counted (never queued). ffmpeg runs at above-normal priority.
- **Sound.** The stream window runs the Mixer's **stream bus** (see below): tracks, video sound and
  inputs whose Stream send is on. An `AudioWorklet` sends ~21 ms batches of stereo float32 to main,
  which writes them to ffmpeg's fd 3. Main tops up with silence whenever the mix falls behind the
  clock, so ffmpeg never waits for sound and audio and video stay in step.
- **Encoding.** ffmpeg encodes once (H.264 + AAC, a keyframe every 2 s) and the `tee` muxer sends it
  to every destination (FLV, each `onfail=ignore` so one failing doesn't stop the others) and to the
  recording (fragmented MP4: playable even after a crash).
- **Encoder.** The best available is chosen: `h264_videotoolbox` (macOS), `h264_nvenc`,
  `h264_qsv`, `h264_amf`, else `libx264` (veryfast, zerolatency). A hardware encoder that fails at
  start is dropped for the rest of the session.
- **Recovery.** If ffmpeg stops on its own, it restarts after 2, 5, 10, 20… seconds (up to 10
  tries); a recording carries on as "part 2". Quitting the app finishes the recording first.

## Performance modes

`stream.performance`: Auto, Light (960×540, x264 superfast, 1 fps preview), Balanced (720p),
Quality (1080p), or Custom (the Quality values as set). Auto uses "Check this computer"
(`benchmark.ts`: a 4-second test encode per mode, needing 1.7–2.2× real time) or else cores,
memory and whether there's a hardware encoder (`resolvePerformance` in core). Hardware
encoders get NV12. While running, health (CPU, memory, fps, bitrate, speed) is sampled every
2 s; if it can't keep up for 15 s the Live console offers "Switch to Light".

Measured on an M-series Mac, 30 s of a playing video with a camera PiP (VideoToolbox), before
→ after: 28.6 → 30 fps, 16 → 0 frames dropped, A/V drift +1.17 s → −0.1 s; ffmpeg CPU 9.6% in
Balanced, 5.3% in Light. Run it with `LAMPSTAND_PERF=1 pnpm exec playwright test e2e/perf.spec.ts`.

## Live console

The toolbar's Live button docks the console beside the output; "Own window" moves it to a
window of its own (any display; size and place remembered), which is a second control window
(`?view=live`, settings only). The preview is the real outgoing picture, sent as small JPEGs
only while a console watches (`ctl:stream-watch`, renewed every 4 s); "Show the stream picture
before going live" keeps the stream window ready (no encoder, no microphones), so going live is
instant.

## The mixer

`LiveState.mixer` (core `schemas/mixer.ts`) is the sound desk: one channel per source (Audio tab
tracks, video sound, each live input) with fader (dB), mute, solo, pan, mono, high-pass, 3-band
EQ, compressor, and Room / Stream sends; and two buses (Room, Stream) with level, mute, limiter and
delay. Commands: `live.mixer` (`applyMixerAction`). Main saves it to `settings.mixer` a second after
each change; older settings are converted from `stream.sound` (`mixerFromSettings`).

One WebAudio engine (`packages/renderer/src/mixer.ts`, `MixerEngine`) makes each mix where it is
heard: the **room** in the main output (or the control window with no output; `RoomAudio`), the
**stream** in the stream window and NDI feeds, and the **cue** (solo) mix on the "Listen on"
output in the control window. Media elements join a mix through `createMediaElementSource`
(SceneRenderer's `audioTap`), so they never also play straight to the speakers. The room and
stream engines report peak/RMS levels ~15×/s on `mix:meters` → `ev:meters` for the Mixer's meters.

## Video switcher

`LiveState.switcher.preview` is the camera on Preview; `live.switcher` (core `switcher.ts`) does
preview / cut / auto / take / T-bar / PiP. Program carries `inputTransition` (played by
`SceneRenderer.renderInput` when the camera changes: fade, dip, wipe), `inputNext` (the T-bar mix)
and `pip`. Keys: 1–9 preview a camera, Shift+1–9 take it, C cut, T auto.

## NDI

Settings › NDI lists feeds (`settings.ndi.feeds`): the program, the words alone over transparency
(to key over cameras), or the stream picture. Each enabled feed is an offscreen window of the
stream page (`NdiController`); frames and the stream mix go to a worker thread (`ndiWorker.ts`) that
loads the **NDI runtime installed by NDI Tools** with koffi and sends with
`NDIlib_send_send_video_v2` (BGRA, with alpha) and `NDIlib_send_send_audio_v3` (planar float).
Lampstand never ships the runtime; without it NDI is off and Settings links to NDI Tools. The
runtime is looked for at `LAMPSTAND_NDI_LIB`, then the usual install places (`ndiRuntime.ts`).
Packaging: koffi is unpacked from the asar; macOS needs `disable-library-validation` to load it.
NDI® is a registered trademark of Vizrt NDI AB.

Later: NDI *input* (sources from the network in the switcher), tested against real sources.

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
- Output profiles for other screens; NDI input.

## Tests

- `apps/desktop/src/main/stream/ffmpegArgs.test.ts`: arguments, tee escaping, URLs, keys,
  progress parsing, recording names.
- e2e: records a live slide (checks h264 + aac, duration, a non-black frame) and streams to a local
  RTMP server started by the test (`ffmpeg -listen 1`), set up through Settings › Streaming and
  started from the Live panel.
