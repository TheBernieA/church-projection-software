import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { saveSettings } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { clamp } from '../../lib/utils';

/**
 * A pane size the operator can drag, remembered in `settings.layout[key]`. Dragging only
 * changes local state; the size is saved once, on release.
 */
export function usePaneSize(key: string, fallback: number, min: number, max: number) {
  const saved = useStore((s) => s.settings?.layout[key]);
  const [dragging, setDragging] = useState<number | null>(null);
  const size = clamp(dragging ?? saved ?? fallback, min, max);
  const commit = (v: number): void => {
    setDragging(null);
    const layout = useStore.getState().settings?.layout ?? {};
    const value = Math.round(clamp(v, min, max));
    if (layout[key] === value) return;
    void saveSettings({ layout: { ...layout, [key]: value } });
  };
  return { size, preview: setDragging, commit };
}

/**
 * Drag handle between two panes. `axis` is the direction the size grows in; `invert` for panes
 * that grow when dragged left/up (right column, bin).
 */
export type PaneSize = ReturnType<typeof usePaneSize>;

export function Splitter({
  axis,
  pane,
  invert = false,
  label,
}: {
  axis: 'x' | 'y';
  pane: PaneSize;
  invert?: boolean;
  label: string;
}) {
  const { size, preview: onPreview, commit: onCommit } = pane;
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
      // A 1px divider with a wider invisible grab area (the ::before) on both sides.
      className={`group relative z-10 shrink-0 bg-[var(--divider)] focus-visible:outline-none before:absolute before:content-[''] ${
        axis === 'x'
          ? 'w-px cursor-col-resize before:inset-y-0 before:-left-1 before:w-[9px]'
          : 'h-px cursor-row-resize before:inset-x-0 before:-top-1 before:h-[9px]'
      }`}
    >
      <span
        aria-hidden
        className={`absolute bg-[var(--select)] opacity-0 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-100 group-active:opacity-100 ${
          axis === 'x' ? 'inset-y-0 -left-px w-[3px]' : 'inset-x-0 -top-px h-[3px]'
        }`}
      />
    </div>
  );
}
