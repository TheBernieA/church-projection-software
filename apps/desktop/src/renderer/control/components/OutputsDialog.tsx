import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SoonList } from './Soon';
import type { OutputRole } from '@lampstand/core';
import { cmd } from '../lib/api';
import { attempt, EMPTY_LIST, refresh, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import { Select } from './Select';

const ROLES: OutputRole[] = ['main', 'stage', 'secondary', 'none'];

/** Display role assignment + test patterns + window mode (§7.3). */
export function OutputsDialog() {
  const { t } = useTranslation();
  const open = useStore((s) => s.dialog === 'outputs');
  const displays = useStore((s) => s.displays);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const patterns = useStore((s) => s.live?.testPatterns ?? EMPTY_LIST);
  useEffect(() => {
    if (open) void refresh('displays');
  }, [open]);

  const assign = async (displayId: string, role: OutputRole, isControl: boolean): Promise<void> => {
    if (isControl && role !== 'none' && !window.confirm(t('outputs.warnControl'))) return;
    await attempt(async () => {
      await cmd('display.assign', { displayId, role });
      await refresh('displays');
    });
  };

  return (
    <Dialog name="outputs" title={t('outputs.title')}>
      <p className="mb-4 text-[var(--text-2)]">{t('outputs.help')}</p>
      <ul className="space-y-2">
        {displays.map((d) => {
          const outputId = `display-${d.id}`;
          const testOn = patterns.includes(outputId);
          return (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-[var(--radius-control)] bg-[var(--surface-2)] p-3"
            >
              <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-0)] text-[10px] text-[var(--text-3)]">
                {d.width}×{d.height}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.label}</div>
                <div className="text-[11px] text-[var(--text-3)]">
                  {[d.isControl && t('outputs.control'), d.isPrimary && t('outputs.primary')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="w-48 shrink-0">
                <Select
                  aria-label={`${d.label} role`}
                  value={d.role}
                  onChange={(r) => void assign(d.id, r, d.isControl)}
                  options={ROLES.map((r) => ({
                    value: r,
                    label: t(`outputs.role.${r}`),
                    description: t(`outputs.roleHelp.${r}`),
                  }))}
                />
              </div>
              <label className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  disabled={d.role === 'none' || windowMode}
                  checked={testOn}
                  onChange={(e) => void cmd('live.testPattern', { outputId, on: e.target.checked })}
                />
                {t('outputs.testPattern')}
              </label>
            </li>
          );
        })}
      </ul>
      <label className="mt-5 flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={windowMode}
          onChange={(e) => void cmd('settings.update', { patch: { windowMode: e.target.checked } })}
        />
        <span>
          <span className="font-medium">{t('outputs.windowMode')}</span>
          <span className="block text-[12px] text-[var(--text-2)]">
            {t('outputs.windowModeHelp')}
          </span>
        </span>
      </label>
      {windowMode && (
        <label className="mt-2 flex items-center gap-1.5 pl-6 text-[12px]">
          <input
            type="checkbox"
            checked={patterns.includes('window-main')}
            onChange={(e) =>
              void cmd('live.testPattern', { outputId: 'window-main', on: e.target.checked })
            }
          />
          {t('outputs.testPattern')}
        </label>
      )}
      <details className="mt-5 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-semibold text-[var(--text-2)]">
          {t('outputs.more')}
        </summary>
        <SoonList
          ids={['ndi', 'sdi', 'alpha-key', 'syphon', 'edge-blend', 'output-adjust', 'multiview']}
        />
      </details>
    </Dialog>
  );
}
