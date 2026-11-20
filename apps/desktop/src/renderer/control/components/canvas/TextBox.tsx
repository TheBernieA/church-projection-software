import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type Theme } from '@lampstand/core';
import { applyTextStyle, fitFontSize, safeAreaPx } from '@lampstand/renderer';
import { isMac } from '../../lib/shortcuts';

/** ⇧⌘N (⇧Ctrl+N): a new slide after this one. */
export const isNewSlideKey = (e: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean => e.shiftKey && e.key.toLowerCase() === 'n' && (isMac() ? e.metaKey : e.ctrlKey);

/** One run of words in the text box (a slide's heading, its text). */
export interface TextField {
  key: string;
  label: string;
  placeholder: string;
  value: string;
  /** Its own colour (a heading), else the theme's. */
  color?: string;
  onChange: (value: string) => void;
}

/** What typing in the box can ask for besides words. */
interface TextBoxActions {
  /** Typing stopped (Esc, ⌘↩, a click away): the fields as they are. */
  onDone: (values: Record<string, string>) => void;
  /** ⌥↩ in the last field: what's before the caret stays, the rest goes on a new slide. */
  onBreak?: (before: string, after: string) => void;
  /** ⇧⌘N: a new slide after this one (with the fields as they are). */
  onNewSlide?: (values: Record<string, string>) => void;
}

/** The text box's grips: corners and edge midpoints (each moves the sides it touches). */
type Grip = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
const GRIPS: { grip: Grip; at: CSSProperties; cursor: string }[] = [
  { grip: 'nw', at: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { grip: 'n', at: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { grip: 'ne', at: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { grip: 'w', at: { left: 0, top: '50%' }, cursor: 'ew-resize' },
  { grip: 'e', at: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { grip: 'sw', at: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { grip: 's', at: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { grip: 'se', at: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
];

const EDGES = ['top', 'right', 'bottom', 'left'] as const;

/** A strip along one edge of the box, `size` thick, centred on the frame's line. */
function edgeStyle(edge: (typeof EDGES)[number], size: number): CSSProperties {
  const across = { left: 0, right: 0, height: size };
  const down = { top: 0, bottom: 0, width: size };
  switch (edge) {
    case 'top':
      return { ...across, top: -size / 2 };
    case 'bottom':
      return { ...across, bottom: -size / 2 };
    case 'left':
      return { ...down, left: -size / 2 };
    case 'right':
      return { ...down, right: -size / 2 };
  }
}

/** The text box's margins from the slide's edges, in canvas pixels. */
type Pad = { top: number; right: number; bottom: number; left: number };

/** The theme's safe area allows up to this much of the slide on each side. */
const MAX_SIDE = 0.45;

/**
 * Where a drag leaves the text box: a grip moves the sides it touches, the frame moves the whole
 * box. It never leaves the slide, nor gets smaller than a tenth of it.
 */
function dragPad(
  from: Pad,
  grip: Grip | 'move',
  dx: number,
  dy: number,
  w: number,
  h: number,
): Pad {
  const side = (v: number, size: number): number => Math.max(0, Math.min(v, size * MAX_SIDE));
  if (grip === 'move') {
    const x = Math.max(-from.left, Math.min(dx, from.right));
    const y = Math.max(-from.top, Math.min(dy, from.bottom));
    return {
      left: side(from.left + x, w),
      right: side(from.right - x, w),
      top: side(from.top + y, h),
      bottom: side(from.bottom - y, h),
    };
  }
  return {
    left: grip.includes('w') ? side(from.left + dx, w) : from.left,
    right: grip.includes('e') ? side(from.right - dx, w) : from.right,
    top: grip.includes('n') ? side(from.top + dy, h) : from.top,
    bottom: grip.includes('s') ? side(from.bottom - dy, h) : from.bottom,
  };
}

/** The renderer's gap between a slide's blocks (heading, text). */
const BLOCK_GAP = '0.6em';

/** Where the theme puts the words: its safe area, the words placed in it as the output does. */
function boxOf(theme: Theme) {
  const pad = safeAreaPx(theme);
  return {
    pad,
    width: theme.canvas.width - pad.left - pad.right,
    height: theme.canvas.height - pad.top - pad.bottom,
    justify:
      theme.layout === 'lower-third'
        ? 'flex-end'
        : theme.layout === 'top'
          ? 'flex-start'
          : 'center',
  };
}

/**
 * The words being typed, in the theme's font, size, colour and alignment, where the output puts
 * them, sized the way the output fits them (shrinking as lines are added): typing here looks like
 * typing on the slide itself.
 */
function Fields({
  theme,
  fields,
  actions,
}: {
  theme: Theme;
  fields: TextField[];
  actions: TextBoxActions;
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  const areas = useRef<(HTMLTextAreaElement | null)[]>([]);
  const mirror = useRef<HTMLDivElement>(null);
  const box = boxOf(theme);

  useEffect(() => {
    // The caret starts at the end of the last field (the slide's words).
    const el = areas.current[fields.length - 1];
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [fields.length]);

  // Size the words as the output will: the theme's size, or the largest that fits the box.
  useLayoutEffect(() => {
    const m = mirror.current;
    if (!m) return;
    const blocks = [...m.children] as HTMLElement[];
    fields.forEach((f, i) => {
      const block = blocks[i];
      // A trailing line break still takes a line (the caret sits on it).
      if (block) block.textContent = `${values[f.key] || f.placeholder}\u200b`;
    });
    const fits = (size: number): boolean => {
      applyTextStyle(m, theme.text, size);
      return m.scrollHeight <= box.height + 1;
    };
    const size = theme.autoFit.enabled
      ? fitFontSize(theme.autoFit.minSize, theme.autoFit.maxSize, fits)
      : theme.text.fontSize;
    applyTextStyle(m, theme.text, size);
    fields.forEach((f, i) => {
      const el = areas.current[i];
      if (!el) return;
      applyTextStyle(el, theme.text, size);
      if (f.color) el.style.color = f.color;
      el.style.height = `${blocks[i]?.offsetHeight ?? 0}px`;
    });
  }, [values, fields, theme, box.height]);

  return (
    <>
      <div
        ref={mirror}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0"
        style={{ width: box.width }}
      >
        {fields.map((f, i) => (
          <div
            key={f.key}
            className="whitespace-pre-wrap break-words"
            style={i ? { marginTop: BLOCK_GAP } : undefined}
          />
        ))}
      </div>
      {fields.map((f, i) => (
        <textarea
          key={f.key}
          ref={(el) => {
            areas.current[i] = el;
          }}
          aria-label={f.label}
          placeholder={f.placeholder}
          value={values[f.key]}
          spellCheck
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setValues((v) => ({ ...v, [f.key]: e.target.value }));
            f.onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            // Keys typed here are words: none of them reach the show (Escape would clear it).
            e.stopPropagation();
            const el = e.currentTarget;
            const text = values[f.key] ?? '';
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              actions.onDone(values);
            } else if (
              e.key === 'Enter' &&
              e.altKey &&
              i === fields.length - 1 &&
              actions.onBreak
            ) {
              e.preventDefault();
              actions.onBreak(text.slice(0, el.selectionStart), text.slice(el.selectionEnd));
            } else if (isNewSlideKey(e) && actions.onNewSlide) {
              e.preventDefault();
              actions.onNewSlide(values);
            }
          }}
          className="block w-full shrink-0 resize-none overflow-hidden border-0 bg-transparent !shadow-none !outline-none placeholder:opacity-40"
          style={{
            caretColor: f.color ?? theme.text.color,
            marginTop: i ? BLOCK_GAP : undefined,
          }}
        />
      ))}
    </>
  );
}

/** An empty slide's prompt, in the theme's own look (faded), where its words will go. */
function Placeholder({ theme, text }: { theme: Theme; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const size = theme.autoFit.enabled
      ? Math.min(theme.text.fontSize, theme.autoFit.maxSize)
      : theme.text.fontSize;
    applyTextStyle(ref.current, theme.text, size);
  }, [theme]);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none opacity-40">
      {text}
    </div>
  );
}

/**
 * A slide's text box, over the slide at the output's own scale, framed with grips (on hover, and
 * while typing). Double-click it to type; drag a grip to resize it or the frame to move it
 * (`onResize` keeps where it ends up, as percent of the slide). `visit` changes when the editor
 * moves to another slide, so the fields start afresh there.
 */
export function TextBox({
  theme,
  scale,
  editing,
  visit,
  fields,
  onStart,
  onResize,
  ...actions
}: {
  theme: Theme;
  scale: number;
  editing: boolean;
  visit: number | string;
  fields: TextField[];
  onStart: () => void;
  onResize?: (box: Pad) => void;
} & TextBoxActions) {
  const { t } = useTranslation();
  const box = boxOf(theme);
  const [drag, setDrag] = useState<{
    grip: Grip | 'move';
    x: number;
    y: number;
    from: Pad;
    pad: Pad;
  } | null>(null);
  const pad = drag?.pad ?? box.pad;
  const { width: W, height: H } = theme.canvas;
  const line = 2 / scale;
  const handle = 10 / scale;

  const start = (e: PointerEvent, grip: Grip | 'move'): void => {
    if (!onResize || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ grip, x: e.clientX, y: e.clientY, from: box.pad, pad: box.pad });
  };
  const move = (e: PointerEvent): void => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    setDrag({ ...drag, pad: dragPad(drag.from, drag.grip, dx, dy, W, H) });
  };
  const end = (): void => {
    if (!drag) return;
    const p = drag.pad;
    const pct = (v: number, size: number): number => Math.round((v / size) * 1000) / 10;
    const same = (Object.keys(p) as (keyof Pad)[]).every((k) => p[k] === drag.from[k]);
    if (!same && onResize)
      onResize({
        top: pct(p.top, H),
        right: pct(p.right, W),
        bottom: pct(p.bottom, H),
        left: pct(p.left, W),
      });
    setDrag(null);
  };

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 flex origin-top-left flex-col"
      style={{
        width: W,
        height: H,
        transform: `scale(${scale})`,
        padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
        justifyContent: box.justify,
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        role="button"
        tabIndex={-1}
        aria-label={t('canvas.textBox')}
        aria-pressed={editing}
        data-testid="text-box"
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStart();
        }}
        className={`group/box pointer-events-auto absolute ${editing ? '' : 'cursor-text'}`}
        style={{
          left: pad.left,
          top: pad.top,
          width: W - pad.left - pad.right,
          height: H - pad.top - pad.bottom,
        }}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 transition-opacity ${editing || drag ? 'opacity-100' : 'opacity-0 group-hover/box:opacity-70'}`}
          style={{ outline: `${line}px solid var(--accent)` }}
        />
        {/* Its edges: drag one to move the box (inside, clicks reach the words). */}
        {onResize &&
          EDGES.map((edge) => (
            <span
              key={edge}
              aria-hidden
              onPointerDown={(e) => start(e, 'move')}
              className="absolute cursor-move"
              style={edgeStyle(edge, handle)}
            />
          ))}
        {GRIPS.map(({ grip, at, cursor }) => (
          <span
            key={grip}
            aria-hidden
            data-grip={grip}
            onPointerDown={(e) => start(e, grip)}
            className={`absolute rounded-full border-[var(--accent)] bg-white transition-opacity ${editing || drag ? 'opacity-100' : 'opacity-0 group-hover/box:opacity-100'}`}
            style={{
              ...at,
              width: handle,
              height: handle,
              borderWidth: line,
              transform: 'translate(-50%, -50%)',
              cursor: onResize ? cursor : undefined,
            }}
          />
        ))}
      </div>
      {!editing && fields.every((f) => !f.value.trim()) && fields.length > 0 && (
        <Placeholder theme={theme} text={fields[fields.length - 1]?.placeholder ?? ''} />
      )}
      {editing && (
        <div className="pointer-events-auto relative flex flex-col">
          <Fields key={visit} theme={theme} fields={fields} actions={actions} />
        </div>
      )}
    </div>
  );
}
