import type { PropPosition, TransitionSpec } from '@lampstand/core';
import type { StyleInit } from './types';

export const FILL: StyleInit = {
  position: 'absolute',
  left: '0',
  top: '0',
  width: '100%',
  height: '100%',
};

export const RED_LETTER = '#E8574F';

export const STANDBY_FADE_MS = 600;

export const DEFAULT_TRANSITION: TransitionSpec = { kind: 'fade', durationMs: 400, easing: 'ease' };

export const BG_FADE_MS = 800;

export const PROP_BOX: Record<PropPosition, StyleInit> = {
  full: { ...FILL },
  'top-left': { left: '56px', top: '48px', width: '22%', height: '22%' },
  'top-right': { right: '56px', top: '48px', width: '22%', height: '22%' },
  'bottom-left': { left: '56px', bottom: '48px', width: '22%', height: '22%' },
  'bottom-right': { right: '56px', bottom: '48px', width: '22%', height: '22%' },
  'lower-third': { left: '20%', right: '20%', bottom: '56px', height: '24%' },
};
