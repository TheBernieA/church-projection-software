import type { LogoStyle } from '../schemas/settings';

/** A full-screen picture: the logo card (name, look, tagline), or a library image or video. */
export type ScreenVisual =
  | { kind: 'logo'; text: string; style?: LogoStyle; tagline?: string }
  | { kind: 'image' | 'video'; mediaId: string };

/** What an output shows when nothing is live (the off-air screen). */
export type Standby = { kind: 'black' } | ScreenVisual;
