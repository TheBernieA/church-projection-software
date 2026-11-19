import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Images,
  LayoutGrid,
  Monitor,
  PanelLeft,
  Radio,
  PanelTop,
  SlidersHorizontal,
  SlidersVertical,
  HardDriveDownload,
  ListPlus,
  MonitorUp,
  PackagePlus,
  Play,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Kbd, Typography } from '@lampstand/ui';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { FEATURE_CATEGORIES, FEATURES } from '../../lib/features';
import { openDialog, useStore } from '../../lib/store';
import { Group, SettingsPage } from './parts';
import { type ShortcutAction } from '../../types';
import { type SettingsPageId } from '../../types';

export type { SettingsPageId } from '../../types';

interface Step {
  id: string;
  icon: ReactNode;
  /** `undefined` = the app can't tell, so no tick is shown. */
  done?: boolean;
  action?: { label: string; run: () => void };
}

function StepRow({ n, step, title, body }: { n: number; step: Step; title: string; body: string }) {
  return (
    <div
      className="flex gap-4 px-4 py-4"
      data-step={step.id}
      data-done={step.done === undefined ? undefined : String(step.done)}
    >
      <Typography
        size={12}
        weight="semibold"
        aria-hidden
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          step.done
            ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
            : 'bg-[var(--surface-3)] text-[var(--text-2)]'
        }`}
      >
        {step.done ? <Check size={14} strokeWidth={3} /> : n}
      </Typography>
      <div className="min-w-0 flex-1">
        <Typography as="p" variant="label" className="flex items-center gap-2">
          <Typography tone="muted">{step.icon}</Typography>
          {title}
          {step.done && <span className="sr-only"> (done)</span>}
        </Typography>
        <Typography as="p" size={12} tone="secondary" leading="relaxed" className="mt-1">
          {body}
        </Typography>
      </div>
      {step.action && (
        <Button
          size="xs"
          variant="ghost"
          className="mt-0.5 shrink-0"
          onClick={step.action.run}
          icon={<ArrowRight size={13} />}
        >
          {step.action.label}
        </Button>
      )}
    </div>
  );
}

/** Every shortcut, in the order an operator meets them. */
const KEYS: ShortcutAction[] = [
  'goLive',
  'next',
  'previous',
  'quickBar',
  'clearContent',
  'clearMedia',
  'clearBackground',
  'clearOverlays',
  'clearAll',
  'panic',
  'black',
  'logo',
  'freeze',
  'mediaToggle',
  'undo',
  'redo',
  'cheatSheet',
  'perfHud',
];

/** The regions of the window, left to right, for the tour. */
const TOUR: { id: string; icon: ReactNode }[] = [
  { id: 'toolbar', icon: <PanelTop size={15} /> },
  { id: 'sidebar', icon: <PanelLeft size={15} /> },
  { id: 'show', icon: <LayoutGrid size={15} /> },
  { id: 'output', icon: <Monitor size={15} /> },
  { id: 'controls', icon: <SlidersHorizontal size={15} /> },
  { id: 'media', icon: <Images size={15} /> },
];

/** Every built feature, grouped by area and filterable: the guide's "what can it do" list. */
function FeatureIndex() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const groups = FEATURE_CATEGORIES.map((c) => ({
    ...c,
    items: FEATURES.filter(
      (f) =>
        f.category === c.id &&
        f.status === 'available' &&
        (!q || `${f.name} ${f.description}`.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.items.length > 0);
  return (
    <div className="px-4 py-3" data-testid="feature-index">
      <div className="relative mb-3">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
        />
        <input
          className="field h-8 !pl-8"
          placeholder={t('guide.everything.filter')}
          aria-label={t('guide.everything.filter')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {groups.length === 0 && (
        <Typography as="p" variant="caption" className="py-2">
          {t('guide.everything.none')}
        </Typography>
      )}
      {groups.map((g) => (
        <section key={g.id} className="mb-3 last:mb-0">
          <Typography as="h4" variant="overline" className="pb-1.5">
            {g.name}
          </Typography>
          <ul className="divide-y divide-[var(--hairline)] rounded-[6px] bg-[var(--surface-1)] shadow-[inset_0_0_0_1px_var(--hairline)]">
            {g.items.map((f) => (
              <li key={f.id} className="px-3 py-2" data-feature={f.id}>
                <Typography as="p" variant="label">
                  {f.name}
                </Typography>
                <Typography as="p" variant="caption" leading="snug" className="mt-0.5">
                  {f.description}
                </Typography>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
/** The recipes, in the order a new operator needs them. */
const HOWTO = [
  'song',
  'playlist',
  'verse',
  'preview',
  'clear',
  'backgrounds',
  'arrangement',
  'tiles',
  'edit',
  'import',
  'web',
  'props',
  'timers',
  'stage',
  'fitScreens',
  'edgeBlend',
  'multiview',
  'themes',
  'text',
  'logo',
  'announcements',
  'audio',
  'backup',
  'undo',
];
/** Going live, from the first stream to the low-delay links. */
const LIVE_HOWTO = [
  'youtube',
  'console',
  'picture',
  'screens',
  'record',
  'slow',
  'delay',
  'direct',
  'ndi',
  'keyFeed',
  'trouble',
];

/** Cameras, the sound desk, and desks or controllers driving the show. */
const DESK_HOWTO = ['cameras', 'deskSound', 'midi', 'osc', 'feedback', 'cues', 'deskTrouble'];

/** A list of recipes that open on a click. */
function Recipes({
  group,
  ids,
  values,
}: {
  group: string;
  ids: string[];
  values: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <>
      {ids.map((id, i) => (
        <details key={id} className="group px-4 py-2.5" data-howto={id}>
          <Typography
            as="summary"
            variant="label"
            className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
          >
            <ChevronRight
              size={14}
              aria-hidden
              className="shrink-0 text-[var(--text-3)] transition-transform group-open:rotate-90"
            />
            <Typography size={12} tone="muted" tabular className="w-5 shrink-0">
              {i + 1}.
            </Typography>
            {t(`guide.${group}.items.${id}.q`)}
          </Typography>
          <RecipeSteps text={t(`guide.${group}.items.${id}.a`, values)} />
        </details>
      ))}
    </>
  );
}

const STEP = /^(\d+)\.\s+(.*)$/;

/** A recipe's answer: its numbered lines as steps, any other line as a note after them. */
function RecipeSteps({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const steps = lines.flatMap((l) => {
    const m = STEP.exec(l);
    return m ? [{ n: m[1] ?? '', body: m[2] ?? '' }] : [];
  });
  const notes = lines.filter((l) => !STEP.test(l));
  return (
    <div className="mt-2 pl-[50px] pr-2">
      {steps.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-2.5">
              <Typography
                size={11}
                weight="semibold"
                tone="inherit"
                tabular
                className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"
              >
                {s.n}
              </Typography>
              <Typography size={12} tone="secondary" leading="relaxed" className="min-w-0">
                {s.body}
              </Typography>
            </li>
          ))}
        </ol>
      )}
      {notes.map((note) => (
        <Typography
          as="p"
          key={note}
          size={12}
          tone="muted"
          leading="relaxed"
          className={steps.length ? 'mt-2.5 border-l-2 border-[var(--hairline-strong)] pl-2.5' : ''}
        >
          {note}
        </Typography>
      ))}
    </div>
  );
}

const QUICK_EXAMPLES = ['jn 3 16', 'Romans 8:28-39', '#23', 'amazing grace'];

/** In-app guide: a getting-started checklist that reflects real state, plus the essentials. */
export function GuidePage({ goTo }: { goTo: (page: SettingsPageId) => void }) {
  const { t } = useTranslation();
  const outputsReady = useStore(
    (s) => !!s.settings?.windowMode || s.displays.some((d) => d.role !== 'none'),
  );
  const serviceReady = useStore((s) => !!s.service?.items.some((i) => i.kind !== 'header'));
  const wentLive = useStore((s) => !!s.live?.programSince);
  const keys = effectiveShortcuts();
  // Step text uses the operator's actual (possibly remapped) keys.
  const keyNames: Record<string, string> = {
    ...Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, displayCombo(v)])),
    quick: displayCombo(keys.quickBar),
  };

  const steps: Step[] = [
    {
      id: 'screens',
      icon: <MonitorUp size={14} />,
      done: outputsReady,
      action: { label: t('guide.open.outputs'), run: () => openDialog('outputs') },
    },
    {
      id: 'packages',
      icon: <PackagePlus size={14} />,
      action: { label: t('guide.open.packages'), run: () => goTo('packages') },
    },
    { id: 'service', icon: <ListPlus size={14} />, done: serviceReady },
    { id: 'live', icon: <Play size={14} />, done: wentLive },
    {
      id: 'control',
      icon: <ShieldAlert size={14} />,
      action: { label: t('guide.open.shortcuts'), run: () => openDialog('shortcuts') },
    },
    {
      id: 'backup',
      icon: <HardDriveDownload size={14} />,
      action: { label: t('guide.open.library'), run: () => goTo('library') },
    },
  ];
  const trackable = steps.filter((s) => s.done !== undefined);
  const doneCount = trackable.filter((s) => s.done).length;

  return (
    <SettingsPage title={t('settings.pages.guide')} description={t('guide.intro')}>
      <Group
        title={t('guide.gettingStarted')}
        footnote={t('guide.progress', { done: doneCount, total: trackable.length })}
      >
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            n={i + 1}
            step={step}
            title={t(`guide.steps.${step.id}.title`)}
            body={t(`guide.steps.${step.id}.body`, keyNames)}
          />
        ))}
      </Group>

      <Group title={t('guide.tour.title')} footnote={t('guide.tour.help')}>
        {TOUR.map((r) => (
          <div key={r.id} className="flex gap-3 px-4 py-3" data-tour={r.id}>
            <span className="mt-0.5 shrink-0 text-[var(--accent)]">{r.icon}</span>
            <div className="min-w-0">
              <Typography as="p" variant="label">
                {t(`guide.tour.${r.id}.title`)}
              </Typography>
              <Typography as="p" size={12} tone="secondary" leading="relaxed" className="mt-0.5">
                {t(`guide.tour.${r.id}.body`, keyNames)}
              </Typography>
            </div>
          </div>
        ))}
      </Group>

      <Group title={t('guide.howto.title')} footnote={t('guide.howto.help')}>
        <Recipes group="howto" ids={HOWTO} values={keyNames} />
      </Group>

      <Group
        title={t('guide.live.title')}
        footnote={t('guide.live.help')}
        action={
          <span className="flex gap-1">
            <Button
              size="xs"
              variant="ghost"
              icon={<Radio size={13} />}
              onClick={() => goTo('streaming')}
            >
              {t('guide.open.streaming')}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => goTo('ndi')}>
              {t('guide.open.ndi')}
            </Button>
          </span>
        }
      >
        <Recipes group="live" ids={LIVE_HOWTO} values={keyNames} />
      </Group>

      <Group
        title={t('guide.desk.title')}
        footnote={t('guide.desk.help')}
        action={
          <span className="flex gap-1">
            <Button
              size="xs"
              variant="ghost"
              icon={<SlidersVertical size={13} />}
              onClick={() => goTo('surfaces')}
            >
              {t('guide.open.surfaces')}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => goTo('video')}>
              {t('guide.open.video')}
            </Button>
          </span>
        }
      >
        <Recipes group="desk" ids={DESK_HOWTO} values={keyNames} />
      </Group>

      <Group
        title={t('guide.quickBar')}
        footnote={t('guide.quickBarHelp', { key: displayCombo(keys.quickBar) })}
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-4">
          <Search size={15} className="text-[var(--text-3)]" aria-hidden />
          {QUICK_EXAMPLES.map((ex) => (
            <Typography
              as="code"
              size={12}
              tone="primary"
              key={ex}
              className="rounded-[6px] bg-[var(--surface-1)] px-2 py-1 font-mono shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
            >
              {ex}
            </Typography>
          ))}
        </div>
      </Group>

      <Group title={t('guide.allKeys')} footnote={t('guide.keysHelp')}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 px-4 py-4">
          {KEYS.map((k) => (
            <Typography
              as="div"
              variant="body"
              key={k}
              className="flex items-center justify-between gap-3"
            >
              <Typography tone="secondary" truncate>
                {t(`shortcuts.action.${k}`)}
              </Typography>
              <Kbd>{displayCombo(keys[k])}</Kbd>
            </Typography>
          ))}
        </div>
      </Group>

      <Group title={t('guide.everything.title')} footnote={t('guide.everything.help')}>
        <FeatureIndex />
      </Group>

      <Group title={t('guide.colours')}>
        {(['preview', 'live', 'accent'] as const).map((c) => (
          <div key={c} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{
                background:
                  c === 'preview'
                    ? 'var(--tally-preview)'
                    : c === 'live'
                      ? 'var(--tally-program)'
                      : 'var(--accent)',
              }}
            />
            <Typography variant="label">{t(`guide.colour.${c}.title`)}</Typography>
            <Typography variant="caption">{t(`guide.colour.${c}.body`)}</Typography>
          </div>
        ))}
      </Group>
    </SettingsPage>
  );
}
