import { describe, expect, it } from 'vitest';
import type { HealthSample } from './health';
import { Recovery, type RecoveryAction, type RecoveryInput } from './recovery';

const GOOD: HealthSample = { speed: 1, sent: 60, dropped: 0 };
const BAD: HealthSample = { speed: 0.8, sent: 60, dropped: 10 };
const SAMPLE_MS = 2000;

/** Feeds samples every 2 s, keeping the last 60 like the session does. */
function run(r: Recovery, o: Partial<RecoveryInput> = {}) {
  let now = 1_000_000;
  let samples: HealthSample[] = [];
  const input = { uploadBound: false, canLighten: true, lightened: 0, ...o };
  return {
    input,
    /** n samples of one kind; the actions taken (nulls dropped). */
    feed(s: HealthSample, n: number): RecoveryAction[] {
      const out: RecoveryAction[] = [];
      for (let i = 0; i < n; i++) {
        now += SAMPLE_MS;
        samples = [...samples, s].slice(-60);
        const a = r.next(samples, { ...input, now });
        if (a) out.push(a);
      }
      return out;
    },
    restart() {
      samples = [];
      r.restarted();
    },
    change(d: 'lighter' | 'heavier') {
      r.changed(now, d);
    },
  };
}

describe('recovering from a computer that can’t keep up', () => {
  it('eases off at the warning and comes back after 30 s of keeping up', () => {
    const r = new Recovery(false);
    const t = run(r);
    expect(t.feed(BAD, 8)).toEqual(['advise']);
    expect(r.easeOff).toBe(true);
    expect(t.feed(GOOD, 15)).toEqual(['clear']);
    expect(r.easeOff).toBe(false);
  });

  it('a second struggle keeps the studio eased off for the rest of the session', () => {
    const r = new Recovery(false);
    const t = run(r);
    t.feed(BAD, 8);
    t.feed(GOOD, 15);
    expect(t.feed(BAD, 8)).toEqual(['advise']);
    expect(t.feed(GOOD, 30)).toEqual(['clear']);
    expect(r.easeOff).toBe(true);
  });

  it('auto-lighten steps down 30 s after the warning, never twice within a minute', () => {
    const r = new Recovery(true);
    const t = run(r);
    expect(t.feed(BAD, 23)).toEqual(['advise', 'lighten']);
    t.change('lighter');
    t.restart();
    t.input.lightened = 1;
    // Still struggling at the lighter mode: the next step waits out the gap.
    expect(t.feed(BAD, 22)).toEqual(['advise']);
    expect(t.feed(BAD, 10)).toEqual(['lighten']);
  });

  it('goes back up after 2 minutes steady, by itself with auto-lighten', () => {
    const r = new Recovery(true);
    const t = run(r, { lightened: 1 });
    t.feed(BAD, 8);
    t.change('lighter');
    t.restart();
    const acts = t.feed(GOOD, 60);
    expect(acts).toEqual(['clear', 'restore']);
  });

  it('only offers going back without auto-lighten, once, and the offer outlives a reconnect', () => {
    const r = new Recovery(false);
    const t = run(r, { lightened: 1 });
    t.feed(BAD, 8);
    t.change('lighter');
    t.restart();
    expect(t.feed(GOOD, 90)).toEqual(['clear', 'offerRestore']);
    expect(r.offering).toBe(true);
    t.restart(); // a reconnect: still on offer, not offered again
    expect(r.offering).toBe(true);
    expect(t.feed(GOOD, 90)).toEqual([]);
    t.change('heavier'); // taken: the next step back is earned anew
    expect(r.offering).toBe(false);
  });

  it('struggling again soon after going back up: stays light for the session', () => {
    const r = new Recovery(true);
    const t = run(r, { lightened: 1 });
    t.feed(BAD, 8);
    t.change('lighter');
    t.restart();
    t.feed(GOOD, 60);
    t.change('heavier');
    t.restart();
    t.input.lightened = 0;
    // Advised at 16 s; the next change waits a minute from going back up.
    expect(t.feed(BAD, 31)).toEqual(['advise', 'lighten']);
    expect(r.stayLight).toBe(true);
    t.change('lighter');
    t.restart();
    t.input.lightened = 1;
    // Steady for 4 minutes: going back up didn't hold, so no more of it; the studio stays
    // eased off (second struggle).
    expect(t.feed(GOOD, 120)).toEqual([]);
    expect(r.easeOff).toBe(true);
  });

  it('struggling on through a lighter mode is one struggle: the studio still comes back', () => {
    const r = new Recovery(false);
    const t = run(r);
    t.feed(BAD, 8);
    t.change('lighter');
    t.restart();
    expect(t.feed(BAD, 8)).toEqual(['advise']);
    t.change('lighter');
    t.restart();
    expect(t.feed(GOOD, 15)).toEqual(['clear']);
    expect(r.easeOff).toBe(false);
  });

  it('offers going back again after a new struggle has been overcome', () => {
    const r = new Recovery(false);
    const t = run(r, { lightened: 1 });
    t.feed(BAD, 8);
    t.change('lighter');
    t.restart();
    expect(t.feed(GOOD, 60)).toEqual(['clear', 'offerRestore']);
    expect(t.feed(BAD, 8)).toEqual(['advise']);
    // Second struggle: the studio stays eased off, but the stream's mode can still go back.
    expect(t.feed(GOOD, 90)).toEqual(['clear', 'offerRestore']);
    expect(r.easeOff).toBe(true);
  });

  it('switching auto-lighten on while live takes over from the offer', () => {
    const r = new Recovery(false);
    const t = run(r, { lightened: 1 });
    t.feed(BAD, 8);
    t.change('lighter');
    t.restart();
    expect(t.feed(GOOD, 60)).toEqual(['clear', 'offerRestore']);
    r.autoLighten = true;
    expect(t.feed(GOOD, 1)).toEqual(['restore']);
  });

  it('an upload problem is never the computer’s', () => {
    const r = new Recovery(true);
    expect(run(r, { uploadBound: true }).feed(BAD, 30)).toEqual([]);
  });
});
