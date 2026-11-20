import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
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
export interface TextBoxActions {
  /** Typing stopped (Esc, ⌘↩, a click away): the fields as they are. */
  onDone: (values: Record<string, string>) => void;
  /** ⌥↩ in the last field: what's before the caret stays, the rest goes on a new slide. */
  onBreak?: (before: string, after: string) => void;
  /** ⇧⌘N: a new slide after this one (with the fields as they are). */
  onNewSlide?: (values: Record<string, string>) => void;
}

const HANDLES: CSSProperties[] = [
  { left: 0, top: 0 },
  { left: '50%', top: 0 },
  { left: '100%', top: 0 },
  { left: 0, top: '50%' },
  { left: '100%', top: '50%' },
  { left: 0, top: '100%' },
  { left: '50%', top: '100%' },
  { left: '100%', top: '100%' },
];

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

/**
 * A slide's text box, over the slide at the output's own scale: framed with handles like a
 * selected object while typing (and on hover); double-click it to type. `visit` changes when the
 * editor moves to another slide, so the fields start afresh there.
 */
export function TextBox({
  theme,
  scale,
  editing,
  visit,
  fields,
  onStart,
  ...actions
}: {
  theme: Theme;
  scale: number;
  editing: boolean;
  visit: number | string;
  fields: TextField[];
  onStart: () => void;
} & TextBoxActions) {
  const { t } = useTranslation();
  const box = boxOf(theme);
  const line = 2 / scale;
  const handle = 9 / scale;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 flex origin-top-left flex-col"
      style={{
        width: theme.canvas.width,
        height: theme.canvas.height,
        transform: `scale(${scale})`,
        padding: `${box.pad.top}px ${box.pad.right}px ${box.pad.bottom}px ${box.pad.left}px`,
        justifyContent: box.justify,
      }}
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
        style={{ left: box.pad.left, top: box.pad.top, width: box.width, height: box.height }}
      >
        <span
          aria-hidden
          className={`absolute inset-0 transition-opacity ${editing ? 'opacity-100' : 'opacity-0 group-hover/box:opacity-60'}`}
          style={{ outline: `${line}px solid var(--accent)` }}
        />
        {editing &&
          HANDLES.map((h, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute rounded-full border-[var(--accent)] bg-white"
              style={{
                ...h,
                width: handle,
                height: handle,
                borderWidth: line,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
      </div>
      {editing && (
        <div className="pointer-events-auto relative flex flex-col">
          <Fields key={visit} theme={theme} fields={fields} actions={actions} />
        </div>
      )}
    </div>
  );
}
