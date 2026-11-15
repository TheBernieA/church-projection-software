import { useEffect, useState } from 'react';
import {
  BookOpen,
  Flame,
  Keyboard,
  Layers3,
  MonitorUp,
  Palette,
  Pencil,
  Power,
  Presentation,
  Radio,
  Redo2,
  Rows3,
  Search,
  Settings,
  SquareUser,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, sceneHasContent, sceneIsVisible, secondsSince } from '@lampstand/core';
import { Button, ComingSoonButton, IconButton, Kbd, Switch } from '@lampstand/ui';
import { clearLayer } from '../../lib/actions';
import { cmd } from '../../lib/api';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { attempt, openDialog, redo, undo, useStore, type Mode } from '../../lib/store';

function useElapsed(since: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return since ? formatClock(secondsSince(since, now), { hours: 'always' }) : '00:00:00';
}

const MODES: { mode: Mode; icon: LucideIcon }[] = [
  { mode: 'show', icon: Presentation },
  { mode: 'edit', icon: Pencil },
  { mode: 'reflow', icon: Rows3 },
  { mode: 'bible', icon: BookOpen },
  { mode: 'themes', icon: Palette },
  { mode: 'stage', icon: SquareUser },
];

/** Workspace switcher: what the centre pane shows (slides, editor, reflow, Bible, themes, stage). */
function ModeTabs() {
  const { t } = useTranslation();
  const mode = useStore((s) => s.mode);
  return (
    <nav
      aria-label={t('modes.label')}
      className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-[var(--surface-0)] p-0.5 shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      {MODES.map(({ mode: m, icon: Icon }) => (
        <button
          key={m}
          type="button"
          title={t(`modes.${m}`)}
          aria-pressed={mode === m}
          onClick={() => useStore.setState({ mode: m })}
          className={`flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
            mode === m
              ? 'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[var(--shadow-1)]'
              : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
          }`}
        >
          <Icon size={14} strokeWidth={2} />
          <span className="max-[1400px]:sr-only">{t(`modes.${m}`)}</span>
        </button>
      ))}
    </nav>
  );
}

