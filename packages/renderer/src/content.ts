import {
  formatClock,
  type ContentLayer,
  type Span,
  type TextBlock,
  type Theme,
} from '@lampstand/core';
import { buildObjectsLayer } from './objects';
import { el } from './dom';
import { FitCache, fitFontSize } from './fit';
import { applyTextStyle, safeAreaPx } from './style';
import { type BuiltContent } from './types';
import { RED_LETTER } from './constants';

const fitCache = new FitCache();

/** A slide's heading (text slides) and other emphasised words: warm gold over the theme's colour. */
export const EMPHASIS_COLOR = '#E8B04B';

function appendSpans(doc: Document, parent: HTMLElement, spans: Span[], theme: Theme): void {
  for (const span of spans) {
    if (span.style === 'verse-number') {
      if (!theme.showVerseNumbers) continue;
      const sup = el(doc, 'sup', 'ls-vnum', {
        fontSize: '0.55em',
        opacity: '0.7',
        marginRight: '0.2em',
        verticalAlign: '0.6em',
        lineHeight: '0',
      });
      sup.textContent = span.text;
      parent.append(sup);
      continue;
    }
    if (!span.style) {
      parent.append(doc.createTextNode(span.text));
      continue;
    }
    const s = el(doc, 'span', `ls-${span.style}`);
    s.textContent = span.text;
    if (span.style === 'wj' && theme.redLetters) s.style.color = RED_LETTER;
    if (span.style === 'add') s.style.fontStyle = 'italic';
    if (span.style === 'nd') s.style.fontVariant = 'small-caps';
    if (span.style === 'emphasis') s.style.color = EMPHASIS_COLOR;
    parent.append(s);
  }
}

