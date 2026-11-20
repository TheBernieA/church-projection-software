import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { makeScene, type SlideObject, type Theme } from '@lampstand/core';
import { EMPHASIS_COLOR, objectBoxStyle } from '@lampstand/renderer';
import { useCanvasScale, useItemSlides } from '../../lib/hooks';
import { editObjects, patchObject, snap } from '../../lib/objects';
import { useStore } from '../../lib/store';
import { patchSlide } from '../../lib/textSlides';
import { mediaUrl } from '../../../shared/mediaUrl';
import { SceneView } from '../SceneView';
import { TextBox, type TextField } from './TextBox';
import { type TextItem } from '../../types';
import { CANVAS } from '../../constants';

/**
 * What is being typed on the slide: its own words (with its heading, when it has one), or one
 * text box object.
 */
export type TypingTarget = { kind: 'slide'; heading: boolean } | { kind: 'object'; id: string };

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
interface Drag {
  id: string;
  handle: Handle;
  startX: number;
  startY: number;
  orig: SlideObject;
  current: SlideObject;
}

const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'ne', 'sw', 'se'];
const MIN = 16;

/** Where a drag leaves the object: moved, or resized from one corner (snapped to the grid). */
function dragged(d: Drag, dx: number, dy: number, free: boolean): SlideObject {
  const o = d.orig;
  const s = (v: number, size = 0, axis: 'x' | 'y' = 'x'): number =>
    free ? Math.round(v) : snap(v, size, axis);
  if (d.handle === 'move') return { ...o, x: s(o.x + dx, o.w, 'x'), y: s(o.y + dy, o.h, 'y') };
  let { x, y } = o;
  let w: number;
  let h: number;
  if (d.handle.includes('w')) {
    const nx = s(o.x + dx);
    w = Math.max(MIN, o.x + o.w - nx);
    x = o.x + o.w - w;
  } else w = Math.max(MIN, s(o.x + o.w + dx) - o.x);
  if (d.handle.includes('n')) {
    const ny = s(o.y + dy, 0, 'y');
    h = Math.max(MIN, o.y + o.h - ny);
    y = o.y + o.h - h;
  } else h = Math.max(MIN, s(o.y + o.h + dy, 0, 'y') - o.y);
  return { ...o, x, y, w, h };
}

/** One object drawn with the renderer's own box style, so the editor matches the output. */
function ObjectView({ o, typing }: { o: SlideObject; typing: boolean }) {
  const style = objectBoxStyle(o) as CSSProperties;
  return (
    <div style={style} className={`ls-object ls-object-${o.kind}`}>
      {/* A text box being typed in shows its words in the field over it, not twice. */}
      {o.kind === 'text' && !typing && o.text}
      {o.kind === 'image' && o.mediaId && (
        <img
          src={mediaUrl(o.mediaId)}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: o.fit }}
        />
      )}
    </div>
  );
}

/** A text box object's words, typed right inside it, in its own font, size and colour. */
function ObjectWords({
  item,
  index,
  object,
  onDone,
}: {
  item: TextItem;
  index: number;
  object: Extract<SlideObject, { kind: 'text' }>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(object.text);
  const area = useRef<HTMLTextAreaElement>(null);
  // As tall as its words, centred in the box as the output centres them.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, object.h)}px`;
  }, [text, object.h, object.w, object.fontSize]);
  return (
    <div style={{ ...(objectBoxStyle(object) as CSSProperties), opacity: 1 }}>
      <textarea
        ref={area}
        aria-label={t('canvas.text')}
        value={text}
        autoFocus
        spellCheck
        onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setText(e.target.value);
          patchObject(item, index, object.id, { text: e.target.value }, { typing: true });
        }}
        onKeyDown={(e) => {
          e.stopPropagation(); // words, not nudges or show keys
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            onDone();
          }
        }}
        className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 !shadow-none !outline-none"
        style={{ font: 'inherit', color: 'inherit', textAlign: 'inherit', lineHeight: 'inherit' }}
      />
    </div>
  );
}

/**
 * Canvas editor for one text slide: the slide (background, heading, text) drawn by the real
 * renderer, with its objects on top to select, drag and resize. Double-click the words to type
 * them on the slide (or a text box to type in it). Hold Alt to move freely (no snapping);
 * Delete removes, arrow keys nudge (Shift = 10px), Escape deselects.
 */