/** Top toolbar: service · modes · search · flow · history · screens · tools · live state. */
export function Toolbar() {
  const { t } = useTranslation();
  const service = useStore((s) => s.service);
  const live = useStore((s) => s.live);
  const history = useStore((s) => s.history);
  const clickGoesLive = useStore((s) => s.settings?.clickGoesLive ?? true);
  const outputs = useStore((s) => s.displays.filter((d) => d.role !== 'none').length);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const keys = effectiveShortcuts();
  const noOutput = !windowMode && outputs === 0;
  const onAir = !!live && sceneHasContent(live.program);
  const elapsed = useElapsed(onAir ? live.programSince : null);
  const masks = live?.program.masks;
  const masked = !!masks && (masks.black || masks.logo);
  const hot = onAir && !masked;
  const visible =
    !!live && (sceneIsVisible(live.program) || masked || live.program.overlays.length > 0);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-2.5">
      <div
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#ffd28a] via-[#f0a73a] to-[#c27414] text-[#1c1306]"
      >
        <Flame size={16} strokeWidth={2.25} />
      </div>
      <button
        type="button"
        onClick={() => openDialog('services')}
        className="flex min-w-0 max-w-[220px] cursor-pointer flex-col items-start rounded-[var(--radius-control)] px-2 py-0.5 text-left leading-tight transition-colors hover:bg-[var(--surface-2)]"
        title={t('top.services')}
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-3)]">
          {t('top.services')}
        </span>
        <span className="w-full truncate text-[13px] font-semibold">{service?.name ?? ''}</span>
      </button>

      <ModeTabs />

      <button
        type="button"
        onClick={() => openDialog('quick')}
        aria-label={t('top.search')}
        className="flex h-8 min-w-[44px] max-w-[280px] flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-0)] px-2.5 text-left text-[var(--text-3)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-colors hover:text-[var(--text-2)]"
      >
        <Search size={14} strokeWidth={2} />
        <span className="flex-1 truncate text-[12px] max-xl:hidden">{t('top.search')}</span>
        <span className="max-lg:hidden">
          <Kbd>{displayCombo(keys.quickBar)}</Kbd>
        </span>
      </button>

      <label
        className="flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        title={t('top.previewFirstHelp')}
      >
        <Switch
          label={t('top.previewFirst')}
          checked={!clickGoesLive}
          onChange={(on) =>
            void attempt(
              () => cmd('settings.update', { patch: { clickGoesLive: !on } }),
              'errors.setting',
            )
          }
        />
        <span className="whitespace-nowrap max-[1600px]:sr-only">{t('top.previewFirst')}</span>
      </label>

      <div className="flex items-center">
        <IconButton
          aria-label={`${t('top.undo')} (${displayCombo(keys.undo)})`}
          onClick={() => void undo()}
          disabled={!history.canUndo}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          aria-label={`${t('top.redo')} (${displayCombo(keys.redo)})`}
          onClick={() => void redo()}
          disabled={!history.canRedo}
        >
          <Redo2 size={16} />
        </IconButton>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => openDialog('outputs')}
          className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-[12px] font-medium transition-colors ${
            noOutput
              ? 'bg-[rgba(245,165,36,0.12)] text-[var(--warning)] shadow-[inset_0_0_0_1px_rgba(245,165,36,0.35)] hover:bg-[rgba(245,165,36,0.2)]'
              : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
          }`}
          title={noOutput ? t('outputs.noneHelp') : t('top.outputs')}
        >
          {noOutput ? <TriangleAlert size={15} /> : <MonitorUp size={15} />}
          <span className="tnum whitespace-nowrap">
            {noOutput
              ? t('outputs.none')
              : windowMode
                ? t('outputs.windowShort')
                : t('outputs.count', { count: outputs })}
          </span>
        </button>
        <ComingSoonButton
          compact
          icon={<Layers3 size={15} />}
          title={t('soon.tooltip', { name: t('top.looks') })}
        >
          {t('top.looks')}
        </ComingSoonButton>
        <ComingSoonButton
          compact
          icon={<Radio size={15} />}
          title={t('soon.tooltip', { name: t('top.capture') })}
        >
          {t('top.capture')}
        </ComingSoonButton>
        <IconButton aria-label={t('top.shortcuts')} onClick={() => openDialog('shortcuts')}>
          <Keyboard size={16} />
        </IconButton>
        <IconButton aria-label={t('top.settings')} onClick={() => openDialog('settings')}>
          <Settings size={16} />
        </IconButton>
      </div>

      {/* Turn off live: one obvious control, right beside the indicator it switches off. */}
      {visible && (
        <Button
          size="sm"
          variant="subtle"
          className="shrink-0 !text-[var(--tally-program)] hover:!bg-[var(--danger-soft)]"
          icon={<Power size={15} />}
          onClick={() => void clearLayer('all')}
          title={`${t('monitor.clearAll')} (${displayCombo(keys.clearAll)})`}
        >
          <span className="whitespace-nowrap">{t('monitor.clearAll')}</span>
          <span className="max-[1600px]:hidden">
            <Kbd>{displayCombo(keys.clearAll)}</Kbd>
          </span>
        </Button>
      )}

      {/* LIVE indicator: the one place red appears in the chrome. */}
      <div
        role="status"
        aria-live="polite"
        className={`tnum flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-[background-color,box-shadow] duration-200 ${
          hot
            ? 'bg-[var(--tally-program)] text-white shadow-[0_4px_16px_rgba(239,74,80,0.45)]'
            : 'bg-[var(--surface-2)] text-[var(--text-3)]'
        }`}
      >
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${hot ? 'bg-white shadow-[0_0_8px_white]' : 'bg-[var(--text-3)]'}`}
        />
        <span className="tracking-wide">
          {hot
            ? t('top.live').toUpperCase()
            : masked
              ? masks.black
                ? t('monitor.black')
                : t('monitor.logo')
              : t('top.offAirShort')}
        </span>
        {onAir && <span className={hot ? 'text-white/85' : ''}>{elapsed}</span>}
      </div>
    </header>
  );
}
