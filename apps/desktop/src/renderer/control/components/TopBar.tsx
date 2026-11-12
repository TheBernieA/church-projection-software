import { useEffect, useState } from 'react';
import { ChevronDown, MonitorUp, Power, Redo2, Search, TriangleAlert, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, sceneHasContent, sceneIsVisible, secondsSince } from '@lampstand/core';
import { Button, IconButton, Kbd } from '@lampstand/ui';
import { clearLayer } from '../lib/actions';
import { displayCombo, effectiveShortcuts } from '../lib/shortcuts';
import { openDialog, redo, undo, useStore } from '../lib/store';

function useElapsed(since: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return since ? formatClock(secondsSince(since, now), { hours: 'always' }) : '00:00:00';
}

export function TopBar() {
  const { t } = useTranslation();
  const service = useStore((s) => s.service);
  const live = useStore((s) => s.live);
  const history = useStore((s) => s.history);
  const outputs = useStore((s) => s.displays.filter((d) => d.role !== 'none').length);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const keys = effectiveShortcuts();
  const noOutput = !windowMode && outputs === 0;
  const onAir = !!live && sceneHasContent(live.program);
  const programSince = live ? live.programSince : null;
  const elapsed = useElapsed(onAir ? programSince : null);
  const masks = live?.program.masks;
  const masked = !!masks && (masks.black || masks.logo);
  const hot = onAir && !masked;
  const visible = !!live && (sceneIsVisible(live.program) || masked);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 pr-3">
      <button
        type="button"
        onClick={() => openDialog('services')}
        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
        title={t('top.services')}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[11px] font-medium text-[var(--text-3)]">{t('top.services')}</span>
          <span className="truncate text-[14px] font-semibold">{service?.name ?? ''}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--text-3)]" />
      </button>

      <button
        type="button"
        onClick={() => openDialog('quick')}
        className="mx-auto flex h-10 w-[min(520px,40vw)] cursor-pointer items-center gap-2.5 rounded-[10px] bg-[var(--surface-1)] px-3.5 text-left text-[var(--text-3)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
      >
        <Search size={16} strokeWidth={2} />
        <span className="flex-1 truncate text-[13px]">{t('top.search')}</span>
        <Kbd>{displayCombo(keys.quickBar)}</Kbd>
      </button>

      <div className="flex items-center gap-0.5">
        <IconButton
          aria-label={`${t('top.undo')} (${displayCombo(keys.undo)})`}
          onClick={() => void undo()}
          disabled={!history.canUndo}
        >
          <Undo2 size={17} />
        </IconButton>
        <IconButton
          aria-label={`${t('top.redo')} (${displayCombo(keys.redo)})`}
          onClick={() => void redo()}
          disabled={!history.canRedo}
        >
          <Redo2 size={17} />
        </IconButton>
      </div>

      <button
        type="button"
        onClick={() => openDialog('outputs')}
        className={`flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3 text-[13px] transition-colors ${
          noOutput
            ? 'bg-[rgba(245,165,36,0.12)] font-medium text-[var(--warning)] shadow-[inset_0_0_0_1px_rgba(245,165,36,0.35)] hover:bg-[rgba(245,165,36,0.2)]'
            : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
        }`}
        title={noOutput ? t('outputs.noneHelp') : t('top.outputs')}
      >
        {noOutput ? <TriangleAlert size={16} /> : <MonitorUp size={16} />}
        <span className="tnum">
          {noOutput
            ? t('outputs.none')
            : windowMode
              ? t('outputs.windowShort')
              : t('outputs.count', { count: outputs })}
        </span>
      </button>

      {/* Turn off live: one obvious control, right beside the indicator it switches off. */}
      {visible && (
        <Button
          size="md"
          variant="subtle"
          className="!text-[var(--tally-program)] hover:!bg-[var(--danger-soft)]"
          icon={<Power size={16} />}
          onClick={() => void clearLayer('all')}
          title={`${t('monitor.clearAll')} (${displayCombo(keys.clearAll)})`}
        >
          {t('monitor.clearAll')}
          <Kbd>{displayCombo(keys.clearAll)}</Kbd>
        </Button>
      )}

      {/* LIVE pill — the one place red appears in the chrome: it means something is on screen. */}
      <div
        role="status"
        aria-live="polite"
        className={`tnum flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,box-shadow] duration-200 ${
          hot
            ? 'bg-[var(--tally-program)] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_6px_22px_rgba(239,74,80,0.45)]'
            : 'bg-[var(--surface-1)] text-[var(--text-3)] shadow-[var(--shadow-1)]'
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
