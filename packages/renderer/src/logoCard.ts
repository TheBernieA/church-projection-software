import type { GeneratedPreset, LogoStyle } from '@lampstand/core';
import { el } from './dom';
import { buildGenerated } from './generated';
import { FILL } from './constants';

interface LogoLook {
  /** Moving background, or a still CSS background. */
  motion?: { preset: GeneratedPreset; colors: string[]; speed: number };
  still?: string;
  font: string;
  weight: number;
  size: number;
  tracking: string;
  upper?: boolean;
  color: string;
  /** CSS for the name's light: a glow, or gold lettering. */
  name?: Record<string, string>;
  tagline: { font: string; size: number; tracking: string; upper: boolean; italic?: boolean };
  /** Thin rules above and below the name. */
  rules?: boolean;
}

const SANS_TAG = { font: 'Plus Jakarta Sans', size: 34, tracking: '0.28em', upper: true };
const SERIF_TAG = {
  font: 'Cormorant Garamond',
  size: 46,
  tracking: '0.04em',
  upper: false,
  italic: true,
};

/** The name-card looks offered in Settings → Logo. */
export const LOGO_LOOKS: Record<LogoStyle, LogoLook> = {
  halo: {
    motion: { preset: 'halo', colors: ['#E9C77B', '#33417F', '#070A16'], speed: 1 },
    font: 'Plus Jakarta Sans',
    weight: 800,
    size: 108,
    tracking: '-0.01em',
    color: '#F6F2EA',
    name: { textShadow: '0 0 48px rgba(233,199,123,0.35), 0 2px 18px rgba(0,0,0,0.5)' },
    tagline: SANS_TAG,
  },
  rays: {
    motion: { preset: 'rays', colors: ['#F6DFAE', '#C79A55', '#0B0805'], speed: 1 },
    font: 'Cormorant Garamond',
    weight: 600,
    size: 136,
    tracking: '0.01em',
    color: '#FCF5E6',
    name: { textShadow: '0 0 60px rgba(246,223,174,0.35)' },
    tagline: SERIF_TAG,
  },
  aurora: {
    motion: {
      preset: 'mesh',
      colors: ['#4B2E9A', '#0F6B78', '#7A2A5E', '#1C2B6B', '#05060E'],
      speed: 1,
    },
    font: 'Outfit',
    weight: 700,
    size: 112,
    tracking: '0',
    color: '#FFFFFF',
    name: { textShadow: '0 4px 30px rgba(0,0,0,0.45)' },
    tagline: SANS_TAG,
  },
  bokeh: {
    motion: { preset: 'bokeh', colors: ['#F2B66D', '#E07A8B', '#8FB8FF', '#0A0A12'], speed: 1 },
    font: 'Manrope',
    weight: 800,
    size: 104,
    tracking: '-0.01em',
    color: '#FFFFFF',
    name: { textShadow: '0 4px 30px rgba(0,0,0,0.55)' },
    tagline: SANS_TAG,
  },
  gold: {
    motion: { preset: 'dust', colors: ['#F6D78B', '#3A2A10', '#050505'], speed: 1 },
    font: 'DM Serif Display',
    weight: 400,
    size: 132,
    tracking: '0.01em',
    color: '#E9C77B',
    name: {
      backgroundImage: 'linear-gradient(180deg, #FFF1C9 0%, #E9C77B 45%, #A97A2C 100%)',
      backgroundClip: 'text',
      webkitBackgroundClip: 'text',
      color: 'transparent',
      filter: 'drop-shadow(0 4px 24px rgba(233,199,123,0.25))',
    },
    tagline: SERIF_TAG,
  },
  minimal: {
    still: '#050608',
    font: 'Raleway',
    weight: 600,
    size: 76,
    tracking: '0.34em',
    upper: true,
    color: '#F2F3F5',
    tagline: { font: 'Raleway', size: 30, tracking: '0.3em', upper: true },
    rules: true,
  },
  classic: {
    still: 'radial-gradient(ellipse at 50% 40%, #1A1E2C 0%, #0B0D14 70%)',
    font: 'Inter',
    weight: 700,
    size: 96,
    tracking: '0.02em',
    color: '#ECEEF4',
    tagline: { font: 'Inter', size: 36, tracking: '0.12em', upper: true },
  },
};

const rule = (doc: Document): HTMLElement =>
  el(doc, 'div', 'ls-logo-rule', {
    width: '140px',
    height: '1px',
    background: 'rgba(255,255,255,0.4)',
    margin: '44px 0',
  });

/**
 * The name card (logo mask and off-air screen): the church's name, and an optional tagline,
 * over a moving background. Text goes in as text nodes, never HTML.
 */
export function buildLogoCard(
  doc: Document,
  node: HTMLElement,
  visual: { text: string; style?: LogoStyle; tagline?: string },
  animated: boolean,
): void {
  const look = LOGO_LOOKS[visual.style ?? 'classic'];
  node.style.background = look.still ?? '#000';
  if (look.motion)
    node.append(
      buildGenerated(doc, look.motion.preset, look.motion.colors, look.motion.speed, animated),
    );
  const content = el(doc, 'div', 'ls-logo-content', {
    ...FILL,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '0 140px',
  });
  const name = el(doc, 'div', 'ls-logo-name', {
    color: look.color,
    fontFamily: `"${look.font}", "Inter", sans-serif`,
    fontSize: `${look.size}px`,
    fontWeight: String(look.weight),
    letterSpacing: look.tracking,
    lineHeight: '1.08',
    textTransform: look.upper ? 'uppercase' : 'none',
    ...look.name,
  });
  name.textContent = visual.text;
  if (look.rules) content.append(rule(doc));
  content.append(name);
  if (look.rules) content.append(rule(doc));
  if (visual.tagline) {
    const tag = el(doc, 'div', 'ls-logo-tagline', {
      marginTop: look.rules ? '0' : '36px',
      color: 'rgba(255,255,255,0.74)',
      fontFamily: `"${look.tagline.font}", "Inter", sans-serif`,
      fontSize: `${look.tagline.size}px`,
      fontWeight: '500',
      fontStyle: look.tagline.italic ? 'italic' : 'normal',
      letterSpacing: look.tagline.tracking,
      textTransform: look.tagline.upper ? 'uppercase' : 'none',
    });
    tag.textContent = visual.tagline;
    content.append(tag);
  }
  node.append(content);
}
