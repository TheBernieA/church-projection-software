# Lampstand — to do

What's left to build, with why it's open. Tick an item when it lands.

_Started 2026-11-26._

## Sound (the Mixer)

- [ ] Port Onda's meters to the Mixer: peak decay rates (IEC PPM types) and true peak.
- [ ] A de-esser (tames harsh "s" sounds on a voice): a split-band compressor on about 5–8 kHz.
- [ ] Adjustable send levels: each channel's send to the room and the stream at its own level
  (on/off today).
- [ ] Audio follows video: a channel comes up while its camera or scene is on Program and goes
  down when it isn't (vMix's "audio follow video").
- [ ] Link two channels as a stereo pair (one fader, mute and processing for both).
- [ ] Saved mixer snapshots: store the whole mix and recall it in one click (or from a cue).
- [ ] Hear the pro Mixer (`feature/pro-mixer`) running: gate, ducking and the loudness meter
  were unit-tested and their worklet run in Node, not yet heard in the app or on Windows.

## Cameras

- [ ] Camera mode on real PTZ cameras: tested against pretend VISCA cameras only (UDP and TCP).
  Check pan/tilt/zoom speeds, shots, exposure steps and Follow on a PTZOptics / Sony / BirdDog.
- [ ] Follow on a real stage: measured on a fake camera (a panning photo), not yet with someone
  walking; tune the dead zones and speeds there. Telling people apart by look (crossing paths).
- [ ] Canon PTZ over its own HTTP protocol (Canon's VISCA mode works today).
- [ ] Keyboard and control-surface control of the joystick and shots; stage scan (shots per
  person from a wide shot, as Churchfront Video does).
