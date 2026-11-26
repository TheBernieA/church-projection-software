# Livestream and recording

Lampstand streams the service to YouTube, Facebook or any RTMP(S) service, and records it to a
file, by itself — no OBS. The toolbar's **Live** button opens the controls; **Settings ›
Streaming** sets it up.

## Two pipelines

**GPU (the default where available).** The stream window renders offscreen with
`useSharedTexture`, so each picture stays on the graphics card. Main imports each texture
(`sharedTexture.importSharedTexture`) and passes it back to the stream page, and to any watching
Live console, as a `VideoFrame` (`sendSharedTexture`). The page's `StreamEncoder`
(`renderer/stream/encoder.ts`) encodes on a steady frame clock with **WebCodecs `VideoEncoder`
using the hardware H.264 encoder** (VideoToolbox on macOS, Media Foundation on Windows). The
encoded Annex B chunks go to main and on to ffmpeg, which only **packages** them
(`-c:v copy`, timed by frame number with `setts`) and encodes the sound. Nothing is copied to the
CPU. The console's preview draws the same GPU frames into a canvas at 30 fps.

- Each encoded frame goes to ffmpeg as an **FLV video tag carrying its real timestamp**
  (`main/stream/flv.ts`; WebCodecs gives AVCC frames and the avcC record). ffmpeg starts at once
  and never guesses times, and a skipped frame leaves a gap in time instead of slowing the
  video's clock. (Raw H.264 timed by frame number arrived in bursts of up to 0.5 s, and every
  dropped frame put the picture permanently behind the sound.)
- The encoder runs in its **own worker thread** (`renderer/stream/encoder.worker.ts`: the frame
  clock and the hardware encoder), so drawing a slide or starting a video in the stream page
  never makes a frame late. A keyframe goes out every two seconds of stream time even when the
  frame on that tick was skipped.
- **Staying live when the upload can't keep up.** ffmpeg's input queues are about half a second
  (they were 512 packets, 8 s at 60 fps), and main measures the video waiting for ffmpeg _in
  seconds_ (`backlog.ts`; bytes can't say, a still slide is tiny). Past 1.2 s it skips ahead to
  the next keyframe: the picture jumps, but the stream doesn't fall behind live for good. What
  was already queued still counts while it drains: the stream resumes (asking for one keyframe)
  only once under 0.3 s is waiting, so the delay it skipped doesn't come straight back.
  `LAMPSTAND_LATENCY_STALL=1` with the latency spec freezes the server for 4 s to check it.
- The sound is timed by counting samples, so it's kept to the clock both ways: silence fills a
  gap, and a batch that arrives after its gap was filled is dropped. The sound card's clock
  drifts from the computer's (tens of ppm); past 40 ms each batch is nudged by one sample
  (0.2 %, inaudible), so a long service never reaches a dropped batch or a burst of silence.
- The window paints only on change, so the page always receives the newest picture: main holds at
  most one picture while the last is still on its way. Encoding can start on a still screen.
- Start is sent once the page has loaded. The frame clock, and main's sound clock (on the first
  chunk), start when the encoder produces its first frame, so its warm-up never shifts the sync.
- Used when `sharedTexture` exists, the page reports hardware support for the size and rate
  (`VideoEncoder.isConfigSupported`), the encoder setting is Automatic, and
  `LAMPSTAND_STREAM_PIPELINE` isn't `cpu`. If the hardware encoder fails mid-stream, the session
  carries on with the CPU pipeline (recording part 2).

**CPU (the fallback).** Main reads each painted frame into memory and writes raw BGRA to ffmpeg on
a frame clock; ffmpeg converts and encodes. The preview is small JPEGs.

Measured at 1080p60 on an M-series Mac (30 s, a playing video plus a camera PiP; re-measured
21 Nov 2026 with `LAMPSTAND_PERF=1 LAMPSTAND_PERF_CUSTOM=1080x60`):

