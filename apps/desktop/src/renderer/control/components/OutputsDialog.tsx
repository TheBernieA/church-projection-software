import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SoonList } from './Soon';
import type { OutputRole } from '@lampstand/core';
import { saveSettings } from '../lib/actions';
import { cmd } from '../lib/api';
import { attempt, refresh, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import { Checkbox } from './form';
import { Select } from './Select';
import { EMPTY_LIST } from '../constants';
import { Text } from '@lampstand/ui';

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
              <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-0)] text-ui-10 text-[var(--text-3)]">
                {d.width}×{d.height}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.label}</div>
                <div className="text-ui-11 text-[var(--text-3)]">
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
              <Checkbox
                className="text-ui-12"
                label={t('outputs.testPattern')}
                disabled={d.role === 'none' || windowMode}
                checked={testOn}
                onChange={(on) => void cmd('live.testPattern', { outputId, on })}
              />
            </li>
          );
        })}
      </ul>
      <Checkbox
        className="mt-5"
        label={t('outputs.windowMode')}
        description={t('outputs.windowModeHelp')}
        checked={windowMode}
        onChange={(on) => void saveSettings({ windowMode: on })}
      />
      {windowMode && (
        <Checkbox
          className="mt-2 pl-6 text-ui-12"
          label={t('outputs.testPattern')}
          checked={patterns.includes('window-main')}
          onChange={(on) => void cmd('live.testPattern', { outputId: 'window-main', on })}
        />
      )}
      <details className="mt-5 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        <Text
          as="summary"
          size={12}
          tone="secondary"
          weight="semibold"
          className="cursor-pointer px-4 py-2.5"
        >
          {t('outputs.more')}
        </Text>
        <SoonList
          ids={['ndi', 'sdi', 'alpha-key', 'syphon', 'edge-blend', 'output-adjust', 'multiview']}
        />
      </details>
    </Dialog>
  );
}
