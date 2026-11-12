// All fonts are bundled locally (OFL) and loaded before first render (§7.2, §13).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/500.css';
import '@fontsource/lora/500-italic.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';

export const OUTPUT_FONTS = [
  'Inter',
  'Montserrat',
  'Lora',
  'Source Serif 4',
  'Playfair Display',
  'Bebas Neue',
  'Atkinson Hyperlegible',
];

/** Resolve once fonts used on outputs are ready, so text never flashes or re-fits. */
export async function fontsReady(): Promise<void> {
  const loads: Promise<unknown>[] = [];
  for (const f of OUTPUT_FONTS)
    for (const w of ['400', '600', '700'])
      loads.push(document.fonts.load(`${w} 32px "${f}"`).catch(() => undefined));
  await Promise.all(loads);
  await document.fonts.ready;
}
