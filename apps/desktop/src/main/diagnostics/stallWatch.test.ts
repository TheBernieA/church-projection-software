import { describe, expect, it } from 'vitest';
import { stallReport } from './stallWatch';

describe('a main-process stall, explained', () => {
  it('counts the garbage collection that overlapped it', () => {
    const r = stallReport(
      600,
      10_000,
      [
        { start: 9_500, duration: 300 }, // inside
        { start: 9_300, duration: 200 }, // starts before, 100 ms inside
        { start: 5_000, duration: 400 }, // long before
      ],
      [],
    );
    expect(r).toMatchObject({ ms: 600, gcMs: 400, gcMaxMs: 300 });
  });

  it('lists what main did in the seconds before, newest closest to the stall', () => {
    const r = stallReport(
      500,
      10_000,
      [],
      [
        { at: 2_000, what: 'ipc:too-old' },
        { at: 9_000, what: 'ipc:stream.status' },
        { at: 9_400, what: 'part:logo' },
      ],
    );
    expect(r.before).toEqual(['ipc:stream.status 1000ms', 'part:logo 600ms']);
    expect(r.gcMs).toBe(0);
  });
});