export function SlideCanvas({
  item,
  index,
  typing,
  visit,
  onType,
  onBreak,
  onNewSlide,
}: {
  item: TextItem;
  index: number;
  typing: TypingTarget | null;
  /** Changes when typing starts on another slide or box (its fields start afresh). */
  visit: string;
  onType: (target: TypingTarget | null) => void;
  onBreak: (before: string, after: string) => void;
  onNewSlide: () => void;
}) {
  const { t } = useTranslation();
  const { slides } = useItemSlides(item);
  const selected = useStore((s) => s.editObjectId);
  const [host, scale] = useCanvasScale();
  const [drag, setDrag] = useState<Drag | null>(null);
  const slide = item.slides[index];
  const objects = slide?.objects ?? [];
  const shown = drag ? objects.map((o) => (o.id === drag.id ? drag.current : o)) : objects;
  const typingWords = typing?.kind === 'slide';
  const typingObject = typing?.kind === 'object' ? typing.id : null;

  // The slide split into the output's own layers: background, then the objects (drawn and
  // dragged here), then the slide text on top, so the editor stacks exactly like the room.
  const { background, text, theme } = useMemo(() => {
    const a = slides[index]?.action;
    if (a?.kind !== 'content')
      return { background: makeScene(), text: makeScene(), theme: null as Theme | null };
    const content = { ...a.content };
    delete content.objects;
    return {
      background: makeScene({ background: a.background }),
      text: makeScene({ content }),
      theme: content.theme,
    };
  }, [slides, index]);

  const select = (id: string | null): void => useStore.setState({ editObjectId: id });
  const start = (e: PointerEvent, o: SlideObject, handle: Handle): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    host.current?.focus();
    onType(null);
    select(o.id);
    setDrag({ id: o.id, handle, startX: e.clientX, startY: e.clientY, orig: o, current: o });
  };
  const move = (e: PointerEvent): void => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    setDrag({ ...drag, current: dragged(drag, dx, dy, e.altKey) });
  };
  const end = (): void => {
    if (!drag) return;
    const { x, y, w, h } = drag.current;
    const o = drag.orig;
    if (x !== o.x || y !== o.y || w !== o.w || h !== o.h)
      patchObject(item, index, drag.id, { x, y, w, h }); // one undo step per drag
    setDrag(null);
  };
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !selected) {
      e.preventDefault(); // Enter types the words here; it never shows the slide
      onType({ kind: 'slide', heading: !!slide?.title });
      return;
    }
    const o = objects.find((x) => x.id === selected);
    if (!o) return;
    if (e.key === 'Escape') return select(null);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      editObjects(item, index, (os) => os.filter((x) => x.id !== o.id));
      return select(null);
    }
    const step = e.shiftKey ? 10 : 1;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = nudge[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation(); // arrows here move the object, not the live slide
    patchObject(item, index, o.id, { x: o.x + d[0], y: o.y + d[1] }, { typing: true });
  };
  const typeWords = (): void => onType({ kind: 'slide', heading: !!slide?.title });
  const stopTyping = (): void => {
    onType(null);
    host.current?.focus();
  };
  const fields: TextField[] = slide
    ? [
        ...(typing?.kind === 'slide' && typing.heading
          ? [
              {
                key: 'title',
                label: t('inspector.title'),
                placeholder: t('inspector.titlePlaceholder'),
                value: slide.title ?? '',
                color: EMPHASIS_COLOR,
                onChange: (v: string) => patchSlide(item, index, { title: v }),
              },
            ]
          : []),
        {
          key: 'body',
          label: t('inspector.text'),
          placeholder: t('inspector.textPlaceholder'),
          value: slide.body,
          onChange: (v: string) => patchSlide(item, index, { body: v }),
        },
      ]
    : [];
  const typed = objects.find((o) => o.id === typingObject);

  return (
    <div
      ref={host}
      tabIndex={0}
      role="application"
      aria-label={t('canvas.label')}
      onKeyDown={onKey}
      onPointerDown={() => {
        select(null);
        if (typing) stopTyping();
      }}
      // Double-click the slide to type its words on it.
      onDoubleClick={typeWords}
      className="relative aspect-video w-full overflow-hidden rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
      data-testid="slide-canvas"
    >
      <SceneView scene={background} />
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})` }}
      >
        {shown.map((o) => (
          <ObjectView key={o.id} o={o} typing={o.id === typingObject} />
        ))}
      </div>
      {/* While its words are typed, they show in the text box only (not twice). */}
      {!typingWords && (
        <div className="pointer-events-none absolute inset-0">
          <SceneView scene={text} transparent />
        </div>
      )}
      {theme && scale > 0 && (
        <TextBox
          theme={theme}
          scale={(scale * CANVAS.width) / theme.canvas.width}
          editing={typingWords}
          visit={visit}
          fields={fields}
          onStart={typeWords}
          onDone={stopTyping}
          onBreak={onBreak}
          onNewSlide={onNewSlide}
        />
      )}
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})` }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {shown.map((o) => {
          const isSel = o.id === selected;
          const handle = 14 / scale;
          return (
            <div key={o.id}>
              {/* Hit area + selection frame over the object. */}
              <div
                role="button"
                aria-label={t('canvas.object', { kind: t(`canvas.kinds.${o.kind}`) })}
                aria-pressed={isSel}
                data-object={o.id}
                onPointerDown={(e) => start(e, o, 'move')}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (o.kind === 'text') onType({ kind: 'object', id: o.id });
                  else typeWords();
                }}
                className="pointer-events-auto absolute cursor-move"
                style={{
                  left: o.x,
                  top: o.y,
                  width: o.w,
                  height: o.h,
                  outline:
                    isSel || o.id === typingObject
                      ? `${2 / scale}px solid var(--accent)`
                      : undefined,
                }}
              >
                {isSel &&
                  HANDLES.map((h) => (
                    <span
                      key={h}
                      data-handle={h}
                      onPointerDown={(e) => start(e, o, h)}
                      className="absolute rounded-full border-2 border-[var(--accent)] bg-white"
                      style={{
                        width: handle,
                        height: handle,
                        left: h.includes('w') ? -handle / 2 : undefined,
                        right: h.includes('e') ? -handle / 2 : undefined,
                        top: h.includes('n') ? -handle / 2 : undefined,
                        bottom: h.includes('s') ? -handle / 2 : undefined,
                        cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                      }}
                    />
                  ))}
              </div>
            </div>
          );
        })}
        {typed?.kind === 'text' && (
          <div className="pointer-events-auto">
            <ObjectWords key={visit} item={item} index={index} object={typed} onDone={stopTyping} />
          </div>
        )}
      </div>
    </div>
  );
}
