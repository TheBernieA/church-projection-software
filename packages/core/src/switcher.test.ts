import { describe, expect, it } from 'vitest';
import { initialLiveState } from './live';
import { applySwitcherAction, cameraOn } from './switcher';
import type { VideoInputLayer } from './schemas/scene';

const cam = (id: string): VideoInputLayer => ({
  deviceId: id,
  label: id,
  fit: 'cover',
  mirror: false,
  resolution: 'auto',
});
const FADE = { kind: 'fade' as const, durationMs: 600 };

describe('video switcher', () => {
  it('preview, then auto: Program gets it with the transition, and the old camera comes back to Preview', () => {
    let s = initialLiveState();
    s = applySwitcherAction(s, { action: 'take', input: cam('a') });
    expect(s.program.input?.deviceId).toBe('a');
    expect(s.program.inputTransition).toBeUndefined();
    s = applySwitcherAction(s, { action: 'preview', input: cam('b') });
    s = applySwitcherAction(s, { action: 'auto', transition: FADE });
    expect(s.program.input?.deviceId).toBe('b');
    expect(s.program.inputTransition).toEqual(FADE);
    expect(s.switcher.preview?.deviceId).toBe('a');
    // Cut swaps back, with no transition.
    s = applySwitcherAction(s, { action: 'cut' });
    expect(s.program.input?.deviceId).toBe('a');
    expect(s.program.inputTransition).toBeUndefined();
  });

  it('a camera going live replaces a playing video', () => {
    let s = initialLiveState();
    s = {
      ...s,
      program: {
        ...s.program,
        media: {
          mediaId: 'm',
          kind: 'video',
          fit: 'cover',
          loop: false,
          muted: false,
          volume: 1,
          playing: true,
          position: 0,
        } as never,
      },
    };
    s = applySwitcherAction(s, { action: 'take', input: cam('a'), transition: FADE });
    expect(s.program.media).toBeNull();
  });

  it('the T-bar mixes, then finishes past half-way or goes back', () => {
    let s = applySwitcherAction(initialLiveState(), { action: 'take', input: cam('a') });
    s = applySwitcherAction(s, { action: 'preview', input: cam('b') });
    s = applySwitcherAction(s, { action: 'tbar', pos: 0.3 });
    expect(s.program.inputNext).toMatchObject({ pos: 0.3, input: { deviceId: 'b' } });
    s = applySwitcherAction(s, { action: 'tbarRelease' });
    expect(s.program.inputNext).toBeNull();
    expect(s.program.input?.deviceId).toBe('a');
    s = applySwitcherAction(s, { action: 'tbar', pos: 0.8 });
    s = applySwitcherAction(s, { action: 'tbarRelease' });
    expect(s.program.input?.deviceId).toBe('b');
    expect(s.program.inputTransition).toEqual({ kind: 'fade', durationMs: 100 });
    expect(s.switcher.preview?.deviceId).toBe('a');
  });

  it('picture-in-picture sits over the program, and Clear media takes it off', () => {
    let s = applySwitcherAction(initialLiveState(), {
      action: 'pip',
      pip: { ...cam('c'), corner: 'tr', size: 0.25 },
    });
    expect(s.program.pip?.corner).toBe('tr');
    s = applySwitcherAction(s, { action: 'pip', pip: null });
    expect(s.program.pip).toBeNull();
  });

  it('does nothing when there is nothing to take', () => {
    const s = initialLiveState();
    expect(applySwitcherAction(s, { action: 'cut' })).toBe(s);
    expect(applySwitcherAction(s, { action: 'tbar', pos: 0.5 })).toBe(s);
  });
});

describe('screens and stream on different cameras', () => {
  const live = () => applySwitcherAction(initialLiveState(), { action: 'take', input: cam('a') });

  it('linked by default: the stream shows the screens’ camera', () => {
    const s = live();
    expect(s.streamCut).toBeNull();
    expect(cameraOn(s, 'stream')?.deviceId).toBe('a');
  });

  it('a take to the stream alone changes only the stream, with its own transition', () => {
    let s = applySwitcherAction(live(), { action: 'preview', input: cam('b') });
    s = applySwitcherAction(s, { action: 'auto', transition: FADE, to: 'stream' });
    expect(s.program.input?.deviceId).toBe('a');
    expect(s.streamCut).toMatchObject({ input: { deviceId: 'b' }, inputTransition: FADE });
    // The stream's old camera comes back to Preview.
    expect(s.switcher.preview?.deviceId).toBe('a');
  });

  it('a take to the screens alone keeps the stream on what it had', () => {
    let s = applySwitcherAction(live(), { action: 'preview', input: cam('b') });
    s = applySwitcherAction(s, { action: 'cut', to: 'screens' });
    expect(s.program.input?.deviceId).toBe('b');
    expect(s.streamCut?.input?.deviceId).toBe('a');
    expect(s.streamCut?.inputNext).toBeNull();
    // The screens can even show no camera (just the slides) while the stream keeps one.
    s = applySwitcherAction(s, { action: 'take', input: null, to: 'screens' });
    expect(s.program.input ?? null).toBeNull();
    expect(cameraOn(s, 'stream')?.deviceId).toBe('a');
  });

  it('a take to both, or Link, joins them again', () => {
    let s = applySwitcherAction(live(), { action: 'take', input: cam('b'), to: 'stream' });
    expect(cameraOn(s, 'stream')?.deviceId).toBe('b');
    s = applySwitcherAction(s, { action: 'take', input: cam('c') });
    expect(s.streamCut).toBeNull();
    expect(cameraOn(s, 'stream')?.deviceId).toBe('c');
    s = applySwitcherAction(s, { action: 'take', input: cam('b'), to: 'stream' });
    s = applySwitcherAction(s, { action: 'link' });
    expect(cameraOn(s, 'stream')?.deviceId).toBe('c');
    // Split, then the screens' camera to both: the stream joins it (it wasn't on it before).
    s = applySwitcherAction(s, { action: 'take', input: cam('b'), to: 'stream' });
    s = applySwitcherAction(s, { action: 'take', input: cam('c') });
    expect(s.streamCut).toBeNull();
  });

  it('the T-bar mixes the stream alone, then finishes there', () => {
    let s = applySwitcherAction(live(), { action: 'preview', input: cam('b') });
    s = applySwitcherAction(s, { action: 'tbar', pos: 0.7, to: 'stream' });
    expect(s.program.inputNext ?? null).toBeNull();
    expect(s.streamCut?.inputNext).toMatchObject({ pos: 0.7 });
    s = applySwitcherAction(s, { action: 'tbarRelease', to: 'stream' });
    expect(cameraOn(s, 'stream')?.deviceId).toBe('b');
    expect(s.program.input?.deviceId).toBe('a');
  });
});
