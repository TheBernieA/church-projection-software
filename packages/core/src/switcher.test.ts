import { describe, expect, it } from 'vitest';
import { initialLiveState } from './live';
import { applySwitcherAction } from './switcher';
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
