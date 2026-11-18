# Control surfaces (MIDI and OSC)

A sound desk, a MIDI controller or an OSC app can run Lampstand, and Lampstand can tell the desk
what is happening. Nothing is specific to one make: the operator teaches Lampstand each control
("Learn"), so any desk that sends MIDI or OSC works.

## Setting it up (Settings › Sound & live › Control surfaces)

1. **Connect the desk.**
   - **MIDI:** plug it in by USB, or through a MIDI interface. It appears under MIDI straight
     away; install the maker's driver first if it needs one. Many USB desks and controllers
     need none on a Mac.
   - **OSC:** turn on "OSC over the network" and pick a port. Point the desk or app at the
     address shown ("Point the desk or app at 192.168.1.20, port 9000").
   - To send OSC back, enter the desk's address and its OSC port (an X32 listens on 10023).
2. **Add controls.** Choose what a control does, press **Learn**, then move the fader or press
   the button on the desk. A control can be:
   - **A show action:** go live, next or previous slide, the clears, black, logo, freeze,
     panic, Cut, Auto, or play/pause the video.
   - **A camera:** to Preview, or straight on screen (cameras 1–9, as in Media › Video input).
   - **A mixer fader or mute:** any channel, the room master or the stream master.
   - **The T-bar.**
3. **Motor faders and button lights follow** (on by default). Faders and mutes moved in
   Lampstand are sent back, so motorised faders move and button lights match. A control that
   the desk is moving is left alone for 0.4 s, so it never fights the hand on it.
4. **Send to the desk** sends a MIDI or OSC message when something happens:
   - a video starts or stops;
   - a camera goes on screen or comes off;
   - the livestream goes live or ends;
   - the screen goes black or is cleared.

   Example: mute the pulpit mic while a video plays, with `/ch/05/mix/on` and the value 0 on
   an X32. Use **Test** to send a cue now.

The Activity row shows the last control Lampstand heard. Move one to check the connection.

## How messages are read

| Message | Read as |
|---|---|
| MIDI CC | position 0–127 → 0–1 |
| MIDI note on / off | pressed with its velocity / released (note on with velocity 0 is off) |
| MIDI pitch bend | 14-bit position (motor faders in Mackie/HUI mode) |
| MIDI program change | a press |
| OSC with a number | the first number is the position (floats 0–1, integers on/off) |
| OSC with no argument | a press |

- **Buttons** fire once when the position rises through the middle, so a key sending 127 then
  0 fires once, and a fader resting near the middle doesn't chatter.
- **Faders** use the same curve as the on-screen faders: the bottom 45% covers −∞ to −20 dB,
  and the rest −20 to +12 dB.
- **The T-bar:** a hardware bar takes one take moving top to bottom, and the next moving back
  up. Pulling it back to where it started calls the take off.

## Code

| Part | Where |
|---|---|
| Settings schema | `packages/core/src/schemas/surfaces.ts` |
| MIDI and OSC parsing and encoding, matching, presses | `packages/core/src/surfaces.ts` (tested) |
| OSC over UDP | `apps/desktop/src/main/surfaces/oscServer.ts` (tested with real sockets) |
| Engine: Web MIDI, bindings, feedback, desk cues | `apps/desktop/src/renderer/control/lib/surfaces.ts` (tested) |
| Settings page | `apps/desktop/src/renderer/control/components/settings/surfaces.tsx` |

The end-to-end test drives the real app over OSC: a desk fader moves the Tracks channel; a
button turns the screen black; the black cue reaches the desk; and moving the fader in Lampstand
sends its position back.

- **MIDI hardware:** the only part with no automated test. A test machine has no MIDI device;
  the test checks that MIDI access is allowed.
- **Permission:** Electron files every Web MIDI request under `midiSysex`. Lampstand allows it
  only for its own windows, and itself asks for plain MIDI.
- **Speed:** a fader can send hundreds of messages a second.
  - Matching is a loop over the bindings.
  - Mixer moves go out at most every 40 ms through `mixerLive`, and T-bar moves through `tbar`.
  - The activity light updates at most 10 times a second.
