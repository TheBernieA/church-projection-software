import type { BackgroundRef, GeneratedPreset } from './schemas/theme';

export interface BuiltInBackground {
  name: string;
  ref: BackgroundRef;
}

const motion = (
  name: string,
  preset: GeneratedPreset,
  colors: string[],
  speed = 1,
): BuiltInBackground => ({ name, ref: { kind: 'generated', preset, colors, speed } });

const still = (name: string, angle: number, ...stops: [string, number][]): BuiltInBackground => ({
  name,
  ref: { kind: 'gradient', angle, stops: stops.map(([color, pos]) => ({ color, pos })) },
});

/**
 * Built-in backgrounds: drawn by the renderer at any resolution, licence-free (§12), with lyric-safe
 * contrast (dark, low-detail centres). Motion ones animate on the outputs; the last colour is the base.
 */
export const BUILT_IN_BACKGROUNDS: BuiltInBackground[] = [
  // Motion
  motion("Heaven's light", 'rays', ['#F6DFAE', '#C79A55', '#0B0805'], 0.8),
  motion('Morning light', 'rays', ['#EAF3FF', '#8DB6F2', '#08142A'], 0.8),
  motion('Halo', 'halo', ['#E9C77B', '#33417F', '#070A16']),
  motion('Ice halo', 'halo', ['#BFE3FF', '#1D4E89', '#040A14']),
  motion('Candlelight', 'bokeh', ['#F2B66D', '#E89A5B', '#FFD9A0', '#0B0806'], 0.8),
  motion('City lights', 'bokeh', ['#8FB8FF', '#C79BFF', '#5EE1D9', '#070912'], 0.8),
  motion('Amethyst flow', 'mesh', ['#5B2E9E', '#A0337A', '#1F3C8F', '#2A145A', '#07050F']),
  motion('Lagoon flow', 'mesh', ['#0F7A8A', '#1F4FA8', '#14A38B', '#0A2A4A', '#030A12']),
  motion('Sunset flow', 'mesh', ['#D9652F', '#B3306F', '#4E2A92', '#E2A15A', '#0E0614']),
  motion('Golden dust', 'dust', ['#F6D78B', '#3A2A10', '#050505']),
  motion('Starlight', 'dust', ['#DDE6FF', '#1B2A55', '#03050C']),
  motion('Silk', 'waves', ['#7A5CFF', '#2BB3C0', '#E05C9B', '#0A0814'], 0.8),
  motion('Deep sea silk', 'waves', ['#1E6FD9', '#0FB5AE', '#123E7A', '#020814'], 0.8),
  motion('Aurora', 'aurora', ['#2A1B4F', '#0E3B5C', '#5A1F3D'], 0.6),
  motion('Ember', 'glow', ['#5C1F0E', '#8A3B12', '#1A0B08'], 0.5),
  motion('Ocean drift', 'drift', ['#06283D', '#1363DF', '#0B1D33'], 0.5),
  motion('Forest', 'aurora', ['#0F3D2E', '#1E5F3A', '#0A1F17'], 0.4),
  // Still
  still('Midnight', 160, ['#1B2140', 0], ['#0B0E1A', 100]),
  still('Champagne', 160, ['#4E402B', 0], ['#221B13', 55], ['#0B0907', 100]),
  still('Royal', 135, ['#2A1E5C', 0], ['#46297F', 50], ['#0D0A1F', 100]),
  still('Slate', 165, ['#2B3340', 0], ['#11151C', 100]),
  still('Ocean deep', 170, ['#0E3A5C', 0], ['#04121F', 100]),
  still('Sage', 160, ['#3E5A4A', 0], ['#14211B', 100]),
  still('Crimson', 150, ['#5A0F1F', 0], ['#1A050B', 100]),
  still('Advent', 135, ['#2D1B4E', 0], ['#4A2C6F', 50], ['#120A1F', 100]),
  still('Pentecost', 160, ['#E2572A', 0], ['#A51D3A', 50], ['#26050E', 100]),
  still('Easter dawn', 180, ['#F6C177', 0], ['#C76B98', 55], ['#2E2A5A', 100]),
  still('Dusk', 180, ['#F39A6B', 0], ['#A8508A', 45], ['#272057', 100]),
  still('Noir', 180, ['#1C1C1E', 0], ['#000000', 100]),
  still('Paper', 160, ['#F6F1E8', 0], ['#E3D9C8', 100]),
  { name: 'Black', ref: { kind: 'color', color: '#000000' } },
];

/** A built-in background by name (for the starter themes). */
export function builtInBackground(name: string): BackgroundRef {
  const b = BUILT_IN_BACKGROUNDS.find((x) => x.name === name);
  if (!b) throw new Error(`Unknown built-in background: ${name}`);
  return b.ref;
}