/** Linked text: what the words say now (the time, the date), in the computer's own format. */
export function linkedText(source: 'time' | 'date', now: number): string {
  const d = new Date(now);
  return source === 'time'
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

/** A block's lines as a list: one item per line, with a bullet or a number. */
function appendList(doc: Document, parent: HTMLElement, spans: Span[], kind: 'bullet' | 'number') {
  const list = el(doc, kind === 'number' ? 'ol' : 'ul', 'ls-list', {
    margin: '0',
    padding: '0',
    listStylePosition: 'inside',
    listStyleType: kind === 'number' ? 'decimal' : 'disc',
  });
  const lines = spans
    .map((s) => s.text)
    .join('')
    .split('\n')
    .filter((l) => l.trim());
  for (const line of lines) {
    const item = el(doc, 'li');
    item.textContent = line.trim();
    list.append(item);
  }
  parent.append(list);
}

/** "Lines only": a bar behind each line of the element's words (not one box behind them all). */
function barLines(doc: Document, parent: HTMLElement, bar: { color: string; padding: number }) {
  const span = el(doc, 'span', 'ls-line-bar', {
    background: bar.color,
    padding: `${bar.padding / 2}px ${bar.padding}px`,
    boxDecorationBreak: 'clone',
  });
  span.style.setProperty('-webkit-box-decoration-break', 'clone');
  span.append(...parent.childNodes);
  parent.append(span);
}

export function formatCountdown(targetIso: string, now: number): string {
  // Round up so "00:00" only shows once the target has actually passed.
  return formatClock(Math.ceil(Math.max(0, Date.parse(targetIso) - now) / 1000));
}

/** Build the DOM for one content slide using its theme. */
export function buildContent(
  doc: Document,
  content: ContentLayer,
  opts: { live: boolean; mediaUrl?: (id: string) => string } = { live: true },
): BuiltContent {
  const theme = content.theme;
  const pad = safeAreaPx(theme);
  const root = el(doc, 'div', 'ls-content', {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${theme.canvas.width}px`,
    height: `${theme.canvas.height}px`,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
    justifyContent:
      theme.layout === 'lower-third'
        ? 'flex-end'
        : theme.layout === 'top'
          ? 'flex-start'
          : 'center',
    alignItems:
      theme.text.align === 'left'
        ? 'flex-start'
        : theme.text.align === 'right'
          ? 'flex-end'
          : 'center',
    gap: '24px',
    willChange: 'opacity, transform',
  });

  const textEl = el(doc, 'div', 'ls-text', {
    maxWidth: '100%',
    overflow: 'hidden',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
  });
  applyTextStyle(textEl, theme.text);
  let timer: ReturnType<typeof setInterval> | null = null;

  if (content.kind === 'countdown' && content.countdownTo) {
    const target = content.countdownTo;
    const line = el(doc, 'div', 'ls-countdown', { fontVariantNumeric: 'tabular-nums' });
    line.textContent = formatCountdown(target, Date.now());
    // Thumbnails show a static value. Live views tick, but only touch the DOM when the digits change.
    if (opts.live) {
      timer = setInterval(() => {
        const next = formatCountdown(target, Date.now());
        if (line.textContent !== next) line.textContent = next;
      }, 250);
    }
    for (const b of content.blocks) {
      const d = el(doc, 'div', 'ls-block', { fontSize: '0.45em', opacity: '0.85' });
      appendSpans(doc, d, b.spans, theme);
      textEl.append(d);
    }
    textEl.append(line);
  } else {
    const style = theme.text;
    // Linked text: one block saying what the source says now (kept current while live).
    const blocks = style.linked
      ? [{ spans: [{ text: linkedText(style.linked, Date.now()) }] }]
      : content.blocks;
    if (style.linked && opts.live) {
      const source = style.linked;
      timer = setInterval(() => {
        const block = textEl.querySelector('.ls-block');
        const next = linkedText(source, Date.now());
        if (block && block.textContent !== next) block.textContent = next;
      }, 1000);
    }
    blocks.forEach((b: TextBlock, i) => {
      const block = el(doc, 'div', 'ls-block', { whiteSpace: 'pre-line' });
      if (b.dir) block.dir = b.dir;
      if (b.lang) block.lang = b.lang;
      if (i > 0) block.style.marginTop = '0.6em';
      if (b.role === 'secondary') {
        // A translation sits under the main lyric: smaller, italic, a little softer.
        block.classList.add('ls-block-secondary');
        Object.assign(block.style, { fontSize: '0.72em', fontStyle: 'italic', opacity: '0.85' });
        if (i > 0) block.style.marginTop = '0.35em';
      }
      if (b.label) {
        const lab = el(doc, 'div', 'ls-block-label', {
          fontSize: '0.45em',
          opacity: '0.7',
          letterSpacing: '0.08em',
          marginBottom: '0.2em',
        });
        lab.textContent = b.label;
        block.append(lab);
      }
      // Line returns become spaces when the lines are joined into one paragraph.
      const spans = style.joinLines
        ? b.spans.map((s) => ({ ...s, text: s.text.replace(/\s*\n\s*/g, ' ') }))
        : b.spans;
      // A heading (a text slide's title) stays a heading: the list is the words under it.
      const heading = spans.every((sp) => sp.style === 'emphasis');
      if (style.list && !heading) appendList(doc, block, spans, style.list);
      else appendSpans(doc, block, spans, theme);
      if (style.lineBackground) {
        const bar = style.lineBackground;
        const lines = style.list ? [...block.querySelectorAll('li')] : [block];
        lines.forEach((line) => barLines(doc, line, bar));
      }
      if (style.scroll) block.style.whiteSpace = 'nowrap';
      textEl.append(block);
    });
  }
  // A ticker scrolls from the right edge of the text box to off its left.
  const scroll = content.kind === 'countdown' ? undefined : theme.text.scroll;
  if (scroll) {
    Object.assign(textEl.style, { maxWidth: 'none', whiteSpace: 'nowrap' });
    root.style.alignItems = 'flex-start';
    root.style.overflow = 'hidden';
  }
  let ticker: Animation | null = null;

  let refEl: HTMLElement | null = null;
  const refText = [content.reference, content.copyright].filter(Boolean).join('  ·  ');
  if (refText && theme.referencePosition !== 'none') {
    refEl = el(doc, 'div', 'ls-reference', { flexShrink: '0', maxWidth: '100%' });
    applyTextStyle(refEl, theme.reference);
    refEl.textContent = refText;
  }
  // Text (and reference) sit above any freely placed objects.
  textEl.style.position = 'relative';
  textEl.style.zIndex = '1';
  if (refEl) Object.assign(refEl.style, { position: 'relative', zIndex: '1' });
  if (content.objects?.length)
    root.append(
      buildObjectsLayer(doc, content.objects, theme.canvas, opts.mediaUrl ?? ((id) => id)),
    );
  if (refEl && theme.referencePosition === 'top') root.append(refEl, textEl);
  else if (refEl) root.append(textEl, refEl);
  else root.append(textEl);

  const availW = theme.canvas.width - pad.left - pad.right;
  const startTicker = (): void => {
    if (!scroll || !opts.live || ticker) return;
    const width = textEl.scrollWidth;
    ticker = textEl.animate(
      [{ transform: `translateX(${availW}px)` }, { transform: `translateX(${-width}px)` }],
      { duration: ((availW + width) / scroll.speed) * 1000, iterations: Infinity },
    );
  };
  const fit = (): void => {
    if (theme.autoFit.enabled) {
      const refH = refEl ? refEl.offsetHeight + 24 : 0;
      const availH = theme.canvas.height - pad.top - pad.bottom - refH;
      if (availH > 0 && availW > 0) {
        // Everything that changes how big the words come out is in the key (the item's own
        // formatting too, not just which theme it is).
        const key = JSON.stringify([
          theme.id,
          theme.updatedAt,
          theme.text,
          theme.autoFit,
          availW,
          availH,
          content.blocks,
        ]);
        const cached = fitCache.get(key);
        const size =
          cached ??
          fitFontSize(theme.autoFit.minSize, theme.autoFit.maxSize, (s) => {
            textEl.style.fontSize = `${s}px`;
            // A ticker is one long line: only its height has to fit.
            return (
              textEl.scrollHeight <= availH + 1 && (!!scroll || textEl.scrollWidth <= availW + 1)
            );
          });
        textEl.style.fontSize = `${size}px`;
        if (cached === undefined && textEl.scrollHeight > 0) fitCache.set(key, size);
      }
    }
    startTicker();
  };

  return {
    root,
    fit,
    dispose: () => {
      if (timer) clearInterval(timer);
      ticker?.cancel();
    },
  };
}
