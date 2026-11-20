import type {
  BackgroundAdjust,
  BackgroundLayer,
  BackgroundRef,
  Scrim,
  TextStyle,
  Theme,
} from '@lampstand/core';

/** Apply a TextStyle to an element. Values come from Zod-validated themes. */
/** A font family with the app's fallbacks behind it. */
export function cssFontStack(family: string): string {
  return `"${family.replace(/"/g, '')}", "Inter", system-ui, sans-serif`;
}

export function applyTextStyle(el: HTMLElement, s: TextStyle, fontSize = s.fontSize): void {
  const st = el.style;
  st.fontFamily = cssFontStack(s.fontFamily);
  st.fontWeight = String(s.fontWeight);
  st.fontSize = `${fontSize}px`;
  st.lineHeight = String(s.lineHeight);
  st.letterSpacing = `${s.letterSpacing}px`;
  st.color = s.color;
  st.textAlign = s.align;
  st.fontStyle = s.italic ? 'italic' : 'normal';
  st.textTransform = s.textTransform ?? 'none';
  st.textDecoration =
    [s.underline ? 'underline' : '', s.strike ? 'line-through' : ''].filter(Boolean).join(' ') ||
    'none';
  const shadows = [
    s.shadow ? `${s.shadow.x}px ${s.shadow.y}px ${s.shadow.blur}px ${s.shadow.color}` : '',
    // Glow: two stacked blurs read as a soft halo rather than a smudge.
    s.glow && s.glow.blur > 0
      ? `0 0 ${s.glow.blur}px ${s.glow.color}, 0 0 ${s.glow.blur / 2}px ${s.glow.color}`
      : '',
  ].filter(Boolean);
  st.textShadow = shadows.length ? shadows.join(', ') : 'none';
  if (s.outline && s.outline.width > 0) {
    st.setProperty('-webkit-text-stroke', `${s.outline.width}px ${s.outline.color}`);
    st.setProperty('paint-order', 'stroke fill');
  } else st.removeProperty('-webkit-text-stroke');
  if (s.backgroundBox) {
    st.backgroundColor = s.backgroundBox.color;
    st.padding = `${s.backgroundBox.padding}px ${s.backgroundBox.padding * 1.4}px`;
    st.borderRadius = `${s.backgroundBox.radius}px`;
  } else {
    st.backgroundColor = '';
    st.padding = '0';
    st.borderRadius = '0';
  }
}

export function gradientCss(ref: Extract<BackgroundRef, { kind: 'gradient' }>): string {
  const stops = ref.stops.map((s) => `${s.color} ${s.pos}%`).join(', ');
  return `linear-gradient(${ref.angle}deg, ${stops})`;
}

/** Stable identity of a background — same key means "keep playing, don't restart" (§12). */
export function backgroundKey(bg: BackgroundLayer | null): string {
  if (!bg || bg.ref.kind === 'none') return 'none';
  // A video's sound and the readability overlay change in place: neither restarts the video.
  const ref = bg.ref.kind === 'video' ? { ...bg.ref, sound: undefined } : bg.ref;
  const adjust = bg.adjust ? { ...bg.adjust, scrim: undefined } : undefined;
  const changesPicture = adjust && Object.values(adjust).some((v) => v !== undefined);
  return JSON.stringify(changesPicture ? [ref, adjust] : ref);
}

/** CSS filter for a background's adjustments (blur, brightness, contrast, saturation). */
export function backgroundFilter(a: BackgroundAdjust | undefined): string {
  if (!a) return '';
  const parts = [
    a.blur ? `blur(${a.blur}px)` : '',
    a.brightness !== undefined && a.brightness !== 1 ? `brightness(${a.brightness})` : '',
    a.contrast !== undefined && a.contrast !== 1 ? `contrast(${a.contrast})` : '',
    a.saturate !== undefined && a.saturate !== 1 ? `saturate(${a.saturate})` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

export function safeAreaPx(theme: Theme): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const { width, height } = theme.canvas;
  return {
    top: (theme.safeArea.top / 100) * height,
    bottom: (theme.safeArea.bottom / 100) * height,
    left: (theme.safeArea.left / 100) * width,
    right: (theme.safeArea.right / 100) * width,
  };
}

/** The readability overlay's CSS: black, evenly, at the edges, or as a band at the bottom or top. */
export function scrimCss(s: Scrim): string {
  const a = (k: number): string => `rgba(0,0,0,${+(s.strength * k).toFixed(3)})`;
  switch (s.style) {
    case 'even':
      return a(1);
    case 'edges':
      return `radial-gradient(ellipse at 50% 50%, ${a(0.35)} 0%, ${a(0.6)} 55%, ${a(1)} 100%)`;
    case 'bottom':
      return `linear-gradient(to top, ${a(1)} 0%, ${a(0.85)} 25%, ${a(0)} 60%)`;
    case 'top':
      return `linear-gradient(to bottom, ${a(1)} 0%, ${a(0.85)} 25%, ${a(0)} 60%)`;
  }
}
