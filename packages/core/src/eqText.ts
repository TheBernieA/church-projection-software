import type { Filter, FilterKind, Processing } from './schemas/processing';

/**
 * Reading an EQ from the plain-text format Equalizer APO and Room EQ Wizard (REW) write, one
 * filter per line:
 *
 *   Preamp: -6.0 dB
 *   Filter 1: ON PK Fc 105 Hz Gain -3.5 dB Q 1.41
 *   Filter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71
 *   Filter 3: ON HP Fc 80 Hz
 *   Filter 4: ON PK Fc 1000 Hz Gain 2 dB BW Oct 1.0
 *
 * Lines it can't use (an all-pass, a band-pass, anything unreadable) are reported, not guessed.
 */

const KINDS: Record<string, FilterKind> = {
  PK: 'bell',
  PEQ: 'bell',
  MODAL: 'bell',
  LS: 'lowShelf',
  LSC: 'lowShelf',
  LSQ: 'lowShelf',
  HS: 'highShelf',
  HSC: 'highShelf',
  HSQ: 'highShelf',
  NO: 'notch',
  HP: 'lowCut',
  HPQ: 'lowCut',
  LP: 'highCut',
  LPQ: 'highCut',
};

export interface EqTextResult {
  processing: Processing;
  /** Lines that weren't used, with why (1-based line numbers). */
  skipped: { line: number; text: string; reason: 'unknownType' | 'unreadable' }[];
  /** The file's overall level change (Preamp), which an EQ preset doesn't carry. */
  preampDb: number | null;
}

/** Q for a bandwidth in octaves. */
const qFromOctaves = (n: number): number => Math.sqrt(Math.pow(2, n)) / (Math.pow(2, n) - 1);

const num = (re: RegExp, s: string): number | null => {
  const m = re.exec(s);
  const v = m?.[1] === undefined ? NaN : Number(m[1]);
  return Number.isFinite(v) ? v : null;
};

/** The filters in an Equalizer APO / REW text EQ; null if no line is a filter at all. */
export function parseEqText(text: string): EqTextResult | null {
  const filters: Filter[] = [];
  const skipped: EqTextResult['skipped'] = [];
  let preampDb: number | null = null;
  let any = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line || line.startsWith('#') || line.startsWith('*')) continue;
    const pre = /^preamp\s*:\s*([-+]?[\d.]+)\s*db/i.exec(line);
    if (pre?.[1]) {
      preampDb = Number(pre[1]);
      continue;
    }
    const m = /^filter\s*\d*\s*:\s*(on|off)\s+([a-z]+)\b(.*)$/i.exec(line);
    if (!m?.[1] || !m[2]) continue;
    any = true;
    const type = m[2].toUpperCase();
    const rest = m[3] ?? '';
    const kind = KINDS[type];
    if (!kind) {
      skipped.push({ line: i + 1, text: line.slice(0, 120), reason: 'unknownType' });
      continue;
    }
    const hz = num(/([-+]?[\d.]+)\s*hz/i, rest);
    if (hz === null || hz < 10 || hz > 24_000) {
      skipped.push({ line: i + 1, text: line.slice(0, 120), reason: 'unreadable' });
      continue;
    }
    const db = num(/gain\s*([-+]?[\d.]+)\s*db/i, rest) ?? 0;
    const octaves = num(/bw\s*oct\s*([-+]?[\d.]+)/i, rest);
    const q = num(/\bq\s*([-+]?[\d.]+)/i, rest) ?? (octaves ? qFromOctaves(octaves) : null);
    const cut = kind === 'lowCut' || kind === 'highCut';
    filters.push({
      kind,
      on: m[1].toLowerCase() === 'on',
      hz,
      db: cut ? 0 : Math.max(-30, Math.min(30, db)),
      q: Math.max(0.05, Math.min(40, q ?? (kind === 'bell' || kind === 'notch' ? 1 : 0.71))),
      ...(cut ? { slope: 12 } : {}),
    });
  }
  if (!any) return null;
  return { processing: { eqOn: true, filters: filters.slice(0, 32) }, skipped, preampDb };
}
