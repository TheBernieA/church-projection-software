/** A full-screen picture: the logo card (text), or a library image or video. */
export type ScreenVisual =
  { kind: 'logo'; text: string } | { kind: 'image' | 'video'; mediaId: string };

/** What an output shows when nothing is live (the off-air screen). */
export type Standby = { kind: 'black' } | ScreenVisual;