|     | ffmpeg CPU | Lampstand CPU | fps  | dropped | A/V drift |
| --- | ---------- | ------------- | ---- | ------- | --------- |
| GPU | 0.5 %      | 7.6 %         | 60.0 | 0       | +2 ms     |
| CPU | 33.1 %     | 9.9 %         | 61.6 | 45      | −24 ms    |

(CPU is % of one core.) On the GPU pipeline Lampstand's share splits: GPU process 2.9 %, the
control window (the whole operator UI, its 30 fps preview included) 2.1 %, the stream page 1.1 %,
main 0.8 %, the rest 0.9 % (`cpuByProcess` in the perf result). The CPU pipeline's cost is
moving raw frames (about 500 MB/s at 1080p60) and converting them; handing VideoToolbox BGRA to
convert itself was measured and is no cheaper, so the conversion stays in ffmpeg.

At 720p30: GPU 0.3 % (0 dropped, −90 ms); CPU 10 %.

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
  picture never falls behind the sound. If ffmpeg's input is backed up (more than 3 frames in
  the pipe; ffmpeg queues 8 more) the frame is _owed_: written later as a repeat of the picture,
  a few a tick. ffmpeg times raw video by counting frames, so skipping one would put the picture
  a frame ahead of the sound for the rest of the stream. ffmpeg runs at above-normal priority.
- **Colour.** BGRA becomes BT.709, limited range, converted accurately (`accurate_rnd`) and
  labelled (`setparams`): players and services assume BT.709 for HD; ffmpeg's default would be
  BT.601 and untagged. The GPU pipeline's frames come out of Chromium already BT.709 and tagged.
- **Sound.** The stream window runs the Mixer's **stream bus** (see below): tracks, video sound and
  inputs whose Stream send is on. An `AudioWorklet` sends ~11 ms batches (512 samples) of stereo
  float32 to main, clipped at full scale,
  which writes them to ffmpeg's fd 3. Main tops up with silence whenever the mix falls behind the
  clock, so ffmpeg never waits for sound and audio and video stay in step.
