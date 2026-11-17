import { describe, expect, it } from 'vitest';
import type { Writable } from 'node:stream';
import { AudioClock, BYTES_PER_SECOND } from './audioClock';

function setup(): {
  clock: AudioClock;
  out: { writable: boolean; writableLength: number };
  sent: number[];
  at: (ms: number) => void;
} {
  let now = 1000;
  const sent: number[] = [];
  const out = {
    writable: true,
    writableLength: 0,
    write: (b: Buffer) => void sent.push(b.length),
  };
  const clock = new AudioClock(
    () => out as unknown as Writable,
    () => now,
  );
  clock.begin();
  return { clock, out, sent, at: (ms) => void (now = 1000 + ms) };
}
const ms = (n: number): number => (BYTES_PER_SECOND * n) / 1000;

describe('the stream sound clock', () => {
  it('writes sound that keeps to the clock', () => {
    const { clock, sent, at } = setup();
    at(20);
    expect(clock.write(Buffer.alloc(ms(20)))).toBe(true);
    expect(sent).toEqual([ms(20)]);
    expect(clock.report().audioLeadMs).toBe(0);
  });

  it('waits before filling a gap, then fills it with whole frames of silence', () => {
    const { clock, sent, at } = setup();
    at(100);
    clock.topUp();
    expect(sent).toEqual([]); // within the slack: a late batch may still come
    at(300);
    clock.topUp();
    expect(sent).toEqual([ms(300)]);
    expect(sent[0]! % 8).toBe(0);
    expect(clock.report().audioPaddedMs).toBe(300);
  });

  it('drops a batch that arrives after its gap was filled', () => {
    const { clock, sent, at } = setup();
    at(300);
    clock.topUp();
    expect(clock.write(Buffer.alloc(ms(100)))).toBe(true); // level with the clock: written
    expect(clock.write(Buffer.alloc(ms(100)))).toBe(true); // 100 ms ahead: within the slack
    expect(clock.write(Buffer.alloc(ms(100)))).toBe(false); // 200 ms ahead: its gap was filled
    expect(sent).toHaveLength(3);
    expect(clock.report().audioDroppedMs).toBe(100);
  });

  it('lets up to half a second wait for ffmpeg, no more', () => {
    const { clock, out, at } = setup();
    at(20);
    out.writableLength = BYTES_PER_SECOND * 0.4;
    expect(clock.write(Buffer.alloc(ms(20)))).toBe(true);
    out.writableLength = BYTES_PER_SECOND * 0.6;
    expect(clock.write(Buffer.alloc(ms(20)))).toBe(false);
    out.writable = false;
    out.writableLength = 0;
    expect(clock.write(Buffer.alloc(ms(20)))).toBe(false);
  });

  it('starts clean for a new session', () => {
    const { clock, at } = setup();
    at(300);
    clock.topUp();
    clock.reset();
    expect(clock.started).toBe(false);
    expect(clock.report().audioPaddedMs).toBe(0);
  });
});
