import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sceneHasContent } from '@lampstand/core';
import { useNow } from '../../lib/hooks';
import { useStore } from '../../lib/store';

function Dot({ tone }: { tone: 'ok' | 'idle' | 'live' }) {
  const c =
    tone === 'live'
      ? 'var(--tally-program)'
      : tone === 'ok'
        ? 'var(--tally-preview)'
        : 'var(--text-3)';
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: c, boxShadow: tone === 'idle' ? 'none' : `0 0 6px ${c}` }}
    />
  );
}

/**
 * Slim status bar along the bottom of the window: which screens are connected (red while they
 * show something), whether changes are saved, and the time of day.
 */
export function StatusBar() {
  const { t } = useTranslation();
  const displays = useStore((s) => s.displays);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const saving = useStore((s) => s.saving);
  const onAir = useStore((s) => !!s.live && sceneHasContent(s.live.program));
  const now = useNow(15000); // the clock shows minutes
  const outputs = displays.filter((d) => d.role !== 'none');
  const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <footer
      aria-label={t('status.label')}
      className="tnum flex h-[26px] shrink-0 items-center gap-4 px-3 text-[length:var(--fs-xs)] text-[var(--text-3)]"
    >
      <span className="flex items-center gap-3" aria-label={t('status.outputs')}>
        {windowMode ? (
          <span className="flex items-center gap-1.5">
            <Dot tone="ok" />
            {t('status.window')}
          </span>
        ) : outputs.length === 0 ? (
          <span className="flex items-center gap-1.5">
            <Dot tone="idle" />
            {t('status.noOutputs')}
          </span>
        ) : (
          outputs.map((d) => (
            <span key={d.id} className="flex items-center gap-1.5" title={d.label}>
              <Dot tone={onAir && d.role !== 'stage' ? 'live' : 'ok'} />
              {t(`outputs.role.${d.role}`)}
            </span>
          ))
        )}
      </span>
      <span className="flex items-center gap-1.5">
        {saving ? (
          <Loader2 size={11} className="animate-spin" aria-hidden />
        ) : (
          <Check size={11} aria-hidden />
        )}
        {saving ? t('status.saving') : t('status.saved')}
      </span>
      <span title={t('status.clock')} className="ml-auto text-[var(--text-2)]">
        {clock}
      </span>
    </footer>
  );
}