- **Encoding.** ffmpeg encodes once (H.264 High + AAC, a keyframe every 2 s, a one-second rate
  buffer) and the `tee` muxer sends it to every destination (FLV, each `onfail=ignore` so one
  failing doesn't stop the others; MPEG-TS for direct links, each sound frame sent at once) and to
  the recording (fragmented MP4: playable even after a crash), which writes through its own queue
  (`use_fifo`) so a slow disk never holds up the live outputs. AAC is Apple's (`aac_at`) where
  ffmpeg has it, else ffmpeg's own.
- **Encoder.** The best that works on this computer is chosen: `h264_videotoolbox` (macOS),
  `h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_mf` (Windows' Media Foundation: whatever hardware
  encoder the graphics driver offers, hardware only), else `libx264` (veryfast, zerolatency).
  ffmpeg lists every encoder it was built with (the Windows build has all four hardware ones on
  any PC), so each is tried once at start-up with a few test frames and the stream's own
  settings (`probeEncoders`); that also tells Auto whether the computer really has a hardware
  encoder (no: Light on a 4-core machine). Hardware encoders run with no B-frames and no frame
  queueing (NVENC `zerolatency`, Quick Sync `async_depth 1`). A hardware encoder that still fails
  at start is dropped for the rest of the session.
- **Secure destinations (Mac).** Lampstand's Mac ffmpeg uses mbedTLS, which has no trust store:
  the app writes the Mac's trusted roots (Apple's and any an administrator added) to a file,
  keeping only kinds mbedTLS reads (one it can't read makes ffmpeg refuse the whole file),
  checks offline that ffmpeg accepts it, and passes it as `ca_file`. Failing that, it streams
  without checking certificates, as older ffmpeg versions (6.0 among them) did by default.
- **Recovery.** If ffmpeg stops on its own, it restarts after 2, 5, 10, 20… seconds (up to 10
  tries; the count starts again after a steady minute live); a recording carries on as "part 2".
- **Network drops.** Once a destination has been live, a lost connection doesn't end the stream:
  it shows Reconnecting and checks quietly (after 1, 2, 3, then every 5 s) whether the dropped
  destinations' servers answer (a TCP connect to host and port, never the key); only then is
  the encoder restarted. If a restart reaches the server but the stream still doesn't get
  through, the next tries wait longer (5, 10, 20, then 30 s). Destinations that are still on air
  are never checked or counted as down, so they aren't interrupted while another is offline. A
  recording carries on through the drop and is split once, when the stream comes back. After
  10 minutes the destinations that couldn't come back are marked failed and left; a recording or
  another destination carries on (with nothing left, the stream ends with the reason). A wrong
  address or key at the first start still fails at once.
  **Silent drops** (a pulled cable, Wi-Fi gone, the router down) close nothing: the connection
  just stops moving, and ffmpeg alone would wait minutes for the system to give up, the stream
  frozen for viewers and the console still saying Live. Each RTMP(S) destination therefore has
  a write limit (`rw_timeout`, 5 s) and a send buffer of about one second of its bitrate
  (`send_buffer_size`), so a dead connection fills it quickly and fails like any other: the
  recording and other destinations go on, and it reconnects as above. Expect it to be noticed
  within roughly 10–25 s (sooner with motion, later on a still slide's low bitrate); the
  recording may skip frames in that time, as the stalled destination holds the others up until
  it fails. When the GPU pipeline falls behind and wants to reconnect to throw the backlog away,
  it first checks that the servers answer; if they don't, it waits for that failure instead of
  splitting the recording for nothing.
  (`reachability.ts`, `sendBufferBytes`/`STALLED_WRITE_US` in `ffmpegArgs.ts`; tested end to end
  in `e2e/reconnect.spec.ts`, including a silent drop on both pipelines through a proxy that
  freezes the connection and refuses new ones.)
  A stream page that crashes is reopened and the encoder restarted with it. A recording folder
  that can't be made falls back to the usual one, else the stream carries on without recording. Quitting the app finishes the recording first.

## Sound that reaches the mixers

A WebAudio mixer only gets the sound of media it may _read_. Library media is served on its own
scheme (`lampstand-media:`), so that scheme is CORS-enabled, its responses allow our own origin
(`allowedOrigin`), and media elements that feed a mixer set `crossOrigin = 'anonymous'`
(`AudioPlayer`, `buildMedia`). Without this the room and the stream got silence. The stream's
PCM tap worklet is built as a real file (`?url&no-inline`): inlined as a `data:` URL, the
security policy refused to load it. e2e checks the Room meter moves and the recording isn't
silent.

Sending latency is measured by `LAMPSTAND_LATENCY=1 pnpm exec playwright test e2e/latency.spec.ts`
(a local RTMP server; arrival time against each packet's timestamp). A line of stream health
goes to the log every 10 s while running.

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
tracks, video sound, each live input) with fader (dB), mute, solo, pan, Room / Stream sends, and
its strip: trim and polarity, mono, sync delay (0–1000 ms), noise suppression (inputs: the
capture's `noiseSuppression`), a noise gate, a low cut and a high cut (12, 24 or 48 dB/octave,
Butterworth), a 6-band parametric EQ (each band a bell, low shelf, high shelf or notch, with
frequency, gain and Q, on/off; the EQ bypassable, the cuts not), a
compressor (threshold, ratio, attack, release, make-up) and ducking (dips by an amount while a
live input that "ducks others" is above a threshold; held 600 ms between words). A channel can
be locked (core ignores every change to it but unlocking, so a control surface can't move it
either). Presets (`PRESETS`: speech, singing, instrument, music, flat) set the processing only.
Two buses (Room, Stream) with level, mute, a limiter with its ceiling, and delay. Every field
added later has a default that leaves the sound as it was (a saved 3-band EQ is converted into
bands 1, 3 and 6, `fromThreeBand`; EQ changes name only the bands they change,
`eq.bands["2"]`). Commands: `live.mixer` (`applyMixerAction`). Main saves it to `settings.mixer` a second after
each change; older settings are converted from `stream.sound` (`mixerFromSettings`).

One WebAudio engine (`packages/renderer/src/mixer.ts`, `MixerEngine`) makes each mix where it is
heard: the **room** in the main output (or the control window with no output; `RoomAudio`), the
**stream** in the stream window and NDI feeds, and the **cue** (solo) mix on the "Listen on"
output in the control window. Media elements join a mix through `createMediaElementSource`
(SceneRenderer's `audioTap`), so they never also play straight to the speakers. The room and
stream engines report peak/RMS levels ~15×/s on `mix:meters` → `ev:meters` for the Mixer's meters,
with each channel's compressor gain reduction and ducking (`dyn`) and the mix's loudness.

**The channel window** (click a strip's name or its processing chip;
`control/components/mixer/eq/`, state in `control/lib/eqWindow.ts`) floats over the workspace
(moved by its header, resized from its corner, kept on screen) or docks into the Mixer; dock state,
size and tab are remembered on the computer. EQ: a graph (`EqGraph`) of the strip's real response
(`eqFilters.ts`: each biquad's magnitude from the Web Audio spec's coefficients, so the curve is
what's heard), nodes to drag (frequency and gain; Alt-drag or wheel: Q, a cut's slope; double-click:
flatten or switch a cut off; double-click the graph: the nearest unused band goes there; arrows,
Shift, [ ] on a focused node), and a live spectrum before and after the EQ: the window sets
`live.mixerScope` to the channel shown, the room engine adds two 8192-point analysers to that
strip only and sends 96 log bands (`spectrum.ts`) with its meter report. Dynamics: gate (level
against threshold), compressor (transfer curve, gain reduction), ducking. Input: device, trim,
delay, pan, polarity, mono, noise suppression. Fast edits are sent at most every 40 ms, nested
changes merged (`mergePatch`).

**Presets, imports and the sound desk** share one device-neutral model (core
`schemas/processing.ts`: filters, gate, compressor) and one fitting function (`fitProcessing`,
`processing.ts`): Lampstand channels (`channelProcessing` / `processingPatch`), saved presets
(`settings.processingPresets`, files via `presets.export` / `presets.import`), text EQs (Equalizer
APO / REW, `eqText.ts`) and desks (profiles, `desk.ts`; see `docs/desk-profiles.md`) all convert to
and from it, and every change made to fit is a `FitNote` shown before anything is applied or sent.
The channel window's Presets tab saves (whole channel or EQ only), applies, renames, deletes,
imports and exports; its Desk tab links the channel to a desk channel (`MixerChannel.deskChannel`),
reads it (apply here, or keep as a preset) and sends the channel or a preset to it after a
confirmation listing the changes, with Undo (the desk's previous values are read first).

The strip's numbers come from `stripSettings` (pure, tested; a section that's off gets neutral
values, so nothing is rewired). The gate and the loudness meter are AudioWorklet processors
(`apps/desktop/src/renderer/shared/mixer.worklet.js`, given to the engine by `installMixerWorklet`
in each page with a mixer; without it the engine runs with no gate and no loudness). Loudness is
BS.1770: K-weighting (a +4 dB high shelf at 1.68 kHz and a 38 Hz high-pass, as biquads), 100 ms
blocks of mean square from the processor, then `LoudnessMeter`: momentary (400 ms), short-term
(3 s) and integrated (gated: −70 LUFS absolute, −10 LU relative, over a histogram so it costs the
same after hours). The Stream strip shows short-term and integrated against −14 LUFS (YouTube,
Facebook). Ducking reads each strip's post-fader meter every 20 ms (`DuckFollower`).

Gain staging: Web Audio's `DynamicsCompressorNode` adds its own makeup gain ((1/gain at full
scale)^0.6: about +7 dB for a −18 dB, 3:1 channel compressor). The engine takes it back out
(`autoMakeupDb`), so the makeup knob means what it says and the bus limiter's ceiling sits where
it's set (−1.5 dBFS by default, 20:1; fast peaks that slip past are clipped at the stream's sound tap). A
one-channel mic is folded to both sides like a channel marked Mono (left alone, the stereo panner
would play it 3 dB quieter).

