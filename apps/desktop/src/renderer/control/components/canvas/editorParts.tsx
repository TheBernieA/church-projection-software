import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Rows3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { useStore } from '../../lib/store';
import { usePaneSize } from '../shell/Splitter';

/**
 * Pieces every slide editor in the Edit workspace shares (text slides and songs): the
 * inspector's show/hide and its frame, the slide fitted to the stage, the slide stepper, and the
 * panel for typing a slide's words in place.
 */

/** Narrower than this, the inspector floats over the slide instead of beside it. */
const FLOAT_BELOW = 720;

/**
 * Whether the inspector is showing. Beside the slide it's remembered between sessions; floating
 * over it (a narrow workspace) it starts closed, so the slide shows.
 */
export function useInspector(width: number) {
  const pane = usePaneSize('editInspector', 1, 0, 1);
  const [floatOpen, setFloatOpen] = useState(false);
  const floating = width > 0 && width < FLOAT_BELOW;
  const open = floating ? floatOpen : pane.size === 1;
  return {
    open,
    toggle: () => (floating ? setFloatOpen(!open) : pane.commit(open ? 0 : 1)),
  };
}

/** Show/hide button for the inspector. */
export function InspectorToggle({ open, toggle }: { open: boolean; toggle: () => void }) {
  const { t } = useTranslation();
  const label = open ? t('canvas.hideInspector') : t('canvas.showInspector');
  return (
    <IconButton size="sm" aria-label={label} title={label} aria-expanded={open} onClick={toggle}>
      {open ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
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
  hint: string;
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
      <Typography
        size={11}
        tone="muted"
        className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap"
      >
        {hint}
      </Typography>
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

/**
 * The editor's header: what is being edited, which slide of how many (with previous and next),
 * anything the editor adds (`children`), then Reflow (all the words at once) and the inspector.
 * Narrow, it keeps what's needed.
 */
export function EditorBar({
  icon,
  title,
  index,
  total,
  onStep,
  inspector,
  children,
}: {
  icon: ReactNode;
  title: string;
  index: number;
  total: number;
  onStep: (index: number) => void;
  inspector: ReturnType<typeof useInspector>;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-3 @max-[560px]:gap-1.5 @max-[560px]:px-2">
      <span className="contents @max-[560px]:hidden">{icon}</span>
      <div className="min-w-0 @max-[560px]:hidden">
        <Typography as="h2" size={14} weight="semibold" tone="primary" truncate>
          {title}
        </Typography>
      </div>
      <SlideStepper index={index} total={total} onStep={onStep} />
      {children}
      <span className="flex-1" />
      <Button
        size="sm"
        variant="ghost"
        icon={<Rows3 size={14} />}
        title={t('canvas.reflowHint')}
        aria-label={t('canvas.reflow')}
        onClick={() => useStore.setState({ mode: 'reflow' })}
      >
        <span className="@max-[560px]:hidden">{t('canvas.reflow')}</span>
      </Button>
      <InspectorToggle {...inspector} />
    </header>
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

/** Class for the fields inside the typing panel. */
export const INLINE_FIELD =
  'w-full resize-none rounded-[8px] border-0 bg-white/8 px-3 py-2 text-white outline-none ring-1 ring-white/15 placeholder:text-white/35 focus:ring-2 focus:ring-[var(--accent)]';

/**
 * A slide's words, typed right on it: a panel over the slide (which keeps changing behind it as
 * you type). Escape, ⌘↩ or Done closes it; keys typed here never reach the canvas or the show.
 */
export function InlinePanel({
  hint,
  onClose,
  children,
}: {
  hint: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-label={t('canvas.editWords')}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation(); // typing here never nudges objects or changes slides
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onClose();
        }
      }}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 p-[6%] backdrop-blur-[2px]"
    >
      <div className="flex w-full max-w-[720px] flex-col gap-2.5 rounded-[12px] bg-[rgba(18,20,28,0.92)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]">
        {children}
        <div className="flex items-center gap-3">
          <Typography size={11} tone="inherit" className="flex-1 text-white/55">
            {hint}
          </Typography>
          <Button size="xs" variant="primary" icon={<Check size={13} />} onClick={onClose}>
            {t('canvas.done')}
          </Button>
        </div>
      </div>
    </div>
  );
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
