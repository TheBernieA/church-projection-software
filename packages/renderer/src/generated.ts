import type { GeneratedPreset } from '@lampstand/core';
import { el, loop } from './dom';
import { FILL } from './constants';

/** Deterministic 0..1 noise, so a preset looks the same on every screen and every run. */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A colour at reduced strength, for soft light (Chromium has color-mix). */
const fade = (c: string, pct: number): string => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

const pick = (colors: string[], i: number): string => colors[i % colors.length] ?? '#000';

/** Soft dark edges: the premium "lens" look, and it keeps lyrics readable at the edges. */
function vignette(doc: Document, strength = 0.55): HTMLElement {
  return el(doc, 'div', 'ls-gen-vignette', {
    ...FILL,
    background: `radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,${strength}) 100%)`,
    pointerEvents: 'none',
  });
}

function abs(style: Record<string, string>): Record<string, string> {
  return { position: 'absolute', ...style };
}

interface Ctx {
  doc: Document;
  root: HTMLElement;
  colors: string[];
  animated: boolean;
  dur: (ms: number) => number;
}

type Painter = (c: Ctx) => void;

/** Drifting, scaling colour clouds (the original Aurora / Glow looks). */
function blobs(kind: 'aurora' | 'glow'): Painter {
  return ({ doc, root, colors, animated, dur }) => {
    colors.forEach((c, i) => {
      const size = kind === 'glow' ? 120 : 90;
      const blob = el(doc, 'div', '', {
        position: 'absolute',
        width: `${size}%`,
        height: `${size * 1.6}%`,
        left: `${((i * 37) % 60) - 20}%`,
        top: `${((i * 53) % 50) - 40}%`,
        background: `radial-gradient(closest-side, ${c}, transparent)`,
        opacity: '0.9',
      });
      root.append(blob);
      if (!animated) return;
      const dx = 18 - i * 9;
      const dy = -12 + i * 10;
      loop(
        blob,
        kind === 'glow'
          ? [
              { opacity: 0.55, transform: 'scale(1)' },
              { opacity: 1, transform: 'scale(1.15)' },
            ]
          : [
              { transform: 'translate(0,0) scale(1)' },
              { transform: `translate(${dx}%, ${dy}%) scale(1.2)` },
            ],
        { duration: dur(18000 + i * 7000), direction: 'alternate', easing: 'ease-in-out' },
      );
    });
  };
}