## Camera mode (PTZ, digital shots, follow)

**Cameras** (a toolbar workspace, `mode: 'cameras'`; also Media › Video input › Camera control)
is the camera operator's desk on its own screen: the library and media bin step aside; big Preview
and Program monitors with Cut, Auto, the T-bar and the transition (`SwitcherBar`, stacked); every
camera live with its tally (click: Preview, double-click: Program); the Preview camera's shots as
picture tiles (`cameras/ShotGrid.tsx`: a digital shot shows the camera live, cropped to it; a PTZ
shot keeps a 192×108 JPEG taken when saved, `CameraShot.thumb`, since the camera can't show a shot
it isn't pointing at); and the deck on the right (`cameras/CameraDeck.tsx`) that drives the camera
on **Preview**: a joystick and spring-back zoom rocker with a speed dial, Home, Follow (Close /
Waist / Full; click a person on Preview) and, for PTZ cameras, focus, exposure steps and white
balance. Media › Video input keeps the cameras and the switcher.

**Screens and stream on different cameras.** `LiveState.streamCut` is the livestream's own camera
(null: the stream follows the screens). Every switcher take has a destination (`to`: `both`,
`screens`, `stream`; core `switcher.ts`, tested): to the stream alone sets `streamCut`; to the
screens alone first freezes the stream on what it had; to both (or `link`) clears it. The stream
window draws `streamCut`'s camera, transition and T-bar mix in place of the screens' (a video on
the screens plays hidden under it, so its sound stays in the stream mix); slides, PiP, Looks and
lower thirds still follow the screens. Its recording and NDI feeds of the stream follow it. The
control window picks the destination once (`useSwitchTarget`, "Take to" in every switcher; Cut,
Auto, the T-bar, double-click and the C/T keys use it). Cameras has two views: **Operate** (NEXT and
LIVE monitors as big as the window allows, the stream's own camera inset in LIVE; the camera strip
with names and tallies on the pictures; then one bar: camera chip and exposure, every camera's
shots in rows, joystick and zoom, focus and tracking, Take to with FADE, CUT, BLACK and LOWER
THIRDS) and
**Routing** (sources and destinations with cables; drag a camera onto Screens or Livestream, or
pick from each one's list; the stream's cable is dashed while it follows the screens). **Undock**
opens Cameras in a window of its own (`?view=cameras`, `cameras.window`, a panel like the Live
console's, for another display); the main window's Cameras then offers to show or dock it, and
closing the window docks it. Moving by hand is off for the camera on
Program; Follow keeps going when its camera is cut to Program. Inspired by Churchfront Video
(Apache-2.0); its framing numbers are credited in `cameraFollow.ts`.

- **PTZ cameras** (Settings › Video › Remote control: VISCA over IP, UDP 52381, or VISCA over TCP,
  5678): `main/cameras/visca.ts` (command bytes, tested; one connection per camera, moves
  coalesced to the newest every 50 ms, position inquiries, reconnect) and `ptzService.ts`
  (`camera.ptz` commands; a move not renewed within 1 s is stopped, every camera stops on quit).
  Shots keep the camera's position counts, or one of its preset slots if it won't say.
- **Any other camera: digital shots.** `live.cameraViews` (core `schemas/camera.ts`) holds each
  camera's crop and zoom; every window applies it to that camera's picture
  (`SceneRenderer.setCameraViews`, a CSS transform eased over 120 ms, the camera never reopened).
  A change to only the views is delivered `viewsOnly`, so windows move pictures and redraw
  nothing else. Zoom is capped by the camera's capture size (`maxDigitalZoom`).
- **Follow** (`control/lib/cameraControl.ts`): the control window opens the camera, finds people
  ~12 times a second with MediaPipe's pose model (`lib/follow/detector.ts`, model in
  `assets/models/`, WebAssembly allowed by ADR 0007), keeps to one (`PersonLock`), and frames them
  (`DigitalFollow` → views, or `PtzFollow` → pan/tilt/zoom speeds). Measured on a fake camera
  panning across a photo of three people: the shot followed one person across 0.30–0.71 of the
  picture with the heads framed. The pose model's scores run low on real pictures, so it runs at
  0.1 and `personFromLandmarks` drops anything not upright (shapes in a car's wheel were measured
  coming through as "people").

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

Later: NDI _input_ (sources from the network in the switcher), tested against real sources.

## Stream keys

Keys are stored with the OS keychain/DPAPI (`SecretStore`, `userData/secrets.json`, encrypted),
never in `settings.json`, never logged, and never sent back to a window: the renderer can only
_set_ or _forget_ a key (`stream.setKey`) and ask whether one is saved (`stream.keys`). Only
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

## How much delay Lampstand adds (and what it can't change)

Measured glass to glass with `e2e/glass.spec.ts` (`LAMPSTAND_GLASS=1`): a picture changes in
Lampstand, and a local RTMP server decodes the stream as it arrives. From the command to the first
decoded frame that shows it: **about 0.2 s** at 1080p30 and 1080p60 (drawing, capture, hardware
encoding, packaging, sending, decoding).

What keeps it there:

- each frame and each piece of sound is sent the moment it's ready (`flush_packets`,
  `tcp_nodelay`, half-second input queues);
