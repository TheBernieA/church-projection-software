import type { TextStyle, Theme } from './schemas/theme';
import { builtInBackground as bg } from './backgrounds';

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
    background: bg('Aurora'),
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
  // Premium looks: modern type, motion backgrounds with lyric-safe contrast.
  theme('theme-cinematic', {
    name: 'Cinematic',
    appliesTo: ['lyrics', 'text'],
    text: text({
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: 700,
      fontSize: 80,
      lineHeight: 1.2,
      letterSpacing: -0.5,
      glow: { blur: 34, color: 'rgba(246,223,174,0.22)' },
    }),
    background: bg("Heaven's light"),
    backgroundAdjust: { dim: 0.15 },
    transition: { kind: 'dissolve', durationMs: 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  }),
  theme('theme-elegant-scripture', {
    name: 'Elegant scripture',
    appliesTo: ['scripture'],
    text: text({
      fontFamily: 'Cormorant Garamond',
      fontWeight: 600,
      fontSize: 76,
      lineHeight: 1.3,
      color: '#FBF6EC',
    }),
    reference: text({
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: 5,
      textTransform: 'uppercase',
      color: '#E9C77B',
    }),
    background: bg('Champagne'),
    safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
    autoFit: { enabled: true, minSize: 36, maxSize: 84 },
  }),
  theme('theme-gold-on-black', {
    name: 'Gold on black',
    appliesTo: ['scripture', 'text'],
    text: text({
      fontFamily: 'DM Serif Display',
      fontWeight: 400,
      fontSize: 76,
      lineHeight: 1.3,
      color: '#F3DDA4',
    }),
    reference: text({
      fontFamily: 'Cormorant Garamond',
      fontSize: 42,
      fontWeight: 600,
      italic: true,
      color: 'rgba(243,221,164,0.8)',
    }),
    background: bg('Golden dust'),
    safeArea: { top: 11, right: 11, bottom: 11, left: 11 },
    autoFit: { enabled: true, minSize: 36, maxSize: 84 },
  }),
  theme('theme-modern-bold', {
    name: 'Modern bold',
    appliesTo: ['lyrics'],
    text: text({
      fontFamily: 'Anton',
      fontWeight: 400,
      fontSize: 96,
      lineHeight: 1.1,
      letterSpacing: 1,
      textTransform: 'uppercase',
    }),
    background: bg('Amethyst flow'),
    backgroundAdjust: { dim: 0.2 },
    autoFit: { enabled: true, minSize: 44, maxSize: 124 },
  }),
  theme('theme-soft-glow', {
    name: 'Soft glow',
    appliesTo: ['lyrics', 'text'],
    text: text({
      fontFamily: 'Manrope',
      fontWeight: 700,
      fontSize: 76,
      glow: { blur: 28, color: 'rgba(242,182,109,0.28)' },
    }),
    background: bg('Candlelight'),
    backgroundAdjust: { dim: 0.25 },
  }),
  theme('theme-silk', {
    name: 'Silk',
    appliesTo: ['lyrics', 'text'],
    text: text({ fontFamily: 'Outfit', fontWeight: 600, fontSize: 80, lineHeight: 1.2 }),
    background: bg('Silk'),
    backgroundAdjust: { dim: 0.2 },
  }),
  theme('theme-starlight', {
    name: 'Starlight',
    appliesTo: ['lyrics', 'scripture', 'text'],
    text: text({ fontFamily: 'Poppins', fontWeight: 600, fontSize: 74, lineHeight: 1.25 }),
    reference: text({ fontFamily: 'Poppins', fontSize: 34, fontWeight: 500, color: '#BFD0FF' }),
    background: bg('Starlight'),
  }),
  theme('theme-glass-lower-third', {
    name: 'Glass lower third',
    appliesTo: ['lower-third', 'lyrics', 'scripture'],
    layout: 'lower-third',
    text: text({
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 50,
      fontWeight: 600,
      backgroundBox: { color: 'rgba(12,14,22,0.62)', padding: 32, radius: 18 },
      shadow: undefined,
    }),
    reference: text({
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: '#E9C77B',
      shadow: undefined,
    }),
    background: { kind: 'none' },
    autoFit: { enabled: true, minSize: 28, maxSize: 56 },
    safeArea: { top: 5, right: 6, bottom: 6, left: 6 },
  }),
  theme('theme-clean-light', {
    name: 'Clean light',
    appliesTo: ['scripture', 'text'],
    text: text({
      fontFamily: 'Manrope',
      fontWeight: 700,
      fontSize: 70,
      color: '#1C1A17',
      shadow: undefined,
    }),
    reference: text({
      fontFamily: 'Manrope',
      fontSize: 32,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: '#8A6A2E',
      shadow: undefined,
    }),
    background: bg('Paper'),
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
