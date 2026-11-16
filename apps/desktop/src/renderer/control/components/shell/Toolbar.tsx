import {
  BookOpen,
  ChevronDown,
  Circle,
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
import { IconButton, Kbd, Switch } from '@lampstand/ui';
import { clearLayer, saveSettings } from '../../lib/actions';
import { useNow } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { openDialog, redo, undo, useStore } from '../../lib/store';
import { SoonFeature } from '../Soon';
import { type Mode } from '../../types';

function useElapsed(since: string | null): string {
  const now = useNow(1000, since !== null);
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
      className="flex shrink-0 items-center gap-0.5 rounded-[8px] bg-[var(--surface-1)] p-[3px] shadow-[0_0_0_1px_var(--hairline),var(--highlight-top)]"
    >
      {MODES.map(({ mode: m, icon: Icon }) => (
        <button
          key={m}
          type="button"
          title={t(`modes.${m}`)}
          aria-pressed={mode === m}
          onClick={() => useStore.setState({ mode: m })}
          className={`flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
            mode === m
              ? 'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.35),0_0_0_1px_var(--hairline),var(--highlight-top)]'
              : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
          }`}
        >
          <Icon size={14} strokeWidth={2} />
          <span className="max-[1600px]:sr-only">{t(`modes.${m}`)}</span>
        </button>
      ))}
    </nav>
  );
}

/** Top toolbar: service · modes · search · flow · history · screens · tools · live state. */
export function Toolbar() {
  const { t } = useTranslation();
  const service = useStore((s) => s.service);
  // Primitives only: live state is rebroadcast on every timer tick, and the toolbar shouldn't
  // re-render unless what it shows actually changes.
  const onAir = useStore((s) => !!s.live && sceneHasContent(s.live.program));
  const programSince = useStore((s) => s.live?.programSince ?? null);
  const mask = useStore((s) =>
    s.live?.program.masks.black ? 'black' : s.live?.program.masks.logo ? 'logo' : null,
  );
  const masked = mask !== null;
  const showing = useStore(
    (s) => !!s.live && (sceneIsVisible(s.live.program) || s.live.program.overlays.length > 0),
  );
  const visible = showing || masked;
  const history = useStore((s) => s.history);
  const clickGoesLive = useStore((s) => s.settings?.clickGoesLive ?? true);
  const outputs = useStore((s) => s.displays.filter((d) => d.role !== 'none').length);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const keys = effectiveShortcuts();
  const noOutput = !windowMode && outputs === 0;
  const elapsed = useElapsed(onAir ? programSince : null);
  const hot = onAir && !masked;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 bg-[var(--surface-0)] px-3">
      <div
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#ffd28a] via-[#f0a73a] to-[#c27414] text-[#1c1306]"
      >
        <Flame size={16} strokeWidth={2.25} />
      </div>
      <button
        type="button"
        onClick={() => openDialog('services')}
        className="-ml-1.5 flex h-8 min-w-[110px] max-w-[220px] shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] px-2 text-left transition-colors hover:bg-[var(--surface-2)]"
        title={`${t('top.services')}: ${service?.name ?? ''}`}
      >
        <span className="sr-only">{t('top.services')}</span>
        <span className="truncate text-[length:var(--fs-md)] font-semibold">
          {service?.name ?? ''}
        </span>
        <ChevronDown size={13} className="shrink-0 text-[var(--text-3)]" />
      </button>

      <ModeTabs />

      <button
        type="button"
        onClick={() => openDialog('quick')}
        aria-label={t('top.search')}
        className="flex h-8 w-[clamp(150px,16vw,280px)] shrink-0 cursor-pointer items-center gap-2 rounded-[8px] bg-[var(--surface-1)] px-2.5 text-left text-[var(--text-3)] shadow-[0_0_0_1px_var(--hairline),var(--highlight-top)] transition-[color,box-shadow] duration-[var(--dur-fast)] hover:text-[var(--text-2)] hover:shadow-[0_0_0_1px_var(--hairline-strong),var(--highlight-top)]"
      >
        <Search size={14} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[12px]">{t('top.search')}</span>
        <span className="shrink-0 max-lg:hidden">
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
          onChange={(on) => void saveSettings({ clickGoesLive: !on })}
        />
        <span className="whitespace-nowrap">{t('top.previewFirst')}</span>
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
        <SoonFeature id="looks" compact icon={<Layers3 size={15} />} />
        <SoonFeature id="record" compact icon={<Circle size={15} />} />
        <SoonFeature id="stream" compact icon={<Radio size={15} />} />
        <IconButton aria-label={t('top.shortcuts')} onClick={() => openDialog('shortcuts')}>
          <Keyboard size={16} />
        </IconButton>
        <IconButton aria-label={t('top.settings')} onClick={() => openDialog('settings')}>
          <Settings size={16} />
        </IconButton>
      </div>

      {/* Turn off live: one obvious control, right beside the indicator it switches off. */}
      {visible && (
        <IconButton
          size="md"
          variant="subtle"
          className="shrink-0 !text-[var(--tally-program)] hover:!bg-[var(--danger-soft)]"
          aria-label={`${t('monitor.clearAll')} (${displayCombo(keys.clearAll)})`}
          onClick={() => void clearLayer('all')}
        >
          <Power size={17} />
        </IconButton>
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
              ? mask === 'black'
                ? t('monitor.black')
                : t('monitor.logo')
              : t('top.offAirShort')}
        </span>
        {onAir && <span className={hot ? 'text-white/85' : ''}>{elapsed}</span>}
      </div>
    </header>
  );
}