- sound is never short of the clock (its first batches wait for ffmpeg rather than being dropped),
  so ffmpeg doesn't hold video back to wait for it;
- when a destination can't keep up, video skips ahead to a keyframe rather than queueing.

The Live console's delay reading (and `delayMs` in the log's "stream health" lines) shows this live:
ffmpeg's lag behind the clock, plus a frame's wait and the encoder's time.

Everything after that belongs to the streaming service, which re-encodes the stream, cuts it into
pieces and lets players buffer a few of them. On YouTube that is roughly 15–30 s on Normal latency,
5–10 s on Low and 2–5 s on Ultra low (YouTube Studio › Stream settings › Stream latency). No
encoder can go below the service's floor over RTMP. A sub-second picture needs a different way of
delivering it (NDI on the local network; SRT or WebRTC to a receiver you run).

## Direct links (SRT, UDP)

A destination of kind **Direct link** sends straight to a receiver you run (OBS, vMix, VLC, a
decoder box) instead of a streaming service: `srt://host:port` or `udp://host:port`. It goes out as
MPEG-TS beside any RTMP destinations (the same encoded video, no second encode), and can fail on
its own without stopping the others.

- **UDP**: same network only (no resending of lost packets). Works with any ffmpeg. Measured
  glass to glass on this Mac with `LAMPSTAND_GLASS=1 LAMPSTAND_GLASS_LINK=udp`: about 0.2–0.4 s.
