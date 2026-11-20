import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Typography } from '@lampstand/ui';
import { useStore } from '../../lib/store';
import { usePaneSize } from '../shell/Splitter';

/**
 * Pieces the Edit workspace's editors share: the inspector's show/hide and its frame, the
 * expand button, the slide fitted to its stage, the slide stepper, Page Up / Page Down, and a
 * text field that saves as you type.
 */

/** Narrower than this, the inspector floats over the slide instead of beside it. */
const FLOAT_BELOW = 720;

/**
 * Whether the inspector is showing. Expanded (the whole window) it's always there. Beside the
 * slide it's remembered between sessions; floating over it (a narrow workspace) it starts
 * closed, so the slide shows. `toggle` is missing while it can't be hidden.
 */
export function useInspector(width: number): { open: boolean; toggle?: () => void } {
  const expanded = useStore((s) => s.editExpanded);
  const pane = usePaneSize('editInspector', 1, 0, 1);
  const [floatOpen, setFloatOpen] = useState(false);
  if (expanded) return { open: true };
  const floating = width > 0 && width < FLOAT_BELOW;
  const open = floating ? floatOpen : pane.size === 1;
  return {
    open,
    toggle: () => (floating ? setFloatOpen(!open) : pane.commit(open ? 0 : 1)),
  };
}

/** Show/hide button for the inspector (none while it's always shown). */
export function InspectorToggle({ open, toggle }: { open: boolean; toggle?: () => void }) {
  const { t } = useTranslation();
  if (!toggle) return null;
  const label = open ? t('canvas.hideInspector') : t('canvas.showInspector');
  return (
    <IconButton size="sm" aria-label={label} title={label} aria-expanded={open} onClick={toggle}>
      {open ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
    </IconButton>
  );
}

/** Expand the editor to the whole window, or bring the playlist and output back beside it. */
export function ExpandToggle() {
  const { t } = useTranslation();
  const expanded = useStore((s) => s.editExpanded);
  const label = expanded ? t('canvas.collapse') : t('canvas.expand');
  return (
    <IconButton
      size="sm"
      aria-label={label}
      title={label}
      aria-pressed={expanded}
      onClick={() => useStore.setState({ editExpanded: !expanded })}
    >
      {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
    </IconButton>
  );
}

/** The inspector's frame: beside the slide, or floating over its right side when narrow. */
export function InspectorShell({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <aside
      aria-label={label}
      className="flex w-[300px] max-w-[85%] shrink-0 flex-col overflow-y-auto bg-[var(--surface-0)]/35 shadow-[-1px_0_0_var(--hairline)] @max-[720px]:absolute @max-[720px]:top-12 @max-[720px]:bottom-0 @max-[720px]:right-0 @max-[720px]:z-20 @max-[720px]:bg-[var(--surface-1)] @max-[720px]:shadow-[-1px_0_0_var(--hairline),-16px_0_40px_rgba(0,0,0,0.45)]"
    >
      {children}
    </aside>
  );
}

/**
 * The slide at the largest 16:9 size that fits the stage, so the whole slide is always in view
 * (no scrolling to reach its bottom edge).
 */
export function useFit(pad: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (): void =>
      setWidth(
        Math.max(240, Math.min(el.clientWidth - pad * 2, ((el.clientHeight - pad * 2) * 16) / 9)),
      );
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pad]);
  return [ref, width];
}

/** The stage the slide sits on: a quiet dotted ground, the slide centred with a soft shadow. */
export function SlideStage({
  stageRef,
  width,
  onBackgroundPointerDown,
  hint,
  children,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  width: number;
  onBackgroundPointerDown?: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={stageRef}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onBackgroundPointerDown?.();
      }}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--surface-0)] bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1px)] [background-size:18px_18px]"
    >
      <div
        style={{ width: width || undefined }}
        className="rounded-[6px] shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_0_1px_var(--hairline-strong)]"
      >
        {children}
      </div>
      {hint && (
        <Typography
          size={11}
          tone="muted"
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap"
        >
          {hint}
        </Typography>
      )}
    </div>
  );
}

/** "Slide 2 of 7" between previous and next. */
export function SlideStepper({
  index,
  total,
  onStep,
}: {
  index: number;
  total: number;
  onStep: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5 rounded-[8px] bg-[var(--surface-2)] p-0.5 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <IconButton
        size="xs"
        aria-label={t('canvas.prevSlide')}
        title={t('canvas.prevSlide')}
        disabled={index <= 0}
        onClick={() => onStep(index - 1)}
      >
        <ChevronLeft size={15} />
      </IconButton>
      <Typography
        size={12}
        weight="semibold"
        tone="secondary"
        tabular
        className="whitespace-nowrap px-1.5"
      >
        {t('canvas.slideOf', { n: index + 1, total })}
      </Typography>
      <IconButton
        size="xs"
        aria-label={t('canvas.nextSlide')}
        title={t('canvas.nextSlide')}
        disabled={index >= total - 1}
        onClick={() => onStep(index + 1)}
      >
        <ChevronRight size={15} />
      </IconButton>
    </div>
  );
}

/** Page Up / Page Down step through the slides being edited (not while typing). */
export function usePageKeys(index: number, select: (index: number) => void): void {
  const latest = useRef(select);
  useEffect(() => {
    latest.current = select;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || (e.key !== 'PageUp' && e.key !== 'PageDown')) return;
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      latest.current(index + (e.key === 'PageDown' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);
}

/**
 * A text field's words while it's being typed in: the typed text while focused (so a change
 * that the stored value tidies, like a trailing comma, never jumps under the caret), the stored
 * value otherwise (so undo and other edits show).
 */
export function useFocusDraft(value: string) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? value,
    onFocus: () => setDraft(value),
    onBlur: () => setDraft(null),
    set: (v: string) => setDraft(v),
  };
}
