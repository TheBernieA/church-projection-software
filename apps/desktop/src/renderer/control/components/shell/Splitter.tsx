import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cmd } from '../../lib/api';
import { attempt, useStore } from '../../lib/store';

/**
 * A pane size the operator can drag, remembered in `settings.layout[key]`. Dragging only
 * changes local state; the size is saved once, on release.
 */
export function usePaneSize(key: string, fallback: number, min: number, max: number) {
  const saved = useStore((s) => s.settings?.layout[key]);
  const [dragging, setDragging] = useState<number | null>(null);
  const size = Math.min(max, Math.max(min, dragging ?? saved ?? fallback));
  const commit = (v: number): void => {
    setDragging(null);
    const layout = useStore.getState().settings?.layout ?? {};
    const value = Math.round(Math.min(max, Math.max(min, v)));
    if (layout[key] === value) return;
    void attempt(
      () => cmd('settings.update', { patch: { layout: { ...layout, [key]: value } } }),
      'errors.setting',
    );
  };
  return { size, preview: setDragging, commit };
}

/**
 * Drag handle between two panes. `axis` is the direction the size grows in; `invert` for panes
 * that grow when dragged left/up (right column, bin).
 */
export function Splitter({
  axis,
  size,
  invert = false,
  label,
  onPreview,
  onCommit,
}: {
  axis: 'x' | 'y';
  size: number;
  invert?: boolean;
  label: string;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const start = useRef<{ pos: number; size: number } | null>(null);
  const valueAt = (e: ReactPointerEvent): number => {
    const s = start.current;
    if (!s) return size;
    const delta = (axis === 'x' ? e.clientX : e.clientY) - s.pos;
    return s.size + (invert ? -delta : delta);
  };
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: axis === 'x' ? e.clientX : e.clientY, size };
      }}
      onPointerMove={(e) => start.current && onPreview(valueAt(e))}
      onPointerUp={(e) => {
        if (!start.current) return;
        onCommit(valueAt(e));
        start.current = null;
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 12;
        const grow = axis === 'x' ? ['ArrowRight', 'ArrowLeft'] : ['ArrowDown', 'ArrowUp'];
        const dir = e.key === grow[0] ? 1 : e.key === grow[1] ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        onCommit(size + (invert ? -dir : dir) * step);
      }}
      className={`group relative shrink-0 focus-visible:outline-none ${
        axis === 'x' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
      }`}
    >
      <span
        aria-hidden
        className={`absolute rounded-full bg-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-100 group-active:opacity-100 ${
          axis === 'x' ? 'inset-y-2 left-[2px] w-[2px]' : 'inset-x-2 top-[2px] h-[2px]'
        }`}
      />
    </div>
  );
}
