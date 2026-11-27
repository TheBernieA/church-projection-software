# Lampstand — to do

What's left to build, with why it's open. Tick an item when it lands.

_Started 2026-11-26._

## Assistant and listening (docs/ai.md, ADR 0008)

- [ ] Try the planner and lyrics against the real API: the request shape, structured-output
  schemas and error wording were checked offline and with a rejected key, but no plan has been
  made with a real key yet (no Anthropic credentials on the build Mac).
- [ ] Listening on a real pulpit microphone and a desk feed, with music and a congregation: so far
  only synthesized speech through Chromium's fake microphone (latency 2–3 s on an Apple-silicon
  Mac with Whisper base). Tune the segmenter's margin and pause length there.
- [ ] Listening on Windows and an Intel Mac (never run); time Tiny vs Base on a modest laptop.
- [ ] WebGPU for Whisper: it's tried first, then WebAssembly; which one ran wasn't checked (the
  latency readout's tooltip says). Check which ops run on the GPU and whether fp16 models are
  worth a second download.
- [ ] A shortcut to show the newest suggestion (`newestPending` is ready; needs a shortcut entry).
- [ ] Verses read without their reference (quoted text), live captions, sermon points and notes,
  lyric follow, song suggestions, operator chat (Settings › Assistant › Coming next).
- [ ] The speech model download is ~78 MB at whatever speed the church's connection has: resume a
  broken download instead of starting over.

## Sound (the Mixer)

- [ ] Port Onda's meters to the Mixer: peak decay rates (IEC PPM types) and true peak.
- [ ] A de-esser (tames harsh "s" sounds on a voice): a split-band compressor on about 5–8 kHz.
- [ ] Adjustable send levels: each channel's send to the room and the stream at its own level
  (on/off today).
- [ ] Audio follows video: a channel comes up while its camera or scene is on Program and goes
  down when it isn't (vMix's "audio follow video").
- [ ] Link two channels as a stereo pair (one fader, mute and processing for both).
- [ ] Saved mixer snapshots: store the whole mix and recall it in one click (or from a cue).
- [ ] Hear the channel window's EQ on real mics: the curve is the filters' own maths and the
  spectrum was seen with music playing, but a voice through 48 dB/oct cuts and narrow notches
  hasn't been listened to yet. Spectrum when the room plays in an output window (only the
  control window's own room mix was seen).
- [ ] EQ extras: solo a band (hear just its range in headphones), a second spectrum of another
  channel to compare (masking), more than one EQ curve undo step.
- [ ] Hear the pro Mixer (`feature/pro-mixer`) running: gate, ducking and the loudness meter
  were unit-tested and their worklet run in Node, not yet heard in the app or on Windows.

- [ ] Sound desk link on a real desk: the X32/M32 and X Air profiles were written from Behringer's
  OSC documents and tested against a pretend desk only. Check every address and value scale on
  real hardware, and add the X32's low-cut slope and high cut if its firmware has them.
- [ ] Desks that aren't OSC: an Allen & Heath (MIDI over TCP) and a Yamaha transport for the
  profile format; Behringer Wing and Soundcraft Ui profiles once their OSC is confirmed.
- [ ] Import desk preset files (X32 .chn / scenes) once the format is checked on real files.
- [ ] Click through the file dialogs: presets Import… / Export all… / save one, and Import a desk
  profile were tested through their handlers only, not by picking files in the real dialogs.
- [ ] Desk link on Windows: the first UDP send may raise a firewall prompt; say so in Settings ›
  Audio › Sound desk if it does, and check reads come back through it.

## Livestream

- [ ] Upload guard on a real slow upload (CPU pipeline): its step-down was unit-tested; through
  the local relay every dip read as a stall (ffmpeg's output queue), so tune `STALL_RATE` with
  `upload dip` lines from real networks (a phone hotspot, a busy church Wi-Fi).
- [ ] Ease off more in the control window when the computer struggles: today only the stream
  previews slow down; output previews and the multiview could pause too (Onda pauses its Edit
  preview and halves camera effects).
- [ ] Recovery and the guards on Windows (never run there) and on an Intel Mac.
- [ ] The YouTube "is YouTube receiving it?" check from Onda needs YouTube sign-in, which
  Lampstand doesn't have yet.

## Cameras

- [ ] Routing per screen: today the destinations are all the screens together and the
  livestream. Send a camera to the side screens only (Churchfront routes ATEM aux outputs), and
  an NDI feed as its own destination.
- [ ] The undocked Cameras window doesn't remember where it was (display, size): reopen it there.
- [ ] Camera settings from the undocked Cameras window: the button is hidden there today (Settings
  opens in the main window); open it beside the camera window instead.
- [ ] Hear a split in a real service: the stream on one camera, the projector on slides or
  another camera, checked with the stream window only (not a real broadcast or recording).

- [ ] Camera mode on real PTZ cameras: tested against pretend VISCA cameras only (UDP and TCP).
  Check pan/tilt/zoom speeds, shots, exposure steps and Follow on a PTZOptics / Sony / BirdDog.
- [ ] Follow on a real stage: measured on a fake camera (a panning photo), not yet with someone
  walking; tune the dead zones and speeds there. Telling people apart by look (crossing paths).
- [ ] Canon PTZ over its own HTTP protocol (Canon's VISCA mode works today).
- [ ] Keyboard and control-surface control of the joystick and shots; stage scan (shots per
  person from a wide shot, as Churchfront Video does).
