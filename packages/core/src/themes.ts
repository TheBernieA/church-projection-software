import type { TextStyle, Theme } from './schemas/theme';

const T0 = '2026-01-01T00:00:00.000Z';

const shadow = { x: 0, y: 4, blur: 18, color: 'rgba(0,0,0,0.55)' };

function text(over: Partial<TextStyle>): TextStyle {
  return {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 72,
    lineHeight: 1.25,
    letterSpacing: 0,
    color: '#FFFFFF',
    align: 'center',
    shadow,
    ...over,
  };
}

function theme(id: string, over: Partial<Theme> & Pick<Theme, 'name' | 'appliesTo'>): Theme {
  return {
    id,
    schemaVersion: 1,
    createdAt: T0,
    updatedAt: T0,
    canvas: { width: 1920, height: 1080 },
    safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
    text: text({}),
    reference: text({ fontSize: 40, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }),
    referencePosition: 'bottom',
    background: {
      kind: 'gradient',
      angle: 160,
      stops: [
        { color: '#1B2140', pos: 0 },
        { color: '#0B0E1A', pos: 100 },
      ],
    },
    layout: 'center',
    autoFit: { enabled: true, minSize: 36, maxSize: 96 },
    transition: { kind: 'fade', durationMs: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    showVerseNumbers: true,
    redLetters: false,
    builtIn: true,
    ...over,
  };
}

/** Starter themes (§13). Built-in themes are read-only; users duplicate them to edit. */
export const STARTER_THEMES: Theme[] = [
  theme('theme-classic-center', { name: 'Classic center', appliesTo: ['lyrics', 'text'] }),
  theme('theme-minimal-serif', {
    name: 'Minimal serif scripture',
    appliesTo: ['scripture'],
    text: text({
      fontFamily: 'Lora',
      fontWeight: 500,
      fontSize: 64,
      lineHeight: 1.4,
      align: 'left',
    }),
    reference: text({
      fontFamily: 'Inter',
      fontSize: 36,
      fontWeight: 600,
      align: 'left',
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: '#E8B04B',
    }),
    safeArea: { top: 10, right: 10, bottom: 10, left: 10 },
    autoFit: { enabled: true, minSize: 34, maxSize: 76 },
  }),
  theme('theme-bold-worship', {
    name: 'Bold worship',
    appliesTo: ['lyrics'],
    text: text({
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 84,
      textTransform: 'uppercase',
      letterSpacing: 1,
      lineHeight: 1.15,
    }),
    background: {
      kind: 'generated',
      preset: 'aurora',
      colors: ['#2A1B4F', '#0E3B5C', '#5A1F3D'],
      speed: 0.6,
    },
    autoFit: { enabled: true, minSize: 40, maxSize: 110 },
  }),
  theme('theme-modern-lower-third', {
    name: 'Modern lower third',
    appliesTo: ['lyrics', 'scripture', 'lower-third'],
    layout: 'lower-third',
    text: text({
      fontSize: 54,
      fontWeight: 600,
      backgroundBox: { color: 'rgba(10,12,20,0.72)', padding: 28, radius: 10 },
    }),
    reference: text({ fontSize: 30, fontWeight: 600, color: '#E8B04B' }),
    background: { kind: 'none' },
    autoFit: { enabled: true, minSize: 30, maxSize: 60 },
    safeArea: { top: 5, right: 6, bottom: 6, left: 6 },
  }),
  theme('theme-stream-lower-third', {
    name: 'Stream lower third',
    appliesTo: ['lower-third', 'scripture', 'lyrics'],
    layout: 'lower-third',
    text: text({
      fontSize: 46,
      fontWeight: 600,
      align: 'left',
      backgroundBox: { color: 'rgba(23,26,36,0.88)', padding: 24, radius: 6 },
      shadow: undefined,
    }),
    reference: text({
      fontSize: 28,
      fontWeight: 700,
      align: 'left',
      color: '#E8B04B',
      shadow: undefined,
    }),
    referencePosition: 'top',
    background: { kind: 'none' },
    autoFit: { enabled: true, minSize: 26, maxSize: 52 },
    safeArea: { top: 5, right: 5, bottom: 7, left: 5 },
  }),
  theme('theme-kids', {
    name: 'Kids',
    appliesTo: ['lyrics', 'text'],
    text: text({
      fontFamily: 'Bebas Neue',
      fontWeight: 400,
      fontSize: 110,
      letterSpacing: 2,
      color: '#FFF7D6',
    }),
    background: {
      kind: 'gradient',
      angle: 135,
      stops: [
        { color: '#FF8A3D', pos: 0 },
        { color: '#C2337A', pos: 55 },
        { color: '#4B2C91', pos: 100 },
      ],
    },
    autoFit: { enabled: true, minSize: 50, maxSize: 140 },
  }),
  theme('theme-high-contrast', {
    name: 'High contrast',
    appliesTo: ['scripture', 'lyrics', 'text'],
    text: text({
      fontFamily: 'Atkinson Hyperlegible',
      fontWeight: 700,
      fontSize: 80,
      color: '#FFFF00',
      shadow: undefined,
      lineHeight: 1.3,
    }),
    reference: text({
      fontFamily: 'Atkinson Hyperlegible',
      fontSize: 44,
      fontWeight: 700,
      color: '#FFFFFF',
      shadow: undefined,
    }),
    background: { kind: 'color', color: '#000000' },
    transition: { kind: 'cut', durationMs: 0, easing: 'linear' },
  }),
];

export const DEFAULT_THEME_IDS = {
  scripture: 'theme-minimal-serif',
  lyrics: 'theme-classic-center',
  text: 'theme-classic-center',
} as const;

export function findTheme(themes: Theme[], id: string | undefined, fallbackId: string): Theme {
  const t =
    themes.find((x) => x.id === id) ?? themes.find((x) => x.id === fallbackId) ?? STARTER_THEMES[0];
  if (!t) throw new Error('No themes available');
  return t;
}
