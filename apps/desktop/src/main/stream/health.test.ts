import { describe, expect, it } from 'vitest';
import { isKeepingUp, isStruggling, parsePs, Ring, type HealthSample } from './health';

describe('stream health', () => {
  it('reads ps', () => {
    expect(parsePs('  12.5  204800\n')).toEqual({ cpu: 12.5, memMB: 200 });
    expect(parsePs('')).toBeNull();
    expect(parsePs('abc')).toBeNull();
  });

  it('keeps a short history', () => {
    const r = new Ring(3);
    for (const v of [1, 2, 3, 4]) r.push(v);
    expect(r.values).toEqual([2, 3, 4]);
  });

  it('calls it struggling only when it lasts', () => {
    const ok = { speed: 1, sent: 60, dropped: 0 };
    const slow = { speed: 0.85, sent: 60, dropped: 0 };
    const dropping = { speed: 1, sent: 60, dropped: 3 };
    expect(isStruggling(Array<typeof ok>(8).fill(ok))).toBe(false);
    expect(isStruggling(Array<typeof ok>(7).fill(slow))).toBe(false);
    expect(isStruggling(Array<typeof ok>(8).fill(slow))).toBe(true);
    expect(isStruggling([...Array<typeof slow>(7).fill(slow), ok])).toBe(false);
    expect(isStruggling(Array<typeof ok>(8).fill(dropping))).toBe(true);
    // One burst of late frames, at full speed: a hiccup, not a struggling computer.
    expect(
      isStruggling([...Array<typeof ok>(7).fill(ok), { speed: 1, sent: 60, dropped: 11 }]),
    ).toBe(false);
  });
});

describe('keeping up again', () => {
  const good = { speed: 1, sent: 60, dropped: 0 };
  const goods = (n: number): HealthSample[] => Array.from({ length: n }, () => good);
  it('needs 30 s at full speed with almost no late frames', () => {
    expect(isKeepingUp(goods(14))).toBe(false);
    expect(isKeepingUp(goods(15))).toBe(true);
    expect(isKeepingUp([...goods(14), { speed: 0.9, sent: 60, dropped: 0 }])).toBe(false);
    expect(isKeepingUp([...goods(14), { speed: 1, sent: 60, dropped: 10 }])).toBe(false);
  });
});
