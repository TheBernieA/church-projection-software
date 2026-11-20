import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { type Theme } from '@lampstand/core';
import { applyTextStyle, fitFontSize, safeAreaPx } from '@lampstand/renderer';
import { type SongEditorState } from './useSongEditor';

export const isNewSlideKey = (e: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}) =>
  e.shiftKey &&
  e.key.toLowerCase() === 'n' &&
  (window.lampstand.platform === 'darwin' ? e.metaKey : e.ctrlKey);

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
 * The words being typed, in the theme's own font, size, colour and alignment, where the output
 * puts them, and sized the way the output fits them (shrinking as lines are added). So typing
 * here looks like typing on the slide itself.
 */
function WordsArea({ ed, onDone }: { ed: SongEditorState; onDone: (text: string) => void }) {
  const { t } = useTranslation();
  const theme = ed.theme;
  const [text, setText] = useState(() => {
    const words = ed.current?.lines.join('\n') ?? '';
    ed.draft(words);
    return words;
  });
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const box = boxOf(theme);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Size the words as the output will: the theme's size, or the largest that fits the box.
  useLayoutEffect(() => {
    const el = area.current;
    const m = mirror.current;
    if (!el || !m) return;
    // A trailing line break still takes a line (the caret sits on it).
    m.textContent = `${text || t('songEditor.wordsPlaceholder')}\u200b`;
    const fits = (size: number): boolean => {
      applyTextStyle(m, theme.text, size);
      return m.scrollHeight <= box.height + 1;
    };
    const size = theme.autoFit.enabled
      ? fitFontSize(theme.autoFit.minSize, theme.autoFit.maxSize, fits)
      : theme.text.fontSize;
    applyTextStyle(m, theme.text, size);
    applyTextStyle(el, theme.text, size);
    el.style.height = `${Math.min(m.scrollHeight, box.height)}px`;
  }, [text, theme, box.height, t]);

  return (
    <>
      <div
        ref={mirror}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre-wrap break-words"
        style={{ width: box.width }}
      />
      <textarea
        ref={area}
        aria-label={t('songEditor.words')}
        placeholder={t('songEditor.wordsPlaceholder')}
        value={text}
        spellCheck
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          setText(e.target.value);
          ed.draft(e.target.value);
          ed.type(e.target.value);
        }}
        onKeyDown={(e) => {
          // Keys typed here are words: none of them reach the show (Escape would clear it).
          e.stopPropagation();
          const el = e.currentTarget;
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            onDone(text);
          } else if (e.key === 'Enter' && e.altKey) {
            e.preventDefault();
            ed.breakSlide(text.slice(0, el.selectionStart), text.slice(el.selectionEnd));
          } else if (isNewSlideKey(e)) {
            e.preventDefault();
            ed.breakSlide(text, '');
          }
        }}
        className="block w-full resize-none overflow-hidden border-0 bg-transparent !shadow-none !outline-none placeholder:opacity-40"
        style={{ caretColor: theme.text.color }}
      />
    </>
  );
}

/**
 * The slide's text box, over the slide at the output's own scale: framed with handles like a
 * selected object, double-click (or Enter on the slide) to type in it.
 */
export function SongTextBox({
  ed,
  scale,
  onDone,
}: {
  ed: SongEditorState;
  scale: number;
  onDone: (text: string) => void;
}) {
  const { t } = useTranslation();
  const theme = ed.theme;
  const box = boxOf(theme);
  const editing = ed.typing;
  const line = 2 / scale;
  const handle = 9 / scale;
  return (
    <div
      className="absolute left-0 top-0 flex origin-top-left flex-col"
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
        aria-label={t('songEditor.textBox')}
        aria-pressed={editing}
        data-testid="song-text-box"
        onDoubleClick={(e) => {
          e.stopPropagation();
          ed.startTyping();
        }}
        className={`group/box absolute ${editing ? '' : 'cursor-text'}`}
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
      {editing && <WordsArea key={ed.visit} ed={ed} onDone={onDone} />}
    </div>
  );
}
