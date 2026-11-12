import type { BackgroundLayer, BackgroundRef, TextStyle, Theme } from '@lampstand/core';

/** Apply a TextStyle to an element. Values come from Zod-validated themes. */
export function applyTextStyle(el: HTMLElement, s: TextStyle, fontSize = s.fontSize): void {
  const st = el.style;
  st.fontFamily = `"${s.fontFamily.replace(/"/g, '')}", "Inter", system-ui, sans-serif`;
  st.fontWeight = String(s.fontWeight);
  st.fontSize = `${fontSize}px`;
  st.lineHeight = String(s.lineHeight);
  st.letterSpacing = `${s.letterSpacing}px`;
  st.color = s.color;
  st.textAlign = s.align;
  st.fontStyle = s.italic ? 'italic' : 'normal';
  st.textTransform = s.textTransform ?? 'none';
  st.textShadow = s.shadow
    ? `${s.shadow.x}px ${s.shadow.y}px ${s.shadow.blur}px ${s.shadow.color}`
    : 'none';
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
  return JSON.stringify(bg.ref);
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
