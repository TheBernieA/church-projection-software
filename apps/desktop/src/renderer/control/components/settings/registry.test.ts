import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@lampstand/core';
import en from '../../locales/en.json';
import { PAGE_ICONS, PAGE_ORDER, resetPatch, searchSettings, SEARCH_INDEX } from './registry';

const lookup = (key: string): string | undefined => {
  let v: unknown = en;
  for (const part of key.split('.')) v = (v as Record<string, unknown> | undefined)?.[part];
  return typeof v === 'string' ? v : undefined;
};
const t = (key: string): string => lookup(key) ?? key;

describe('settings registry', () => {
  it('lists every page once, each with an icon and a name', () => {
    expect(new Set(PAGE_ORDER).size).toBe(PAGE_ORDER.length);
    expect([...PAGE_ORDER].sort()).toEqual(Object.keys(PAGE_ICONS).sort());
    for (const p of PAGE_ORDER) expect(lookup(`settings.pages.${p}`), p).toBeTruthy();
  });

  it('indexes only real labels on real pages', () => {
    for (const e of SEARCH_INDEX) {
      expect(PAGE_ORDER).toContain(e.page);
      expect(lookup(e.label), e.label).toBeTruthy();
    }
  });

  it('finds a setting by what people call it', () => {
    const hits = searchSettings('stream key', t);
    expect(hits[0]).toEqual({ page: 'streaming', label: t('streaming.destinations') });
    expect(searchSettings('scripture', t)[0]).toEqual({ page: 'scripture', label: 'Scripture' });
    expect(searchSettings('', t)).toEqual([]);
    expect(searchSettings('zzqx', t)).toEqual([]);
  });

  it('resets preferences but keeps what you made', () => {
    const s = defaultSettings();
    s.stream.destinations = [
      { id: 'd1', kind: 'youtube', name: 'YouTube', url: '', enabled: true },
    ];
    s.stream.quality.videoKbps = 9000;
    const patch = resetPatch('streaming', s);
    expect(patch?.stream?.destinations).toHaveLength(1);
    expect(patch?.stream?.quality.videoKbps).toBe(3500);
    expect(resetPatch('packages', s)).toBeNull();
  });
});
