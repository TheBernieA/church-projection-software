import { describe, expect, it } from 'vitest';
import { Segmenter, type Utterance } from './segmenter';

const RATE = 16000;

/** `ms` of a tone at `db` dBFS (RMS), or silence-ish noise when db is very low. */
function tone(ms: number, db: number): Float32Array {
  const n = Math.round((RATE * ms) / 1000);
  const amp = Math.SQRT2 * 10 ** (db / 20);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return out;
}

function run(seg: Segmenter, parts: Float32Array[], chunk = 1600): Utterance[] {
  const out: Utterance[] = [];
  for (const p of parts) {
    // Feed in uneven pieces, as an audio worklet would.
    for (let i = 0; i < p.length; i += chunk) out.push(...seg.push(p.subarray(i, i + chunk)));
  }
  return out;
}

describe('Segmenter', () => {
  it('a phrase between pauses is one utterance, with its start kept', () => {
    const seg = new Segmenter();
    const us = run(seg, [tone(1000, -70), tone(800, -20), tone(1000, -70)]);
    expect(us).toHaveLength(1);
    const u = us[0]!;
    expect(u.reason).toBe('pause');
    expect(u.startMs).toBeLessThanOrEqual(1000);
    expect(u.startMs).toBeGreaterThan(600);
    expect(u.endMs).toBeGreaterThanOrEqual(1800);
    expect(u.endMs).toBeLessThan(2100);
  });

  it('two phrases with a pause make two utterances', () => {
    const seg = new Segmenter();
    const us = run(seg, [
      tone(500, -70),
      tone(600, -20),
      tone(900, -70),
      tone(600, -22),
      tone(900, -70),
    ]);
    expect(us.map((u) => u.reason)).toEqual(['pause', 'pause']);
  });

  it('a click is not speech', () => {
    const seg = new Segmenter();
    expect(run(seg, [tone(500, -70), tone(60, -10), tone(1500, -70)])).toHaveLength(0);
  });

  it('speech that runs on is cut before the limit, and nothing is lost', () => {
    const seg = new Segmenter({ maxMs: 3000 });
    // Loud speech with one quieter dip at 2.4 s: the cut lands there.
    const us = run(seg, [
      tone(300, -70),
      tone(2400, -20),
      tone(90, -32),
      tone(2400, -20),
      tone(1000, -70),
    ]);
    expect(us[0]?.reason).toBe('max');
    expect(us[0]!.endMs).toBeGreaterThan(2500);
    expect(us[0]!.endMs).toBeLessThanOrEqual(2900);
    expect(us.at(-1)?.reason).toBe('pause');
    const total = us.reduce((n, u) => n + u.samples.length, 0);
    expect(total / RATE).toBeGreaterThan(4.8);
  });

  it('adapts to a noisy room', () => {
    const seg = new Segmenter();
    // A steady hum at -40 dB becomes the floor; speech 15 dB above it still counts.
    const us = run(seg, [tone(3000, -40), tone(700, -25), tone(1200, -40)]);
    expect(us).toHaveLength(1);
  });

  it('flush ends an utterance in progress', () => {
    const seg = new Segmenter();
    expect(run(seg, [tone(300, -70), tone(500, -20)])).toHaveLength(0);
    expect(seg.flush().map((u) => u.reason)).toEqual(['flush']);
    expect(seg.flush()).toHaveLength(0);
  });
});
