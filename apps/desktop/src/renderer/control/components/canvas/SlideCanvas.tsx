import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { makeScene, type SlideObject } from '@lampstand/core';
import { objectBoxStyle } from '@lampstand/renderer';
import { useItemSlides } from '../../lib/hooks';
import { CANVAS, editObjects, patchObject, snap, type TextItem } from '../../lib/objects';
import { useStore } from '../../lib/store';
import { mediaUrl } from '../../../shared/mediaUrl';
import { SceneView } from '../SceneView';

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
function ObjectView({ o }: { o: SlideObject }) {
  const style = objectBoxStyle(o) as CSSProperties;
  return (
    <div style={style} className={`ls-object ls-object-${o.kind}`}>
      {o.kind === 'text' && o.text}
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

/**
 * Canvas editor for one text slide: the slide (background, title, body) drawn by the real
 * renderer, with its objects on top to select, drag and resize. Hold Alt to move freely
 * (no snapping). Delete removes, arrow keys nudge (Shift = 10px), Escape deselects.
 */
export function SlideCanvas({ item, index }: { item: TextItem; index: number }) {
  const { t } = useTranslation();
  const { slides } = useItemSlides(item);
  const selected = useStore((s) => s.editObjectId);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [drag, setDrag] = useState<Drag | null>(null);
  const objects = item.slides[index]?.objects ?? [];
  const shown = drag ? objects.map((o) => (o.id === drag.id ? drag.current : o)) : objects;

  // The slide split into the output's own layers: background, then the objects (drawn and
  // dragged here), then the slide text on top, so the editor stacks exactly like the room.
  const { background, text } = useMemo(() => {
    const a = slides[index]?.action;
    if (a?.kind !== 'content') return { background: makeScene(), text: makeScene() };
    const content = { ...a.content };
    delete content.objects;
    return { background: makeScene({ background: a.background }), text: makeScene({ content }) };
  }, [slides, index]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CANVAS.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const select = (id: string | null): void => useStore.setState({ editObjectId: id });
  const start = (e: PointerEvent, o: SlideObject, handle: Handle): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    host.current?.focus();
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

  return (
    <div
      ref={host}
      tabIndex={0}
      role="application"
      aria-label={t('canvas.label')}
      onKeyDown={onKey}
      onPointerDown={() => select(null)}
      className="relative aspect-video w-full overflow-hidden rounded-[4px] shadow-[0_0_0_1px_var(--hairline-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      data-testid="slide-canvas"
    >
      <SceneView scene={background} />
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})` }}
      >
        {shown.map((o) => (
          <ObjectView key={o.id} o={o} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0">
        <SceneView scene={text} transparent />
      </div>
      <div
        className="absolute left-0 top-0 origin-top-left"
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
                className="absolute cursor-move"
                style={{
                  left: o.x,
                  top: o.y,
                  width: o.w,
                  height: o.h,
                  outline: isSel ? `${2 / scale}px solid var(--accent)` : undefined,
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
      </div>
    </div>
  );
}