const PAINTERS: Record<GeneratedPreset, Painter> = {
  aurora: blobs('aurora'),
  glow: blobs('glow'),

  /** One big gradient sheet sliding and turning slowly. */
  drift: ({ doc, root, colors, animated, dur }) => {
    const layer = el(doc, 'div', '', {
      position: 'absolute',
      left: '-50%',
      top: '-50%',
      width: '200%',
      height: '200%',
      background: `linear-gradient(120deg, ${colors.join(', ')}, ${colors[0] ?? '#000'})`,
    });
    root.append(layer);
    if (animated)
      loop(
        layer,
        [
          { transform: 'translate(0,0) rotate(0deg)' },
          { transform: 'translate(10%, 8%) rotate(8deg)' },
        ],
        { duration: dur(40000), direction: 'alternate', easing: 'ease-in-out' },
      );
  },

  /** Light pouring down from above: soft beams that sway and breathe. */
  rays: ({ doc, root, colors, animated, dur }) => {
    const light = pick(colors, 0);
    const glow = el(
      doc,
      'div',
      '',
      abs({
        left: '-20%',
        top: '-60%',
        width: '140%',
        height: '120%',
        background: `radial-gradient(closest-side, ${fade(light, 70)}, transparent)`,
      }),
    );
    root.append(glow);
    for (let layerIx = 0; layerIx < 2; layerIx++) {
      const beams = el(
        doc,
        'div',
        '',
        abs({
          left: '-50%',
          top: '-110%',
          width: '200%',
          height: '220%',
          background: `repeating-conic-gradient(from ${layerIx * 7}deg at 50% 50%, transparent 0deg, ${fade(
            pick(colors, layerIx),
            layerIx ? 22 : 30,
          )} ${3 + layerIx}deg, transparent ${8 + layerIx * 3}deg, transparent ${15 + layerIx * 4}deg)`,
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 0%, transparent 60%)',
          opacity: '0.9',
        }),
      );
      root.append(beams);
      if (animated)
        loop(
          beams,
          [
            { transform: `rotate(${layerIx ? 4 : -4}deg)`, opacity: 0.6 },
            { transform: `rotate(${layerIx ? -4 : 4}deg)`, opacity: 1 },
          ],
          {
            duration: dur(26000 + layerIx * 9000),
            direction: 'alternate',
            easing: 'ease-in-out',
          },
        );
    }
    if (animated)
      loop(glow, [{ opacity: 0.7 }, { opacity: 1 }], {
        duration: dur(9000),
        direction: 'alternate',
        easing: 'ease-in-out',
      });
    root.append(vignette(doc));
  },

  /** Out-of-focus lights floating gently, like a camera at a candlelit service. */
  bokeh: ({ doc, root, colors, animated, dur }) => {
    const lights = colors.slice(0, -1).length ? colors.slice(0, -1) : colors;
    for (let i = 0; i < 16; i++) {
      const size = 6 + rand(i, 1) * 16; // % of width
      const c = pick(lights, i);
      const dot = el(
        doc,
        'div',
        '',
        abs({
          width: `${size}%`,
          aspectRatio: '1',
          left: `${rand(i, 2) * 100 - size / 2}%`,
          top: `${rand(i, 3) * 100 - size / 2}%`,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${fade(c, 55)} 0%, ${fade(c, 35)} 55%, ${fade(c, 12)} 68%, transparent 72%)`,
          opacity: String(0.35 + rand(i, 4) * 0.5),
        }),
      );
      root.append(dot);
      if (animated) {
        const dx = (rand(i, 5) - 0.5) * 60;
        const dy = (rand(i, 6) - 0.5) * 60;
        loop(
          dot,
          [
            { transform: 'translate(0,0) scale(1)', opacity: 0.25 + rand(i, 4) * 0.3 },
            {
              transform: `translate(${dx}%, ${dy}%) scale(1.15)`,
              opacity: 0.55 + rand(i, 7) * 0.4,
            },
          ],
          {
            duration: dur(14000 + rand(i, 8) * 16000),
            direction: 'alternate',
            easing: 'ease-in-out',
            delay: -rand(i, 9) * 10000,
          },
        );
      }
    }
    root.append(vignette(doc, 0.5));
  },

  /** A fluid mesh gradient: large colour fields turning slowly around each other. */
  mesh: ({ doc, root, colors, animated, dur }) => {
    const spin = el(
      doc,
      'div',
      '',
      abs({ left: '-40%', top: '-40%', width: '180%', height: '180%' }),
    );
    const spots = [
      [20, 25],
      [75, 20],
      [70, 75],
      [25, 80],
    ];
    spots.forEach(([x, y], i) => {
      const b = el(
        doc,
        'div',
        '',
        abs({
          width: '75%',
          height: '75%',
          left: `${(x ?? 50) - 37}%`,
          top: `${(y ?? 50) - 37}%`,
          background: `radial-gradient(closest-side, ${pick(colors, i)}, transparent)`,
        }),
      );
      spin.append(b);
      if (animated)
        loop(
          b,
          [
            { transform: 'scale(0.9)' },
            { transform: `scale(1.25) translate(${i % 2 ? 6 : -6}%, 4%)` },
          ],
          {
            duration: dur(16000 + i * 5000),
            direction: 'alternate',
            easing: 'ease-in-out',
          },
        );
    });
    root.append(spin);
    if (animated)
      loop(spin, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: dur(140000),
        easing: 'linear',
      });
    root.append(vignette(doc, 0.35));
  },

  /** Fine specks of light rising slowly through a soft glow. */
  dust: ({ doc, root, colors, animated, dur }) => {
    root.append(
      el(doc, 'div', '', {
        ...FILL,
        background: `radial-gradient(ellipse at 50% 110%, ${fade(pick(colors, 1), 80)}, transparent 70%)`,
      }),
    );
    const speck = pick(colors, 0);
    for (let i = 0; i < 46; i++) {
      const px = 2 + rand(i, 1) * 5;
      const p = el(
        doc,
        'div',
        '',
        abs({
          width: `${px}px`,
          height: `${px}px`,
          left: `${rand(i, 2) * 100}%`,
          top: `${rand(i, 3) * 100}%`,
          borderRadius: '50%',
          background: speck,
          boxShadow: `0 0 ${px * 3}px ${speck}`,
          opacity: String(0.2 + rand(i, 4) * 0.6),
        }),
      );
      root.append(p);
      if (animated)
        loop(
          p,
          [
            { transform: 'translate(0, 0)', opacity: 0 },
            { opacity: 0.3 + rand(i, 4) * 0.6, offset: 0.2 },
            { opacity: 0.3 + rand(i, 4) * 0.6, offset: 0.8 },
            {
              transform: `translate(${(rand(i, 5) - 0.5) * 120}px, -${260 + rand(i, 6) * 300}px)`,
              opacity: 0,
            },
          ],
          {
            duration: dur(16000 + rand(i, 7) * 18000),
            easing: 'linear',
            delay: -rand(i, 8) * 30000,
          },
        );
    }
    root.append(vignette(doc));
  },

  /** Layers of silk sliding past each other. */
  waves: ({ doc, root, colors, animated, dur }) => {
    for (let i = 0; i < 3; i++) {
      const band = el(
        doc,
        'div',
        '',
        abs({
          left: '-50%',
          width: '200%',
          height: '70%',
          top: `${10 + i * 22}%`,
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${fade(pick(colors, i), 75)}, transparent 70%)`,
          transform: `rotate(${-8 + i * 7}deg)`,
          opacity: '0.85',
        }),
      );
      root.append(band);
      if (animated)
        loop(
          band,
          [
            { transform: `rotate(${-8 + i * 7}deg) translateX(-12%) scaleY(1)` },
            { transform: `rotate(${-4 + i * 5}deg) translateX(12%) scaleY(1.3)` },
          ],
          {
            duration: dur(20000 + i * 8000),
            direction: 'alternate',
            easing: 'ease-in-out',
          },
        );
    }
    root.append(vignette(doc, 0.45));
  },

  /** A ring of light that breathes, with a slow shimmer turning around it. */
  halo: ({ doc, root, colors, animated, dur }) => {
    const c = pick(colors, 0);
    const c2 = pick(colors, 1);
    const center = el(
      doc,
      'div',
      '',
      abs({
        left: '15%',
        top: '-10%',
        width: '70%',
        height: '120%',
        background: `radial-gradient(closest-side, ${fade(c2, 60)}, transparent)`,
      }),
    );
    const ring = el(
      doc,
      'div',
      '',
      abs({
        // Sized on the 16:9 frame: 36% of the width is 64% of the height.
        left: '32%',
        top: '18%',
        width: '36%',
        aspectRatio: '1',
        borderRadius: '50%',
        background: `radial-gradient(circle, transparent 58%, ${fade(c, 55)} 66%, ${fade(c, 18)} 70%, transparent 74%)`,
      }),
    );
    const shimmer = el(
      doc,
      'div',
      '',
      abs({
        left: '27%',
        top: '9.1%',
        width: '46%',
        aspectRatio: '1',
        borderRadius: '50%',
        background: `conic-gradient(from 0deg, transparent, ${fade(c, 35)}, transparent 30%, transparent 50%, ${fade(c2, 30)}, transparent 80%)`,
        maskImage: 'radial-gradient(circle, transparent 50%, black 62%, transparent 72%)',
      }),
    );
    root.append(center, shimmer, ring);
    if (animated) {
      loop(
        ring,
        [
          { transform: 'scale(0.96)', opacity: 0.7 },
          { transform: 'scale(1.04)', opacity: 1 },
        ],
        { duration: dur(7000), direction: 'alternate', easing: 'ease-in-out' },
      );
      loop(shimmer, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: dur(30000),
        easing: 'linear',
      });
      loop(center, [{ opacity: 0.6 }, { opacity: 1 }], {
        duration: dur(11000),
        direction: 'alternate',
        easing: 'ease-in-out',
      });
    }
    root.append(vignette(doc));
  },
};

/**
 * How much faster than the painters' base timings everything runs. The base cycles (18 s to
 * over two minutes) were so slow that on a projector the backgrounds looked like stills.
 */
const PACE = 3;

/**
 * Lightweight in-engine animated backgrounds (§12): transform and opacity only, so they are
 * GPU composited and cheap on church hardware. The last colour is the base; the others light it.
 */
export function buildGenerated(
  doc: Document,
  preset: GeneratedPreset,
  colors: string[],
  speed: number,
  animated: boolean,
): HTMLElement {
  const root = el(doc, 'div', `ls-gen ls-gen-${preset}`, {
    ...FILL,
    background: colors[colors.length - 1] ?? '#000',
    overflow: 'hidden',
  });
  const dur = (ms: number): number => ms / (speed * PACE);
  PAINTERS[preset]({ doc, root, colors, animated, dur });
  return root;
}
