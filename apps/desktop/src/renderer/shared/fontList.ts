/** A font bundled with the app (OFL), with the weights shipped for it. */
export interface BundledFont {
  family: string;
  category: 'sans' | 'serif' | 'display';
  weights: number[];
}

/**
 * Every font the outputs can draw. Lyrics read best in bold, clean sans-serifs; serifs suit
 * scripture; display faces are for short titles. Kept free of CSS imports so the theme editor
 * and tests can read the list without loading font files.
 */
export const BUNDLED_FONTS: BundledFont[] = [
  { family: 'Inter', category: 'sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Plus Jakarta Sans', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Manrope', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Outfit', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Poppins', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Montserrat', category: 'sans', weights: [600, 800] },
  { family: 'Raleway', category: 'sans', weights: [400, 600, 800] },
  { family: 'Atkinson Hyperlegible', category: 'sans', weights: [400, 700] },
  { family: 'Lora', category: 'serif', weights: [400, 500] },
  { family: 'Source Serif 4', category: 'serif', weights: [400, 600] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [500, 600, 700] },
  { family: 'Playfair Display', category: 'serif', weights: [600] },
  { family: 'DM Serif Display', category: 'display', weights: [400] },
  { family: 'Oswald', category: 'display', weights: [500, 600, 700] },
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Anton', category: 'display', weights: [400] },
];