- **SRT**: across the internet too (lost packets are resent within 120 ms; change it with
  `?latency=` in microseconds; `?passphrase=` encrypts). Lampstand calls the receiver, which
  listens. Needs an ffmpeg built with SRT (`ffmpeg -protocols` lists `srt`); without it the
  destination says so and the rest of the stream carries on.

Receiving: in OBS, add a Media Source, untick "Local file", and set Input to `udp://@:9000` or
`srt://:9000?mode=listener`. In VLC: Open Network, `udp://@:9000` (lower "network caching" in its
options, which is 1 s by default). The receiver's own buffer is then most of the delay.

## Themes per output, and the key feed

Themes are chosen per output and kind of slide (Themes workspace): the main screens
(`settings.defaultThemes`), the alternate HDMI output and the stream (`settings.outputThemes`).
Main looks the ids up and sends the themes themselves to the output windows (`OutputInfo.themes`)
and the stream page (`StreamConfig.kindThemes`); `withKindThemes` swaps a slide's theme for its
kind. Order of precedence on the stream: its theme for that kind, then (in lower-third mode) its
lower-third theme, then the screens' lower-third theme, then the slide's own.

The alternate output (role `secondary`) can be a key feed for a video mixer
(`settings.keyFeed.mode`): `keyFeedScene` keeps the words, messages and props over flat green,
blue or black, applied after the Look so the colour is always there. Untested on a real mixer.

