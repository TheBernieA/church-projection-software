import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_DESKS,
  decodeParam,
  deskAddress,
  deskCaps,
  deskProcessing,
  deskProfileFileText,
  deskProfiles,
  deskReadAddresses,
  deskWrites,
  encodeParam,
  readDeskProfileFile,
} from './desk';
import type { DeskParam } from './schemas/desk';
import type { Processing } from './schemas/processing';
import type { OscValue } from './surfaces';

const x32 = BUILT_IN_DESKS[0]!;
const param = (p: Partial<DeskParam>): DeskParam => ({
  address: '/x',
  scale: 'lin',
  min: 0,
  max: 1,
  normalized: true,
  type: 'f',
  ...p,
});

describe('a sound desk, from its profile', () => {
  it('formats addresses as the desk expects', () => {
    expect(deskAddress(x32, '/ch/{ch}/eq/{band}/f', 4, 2)).toBe('/ch/04/eq/2/f');
    expect(deskAddress({ ...x32, channelFormat: 'plain' }, '/ch/{ch}/x', 12)).toBe('/ch/12/x');
  });

  it('scales values both ways: linear, log (even high to low), and steps', () => {
    const hz = param({ scale: 'log', min: 20, max: 20_000 });
    expect(encodeParam(hz, 632.5)).toMatchObject({ type: 'f' });
    expect(decodeParam(hz, (encodeParam(hz, 1000) as { value: number }).value)).toBeCloseTo(
      1000,
      3,
    );
    const q = param({ scale: 'log', min: 10, max: 0.3 });
    expect((encodeParam(q, 10) as { value: number }).value).toBeCloseTo(0);
    expect((encodeParam(q, 0.3) as { value: number }).value).toBeCloseTo(1);
    expect(decodeParam(q, 0.5)).toBeCloseTo(Math.sqrt(10 * 0.3), 4);
    const g = param({ min: -15, max: 15 });
    expect(encodeParam(g, 0)).toEqual({ type: 'f', value: 0.5 });
    expect(encodeParam(g, 40)).toEqual({ type: 'f', value: 1 });
    const ratio = param({ scale: 'steps', steps: [1.1, 2, 3, 4], type: 'i' });
    expect(encodeParam(ratio, 3.3)).toEqual({ type: 'i', value: 2 });
    expect(decodeParam(ratio, 3)).toBe(4);
    expect(decodeParam(g, 'x')).toBeNull();
  });

  it('knows what the X32 can do', () => {
    const caps = deskCaps(x32);
    expect(caps.bands).toBe(4);
    expect(caps.bandKinds).toEqual(expect.arrayContaining(['bell', 'lowShelf', 'highCut']));
    expect(caps.bandKinds).not.toContain('notch');
    expect(caps.q).toEqual({ min: 0.3, max: 10 });
    expect(caps.lowCut?.hz).toEqual({ min: 20, max: 400 });
    expect(caps.highCut).toBeNull();
  });

  it('what it writes reads back as the same processing (a pretend X32 channel)', () => {
    const p: Processing = {
      eqOn: true,
      filters: [
        { kind: 'lowCut', on: true, hz: 100, db: 0, q: 0.71, slope: 12 },
        { kind: 'lowShelf', on: true, hz: 150, db: -3, q: 0.7 },
        { kind: 'bell', on: true, hz: 2500, db: 4, q: 1.4 },
        { kind: 'highCut', on: true, hz: 14_000, db: 0, q: 0.71, slope: 12 },
      ],
      gate: { on: true, thresholdDb: -50 },
      comp: { on: true, thresholdDb: -20, ratio: 3, attackMs: 10, releaseMs: 200, makeupDb: 4 },
    };
    const { messages, notes } = deskWrites(x32, 7, p);
    expect(notes).toEqual([{ code: 'cutAsBand', which: 'highCut' }]);
    expect(messages.every((m) => m.address.startsWith('/ch/07/'))).toBe(true);
    // The desk, remembering what it was sent.
    const desk = new Map<string, OscValue>(deskReadAddresses(x32, 7).map((ad) => [ad, 0.5]));
    for (const m of messages) {
      const arg = m.args[0];
      if (arg && arg.type !== 'none') desk.set(m.address, arg.value);
    }
    desk.set('/ch/07/config/name', 'Pulpit');
    for (const a of deskReadAddresses(x32, 7))
      expect(desk.has(a) || a.includes('/eq/4/type')).toBe(true);
    const back = deskProcessing(x32, 7, desk);
    expect(back?.name).toBe('Pulpit');
    const f = back?.processing.filters ?? [];
    expect(f.find((x) => x.kind === 'lowCut')?.hz).toBeCloseTo(100, 1);
    expect(f.find((x) => x.kind === 'lowShelf')).toMatchObject({
      db: expect.closeTo(-3, 2) as number,
    });
    expect(f.find((x) => x.kind === 'bell')?.hz).toBeCloseTo(2500, 0);
    expect(f.find((x) => x.kind === 'bell')?.q).toBeCloseTo(1.4, 2);
    expect(f.find((x) => x.kind === 'highCut')?.hz).toBeCloseTo(14_000, -1);
    expect(back?.processing.comp).toMatchObject({ on: true, ratio: 3 });
    expect(back?.processing.comp?.releaseMs).toBeCloseTo(200, 0);
    expect(back?.processing.gate).toMatchObject({ on: true, thresholdDb: -50 });
  });

  it('a desk that didn’t answer reads as nothing, not as a flat EQ', () => {
    expect(deskProcessing(x32, 1, new Map())).toBeNull();
  });

  it('EQ-only processing leaves the desk’s dynamics alone', () => {
    const { messages } = deskWrites(x32, 1, { eqOn: true, filters: [] });
    expect(messages.some((m) => m.address.includes('/dyn/') || m.address.includes('/gate/'))).toBe(
      false,
    );
    // Every band is set flat, so nothing from before stays.
    expect(messages.filter((m) => m.address.endsWith('/g'))).toHaveLength(4);
  });

  it('profile files load (and replace a built-in one with the same id), anything else is refused', () => {
    const mine = { ...x32, id: 'behringer-x32', name: 'Our X32' };
    expect(readDeskProfileFile(deskProfileFileText(mine))).toEqual(mine);
    expect(readDeskProfileFile('{"format":"lampstand-desk-profile","version":1}')).toBeNull();
    expect(
      readDeskProfileFile(
        '{"format":"lampstand-desk-profile","version":1,"profile":{"id":"x","name":"x","transport":"osc-udp","port":1,"channels":1,"probe":"not an address"}}',
      ),
    ).toBeNull();
    const all = deskProfiles([mine]);
    expect(all.filter((p) => p.id === 'behringer-x32')).toEqual([mine]);
    expect(all).toHaveLength(BUILT_IN_DESKS.length);
  });
});
