import type { CutSlope, EqBand, MixerChannel } from '@lampstand/core';
import { mixerLive } from '../../../lib/mixer';

type BandKey = '0' | '1' | '2' | '3' | '4' | '5';

/** Change some of a band's settings (sent as the drag goes, at most every 40 ms). */
export function setBand(c: MixerChannel, i: number, patch: Partial<EqBand>): void {
  if (c.locked) return;
  const key = String(i) as BandKey;
  mixerLive({ action: 'channel', id: c.id, patch: { eq: { bands: { [key]: patch } } } });
}

/** Change the low or high cut: its frequency, slope, or on/off. */
export function setCut(
  c: MixerChannel,
  which: 'hpf' | 'lpf',
  p: { hz?: number; on?: boolean; slope?: CutSlope },
): void {
  if (c.locked) return;
  const patch =
    which === 'hpf'
      ? {
          ...(p.hz !== undefined ? { hpfHz: p.hz } : {}),
          ...(p.on !== undefined ? { hpf: p.on } : {}),
          ...(p.slope !== undefined ? { hpfSlope: p.slope } : {}),
        }
      : {
          ...(p.hz !== undefined ? { lpfHz: p.hz } : {}),
          ...(p.on !== undefined ? { lpf: p.on } : {}),
          ...(p.slope !== undefined ? { lpfSlope: p.slope } : {}),
        };
  mixerLive({ action: 'channel', id: c.id, patch });
}

/** "#f0a73a" with an alpha, as rgba() (canvas colours). */
export function withAlpha(colour: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!m?.[1]) return `rgba(240,167,58,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