## Where the code is

Main process (`apps/desktop/src/main/stream/`):

| File                                                | What it holds                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `streamController.ts`                               | The session: start/stop, the stream window, ffmpeg's life, status       |
| `ffmpegArgs.ts`                                     | ffmpeg's command line, addresses, stream keys, progress lines (pure)    |
| `destinations.ts`                                   | Each destination's address, or why it can't start (pure)                |
| `audioClock.ts`                                     | The sound kept to the clock: silence for gaps, late batches dropped     |
| `textureRelay.ts`                                   | GPU pipeline: each picture to the encoder and the watching consoles     |
| `framePump.ts`                                      | CPU pipeline: frames to ffmpeg on wall-clock time                       |
| `backlog.ts`, `flv.ts`, `health.ts`, `benchmark.ts` | Video waiting for ffmpeg; FLV tags; CPU sampling; "Check this computer" |

Stream page (`renderer/stream/`): `main.ts` (the picture and the mix), `wordsLayout.ts` (lower
third sums), `encoder.ts` + `encoder.worker.ts` (the hardware encoder).

Live console (`renderer/control/components/live/`): `LiveConsole.tsx` (the frame),
`DestinationsPanel`, `QuickSettings`, `PicturePanel`, `SoundPanel`, `readings.tsx` (status pill,
readouts, health), `destinationFields.tsx` (shared with Settings), `consoleParts.tsx`. Choices
shown in both the console and Settings are listed once in `lib/streamOptions.ts`.

Measurements share `e2e/streamHarness.ts` (`perf`, `latency`, `glass` specs).

## Adaptive bitrate (staying live on a weak upload)

When the upload can't carry the stream's bitrate, the data backs up in the computer's network
buffers (macOS grows these to several MB), where nothing in the app can discard it. A user's
stream at 6 Mb/s over a slower connection drifted 30 s behind live in a minute, and the sound
was filled with silence while it waited.

`bitrate.ts` watches how far behind live the stream leaves (once a second, from ffmpeg's
progress). Past 1.2 s it lowers the hardware encoder's bitrate on the fly (WebCodecs
`configure`, no restart, from a keyframe) to 60% of what was actually being sent. Once the
stream has been live for 10 s it climbs back (×1.25 every 10 s) to the mode's bitrate. If
it chokes again within two minutes, 85% of the rate that choked (taken once, at the start of
that episode, never from the lowered readings after it) becomes a ceiling for five minutes. If the
delay is still over 3 s after lowering, it reconnects (rate-limited) to throw the backlog away.
The Live console's bitrate reading turns amber and explains when it has lowered itself. If the
bitrate is held at half the mode's or less for 30 s, the console suggests Light: at around
1 Mb/s, 540p looks sharper than 1080p (whose encoder also drops frames at that rate). The
"computer is struggling" advice is not shown while the bitrate is lowered (the upload is the cause).

During a stall ffmpeg stops reading its inputs. Up to 3 s of sound waits in its pipe (longer than
the picture is allowed to), so it arrives late but whole, instead of becoming silence. A real
stream before this change lost about 2 s of sound to each stall.

Measured with the slow-link relay (`LAMPSTAND_LATENCY_KBPS=1000`, `e2e/fixtures/throttle.py`,
1080p30): without it the delay climbed to 17 s in a minute with 39 s of sound replaced by
silence; with it the stream was live again within about 25 s, the sound intact and in sync
within 35 ms. On a fast connection nothing changes. `LAMPSTAND_ABR=0` turns it off for
comparison. (GPU pipeline only; the CPU pipeline's ffmpeg encoder keeps its bitrate.)

Capping the socket send buffer (`send_buffer_size`) was tried and made no measurable
difference, so it isn't used.
