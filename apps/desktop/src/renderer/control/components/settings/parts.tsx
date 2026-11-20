import { LookLayerSchema, type LookLayer } from '@lampstand/core';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Info,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { DeferredInput } from '../DeferredControls';
import { Button, IconButton, Typography, typographyClass } from '@lampstand/ui';
import { SettledSlider } from '../form';

/** What the page frame knows about the page it shows (set by the Settings window). */
export interface PageFrame {
  icon: LucideIcon;
  /** Puts this page's preferences back to their defaults (absent: nothing to reset). */
  onReset?: () => void;
  /** The scrolling pane, for the "On this page" list. */
  scroller: RefObject<HTMLDivElement | null>;
}
export const PageFrameContext = createContext<PageFrame | null>(null);

/**
 * One settings page: a sticky header (icon, title, one-line intro, actions, Reset), then its
 * groups, with an "On this page" list beside them when the page is long.
 */
export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const frame = useContext(PageFrameContext);
  const Icon = frame?.icon;
  const body = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);

  // The page's titled groups, for the jump list (read from the page, so it never goes stale).
  useLayoutEffect(() => {
    const read = (): void => {
      const found = [...(body.current?.querySelectorAll<HTMLElement>('[data-section]') ?? [])]
        .map((e) => e.dataset.section ?? '')
        .filter(Boolean);
      setSections((old) => (old.join('\n') === found.join('\n') ? old : found));
    };
    read();
    const mo = new MutationObserver(read);
    if (body.current) mo.observe(body.current, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Which group is in view.
  useEffect(() => {
    const root = frame?.scroller.current;
    if (!root || sections.length < 3) return;
    const onScroll = (): void => {
      const top = root.getBoundingClientRect().top + 96;
      let current: string | null = null;
      for (const e of root.querySelectorAll<HTMLElement>('[data-section]'))
        if (e.getBoundingClientRect().top <= top) current = e.dataset.section ?? null;
      setActive(current ?? sections[0] ?? null);
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [frame, sections]);

  const jump = (name: string): void => {
    const el = frame?.scroller.current?.querySelector<HTMLElement>(
      `[data-section="${CSS.escape(name)}"]`,
    );
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const reset = (): void => {
    if (frame?.onReset && window.confirm(t('settings.resetConfirm', { page: title })))
      frame.onReset();
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-[var(--surface-1)] shadow-[0_1px_0_var(--hairline)]">
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-3.5 py-4 pl-8 pr-16">
          {Icon && (
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-line)]"
            >
              <Icon size={19} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <Typography as="h2" variant="display" className="tracking-[-0.015em]">
              {title}
            </Typography>
            <Typography as="p" size={12} tone="secondary" leading="snug" className="mt-0.5">
              {description}
            </Typography>
          </div>
          {(action || frame?.onReset) && (
            <div className="flex shrink-0 items-center gap-2">
              {action}
              {frame?.onReset && (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<RotateCcw size={13} />}
                  onClick={reset}
                  title={t('settings.resetHelp')}
                >
                  {t('settings.reset')}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1000px] flex-1 gap-8 px-8 pb-12 pt-6">
        <div ref={body} className="min-w-0 max-w-[720px] flex-1 space-y-8">
          {children}
        </div>
        {sections.length >= 3 && (
          <nav
            aria-label={t('settings.onThisPage')}
            className="sticky top-24 hidden h-fit w-[168px] shrink-0 flex-col gap-0.5 min-[1180px]:flex"
          >
            <Typography as="p" variant="overline" className="mb-1.5 px-2">
              {t('settings.onThisPage')}
            </Typography>
            {sections.map((name) => (
              <Button
                key={name}
                variant="bare"
                onClick={() => jump(name)}
                aria-current={active === name ? 'location' : undefined}
                className={`cursor-pointer rounded-[6px] px-2 py-1 text-left shadow-[inset_2px_0_0_var(--hairline)] transition-colors hover:text-[var(--text-1)] aria-[current=location]:text-[var(--text-1)] aria-[current=location]:shadow-[inset_2px_0_0_var(--accent)] ${typographyClass({ size: 12, tone: 'muted' })}`}
              >
                {name}
              </Button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

/** A card of related rows, separated by hairlines. */
export function Group({
  title,
  description,
  footnote,
  action,
  children,
}: {
  title?: string;
  /** A line under the title, before the card. */
  description?: ReactNode;
  footnote?: ReactNode;
  /** A small control beside the title (e.g. "Look again"). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section data-section={title || undefined} className="scroll-mt-24">
      {(title || action) && (
        <div className="mb-2.5 flex min-h-6 items-end justify-between gap-3 px-0.5">
          <div className="min-w-0">
            {title && (
              <Typography as="h3" size={13} weight="semibold" tone="primary">
                {title}
              </Typography>
            )}
            {description && (
              <Typography as="p" variant="caption" leading="snug" className="mt-0.5">
                {description}
              </Typography>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[10px] bg-[var(--surface-2)] shadow-[0_0_0_1px_var(--hairline),var(--shadow-1)]">
        {children}
      </div>
      {footnote && (
        <Typography as="p" variant="caption" leading="relaxed" className="mt-2 px-0.5">
          {footnote}
        </Typography>
      )}
    </section>
  );
}

/** Label + explanation on the left, control on the right (or below, with `stack`). */
export function Row({
  label,
  description,
  htmlFor,
  children,
  stack,
  icon,
  badge,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  stack?: boolean;
  /** A small icon before the label. */
  icon?: ReactNode;
  /** A small tag after the label ("Recommended", "Live"). */
  badge?: ReactNode;
}) {
  return (
    <div
      data-row={label}
      className={`px-4 py-3.5 ${stack ? 'flex flex-col gap-3' : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-2'}`}
    >
      <div className="flex min-w-0 gap-3">
        {icon && (
          <span aria-hidden className="mt-0.5 flex shrink-0 [color:var(--text-3)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Typography
              as={htmlFor ? 'label' : 'span'}
              variant="label"
              tone="primary"
              {...(htmlFor ? { htmlFor } : {})}
            >
              {label}
            </Typography>
            {badge}
          </div>
          {description && (
            <Typography as="p" variant="caption" leading="snug" className="mt-0.5 max-w-[46ch]">
              {description}
            </Typography>
          )}
        </div>
      </div>
      <div className={stack ? 'min-w-0' : 'flex min-w-0 justify-end'}>{children}</div>
    </div>
  );
}

/** A small tag beside a row's label. */
export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'live' | 'ok';
}) {
  const look = {
    neutral: 'bg-[var(--surface-3)] text-[var(--text-2)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    live: 'bg-[var(--tally-program)] text-white',
    ok: 'bg-[color-mix(in_srgb,var(--tally-preview)_18%,transparent)] text-[var(--tally-preview)]',
  }[tone];
  return (
    <Typography
      size={10}
      weight="semibold"
      tone="inherit"
      caps
      className={`rounded-[4px] px-1.5 py-px ${look}`}
    >
      {children}
    </Typography>
  );
}

/** A banner inside a page: information, a warning, or a problem, with an optional action. */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === 'info' ? Info : tone === 'warn' ? AlertTriangle : AlertCircle;
  const color =
    tone === 'info' ? 'var(--text-2)' : tone === 'warn' ? 'var(--accent)' : 'var(--tally-program)';
  return (
    <div
      role={tone === 'info' ? 'note' : 'alert'}
      className="flex items-start gap-3 rounded-[10px] bg-[var(--surface-2)] px-4 py-3"
      style={{ boxShadow: `inset 3px 0 0 ${color}, 0 0 0 1px var(--hairline)` }}
    >
      <span aria-hidden className="mt-0.5 flex shrink-0" style={{ color }}>
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {title && (
          <Typography as="p" size={13} weight="semibold" tone="primary">
            {title}
          </Typography>
        )}
        <Typography as="div" size={12} tone="secondary" leading="relaxed">
          {children}
        </Typography>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Nothing here yet: an icon, a sentence, and what to do about it. */
export function EmptyState({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-7 text-center">
      {icon && (
        <span aria-hidden className="flex [color:var(--text-3)]">
          {icon}
        </span>
      )}
      <Typography as="p" size={12} tone="muted" leading="relaxed" className="max-w-[52ch]">
        {children}
      </Typography>
      {action}
    </div>
  );
}

/** A labelled control inside a card (camera, mask, destination): label above, control below. */
export function CardField({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <Typography
        as={htmlFor ? 'label' : 'span'}
        variant="caption"
        tone="secondary"
        {...(htmlFor ? { htmlFor } : {})}
      >
        {label}
      </Typography>
      {children}
    </div>
  );
}

/** Numeric/text input that shows its unit ("320 characters") and commits after a pause. */
export function UnitInput({
  id,
  value,
  unit,
  wide,
  onCommit,
  type = 'number',
  ...rest
}: {
  id: string;
  value: string;
  unit?: string;
  wide?: boolean;
  onCommit: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <DeferredInput
        id={id}
        type={type}
        value={value}
        onCommit={onCommit}
        className={`field !h-8 ${wide ? '!w-40 text-left' : '!w-20 text-right'} tnum`}
        {...rest}
      />
      {unit && (
        <Typography size={13} tone="muted">
          {unit}
        </Typography>
      )}
    </div>
  );
}

/** Visual Dark / Light picker — a tiny mock of the app in each theme. */
export function ThemeTiles({
  value,
  onChange,
  labels,
}: {
  value: 'dark' | 'light';
  onChange: (v: 'dark' | 'light') => void;
  labels: { dark: string; light: string };
}) {
  const tile = (mode: 'dark' | 'light') => {
    const on = value === mode;
    const c =
      mode === 'dark'
        ? { bg: '#0c0e13', panel: '#1a1e27', line: '#2c3242' }
        : { bg: '#e9ebf0', panel: '#ffffff', line: '#d9dde7' };
    return (
      <Button
        variant="bare"
        key={mode}
        role="radio"
        aria-checked={on}
        onClick={() => onChange(mode)}
        className="group flex cursor-pointer flex-col items-center gap-1.5 focus-visible:outline-none"
      >
        <span
          className={`relative block h-[58px] w-[92px] overflow-hidden rounded-[8px] transition-shadow ${on ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--hairline-strong)] group-hover:shadow-[0_0_0_1px_var(--text-3)]'} group-focus-visible:shadow-[var(--focus-ring)]`}
          style={{ background: c.bg }}
        >
          <span
            className="absolute left-1.5 top-1.5 h-[46px] w-3 rounded-[3px]"
            style={{ background: c.panel }}
          />
          <span
            className="absolute left-6 right-1.5 top-1.5 h-5 rounded-[3px]"
            style={{ background: c.panel }}
          />
          <span
            className="absolute bottom-1.5 left-6 right-1.5 h-[18px] rounded-[3px]"
            style={{ background: c.panel }}
          />
          <span
            className="absolute left-8 top-[13px] h-1 w-8 rounded"
            style={{ background: c.line }}
          />
          <span className="absolute left-[34px] top-[36px] h-[6px] w-[22px] rounded-sm bg-[#e8b04b]" />
          {on && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
        </span>
        <Typography
          size={12}
          tone={on ? 'primary' : 'secondary'}
          weight={on ? 'medium' : 'regular'}
        >
          {labels[mode]}
        </Typography>
      </Button>
    );
  };
  return (
    <div role="radiogroup" aria-label={labels.dark + ' / ' + labels.light} className="flex gap-3">
      {tile('dark')}
      {tile('light')}
    </div>
  );
}

/** A named entry in a list editor (clear group, Look, mask): its name and a delete button. */
export function NameRow({
  value,
  label,
  deleteLabel,
  onRename,
  onDelete,
}: {
  value: string;
  label: string;
  deleteLabel: string;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <DeferredInput
        aria-label={label}
        value={value}
        maxLength={40}
        onCommit={(name) => name.trim() && onRename(name.trim())}
        className="field !h-8 flex-1"
      />
      <IconButton size="xs" variant="danger" aria-label={deleteLabel} onClick={onDelete}>
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

/** Toggle chips picking which screen layers apply (Looks, clear groups). */
export function LayerChips({
  label,
  value,
  onChange,
  names,
  minOne = false,
}: {
  label: string;
  value: readonly LookLayer[];
  onChange: (layers: LookLayer[]) => void;
  /** The chip label for each layer. */
  names: (layer: LookLayer) => string;
  /** At least one layer stays on (a clear group must clear something). */
  minOne?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {LookLayerSchema.options.map((l) => {
        const on = value.includes(l);
        return (
          <Button
            key={l}
            size="2xs"
            variant={on ? 'primary' : 'subtle'}
            aria-pressed={on}
            disabled={minOne && on && value.length === 1}
            onClick={() => onChange(on ? value.filter((x) => x !== l) : [...value, l])}
          >
            {names(l)}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * A labelled slider that saves once, when it's let go (dragging only moves the readout), so a
 * drag is one settings change and one undo step, not dozens.
 */
export function CommitSlider({
  label,
  value,
  min = 0,
  max,
  step = 1,
  format,
  onCommit,
  labelWidth = 'w-16',
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  labelWidth?: string;
}) {
  return (
    <label className="flex items-center gap-3">
      <Typography size={12} tone="secondary" className={`${labelWidth} shrink-0`}>
        {label}
      </Typography>
      <SettledSlider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        format={format}
        onCommit={onCommit}
        className="flex-1"
      />
    </label>
  );
}
