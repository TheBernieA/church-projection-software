import { useEffect } from 'react';
import { AppWindow, Grid3x3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { OutputRole } from '@lampstand/core';
import { Button, Segmented, Switch, Typography } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { cmd } from '../lib/api';
import { refresh, useStore } from '../lib/store';
import { EMPTY_LIST } from '../constants';
import { assignDisplay } from './shell/ScreensMenu';
import { Dialog } from './Dialog';
import { SoonList } from './Soon';

const ROLES: OutputRole[] = ['main', 'stage', 'secondary', 'none'];

/** Each role's colour on the little screen picture (live red, stage blue, copy grey). */
const ROLE_TINT: Record<OutputRole, string> = {
  main: 'var(--tally-program)',
  stage: 'var(--select)',
  secondary: 'var(--text-3)',
  none: 'transparent',
};

/** A test pattern on/off button for one output. */
function PatternButton({
  outputId,
  on,
  disabled,
}: {
  outputId: string;
  on: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="xs"
      variant={on ? 'primary' : 'ghost'}
      icon={<Grid3x3 size={13} />}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => void cmd('live.testPattern', { outputId, on: !on })}
      className="shrink-0"
    >
      {t('outputs.testPattern')}
    </Button>
  );
}

/**
 * Outputs: every display with a picture of its shape, what it shows (Audience, Stage, a copy, or
 * nothing) and a test pattern; then the rehearsal window. The toolbar's Audience and Stage
 * menus do the same for one kind of screen at a time.
 */
export function OutputsDialog() {
  const { t } = useTranslation();
  const open = useStore((s) => s.dialog === 'outputs');
  const displays = useStore((s) => s.displays);
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const patterns = useStore((s) => s.live?.testPatterns ?? EMPTY_LIST);
  useEffect(() => {
    if (open) void refresh('displays');
  }, [open]);

  return (
    <Dialog name="outputs" title={t('outputs.title')}>
      <Typography as="p" size={13} tone="secondary" className="mb-4">
        {t('outputs.help')}
      </Typography>
      <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        {displays.map((d, i) => {
          const outputId = `display-${d.id}`;
          const ratio = d.width && d.height ? d.width / d.height : 16 / 9;
          return (
            <li key={d.id} className="flex flex-col gap-3 px-4 py-3.5">
              <div className="flex items-center gap-3">
                {/* The screen's shape, numbered, tinted by what it shows. */}
                <div className="flex h-11 w-[72px] shrink-0 items-center justify-center">
                  <Typography
                    as="div"
                    size={12}
                    weight="bold"
                    tone={d.role === 'none' ? 'muted' : 'white'}
                    className="flex max-h-full max-w-full items-center justify-center rounded-[4px] shadow-[0_0_0_1.5px_var(--hairline-strong)]"
                    style={{
                      aspectRatio: String(ratio),
                      height: ratio >= 1 ? undefined : '100%',
                      width: ratio >= 1 ? '100%' : undefined,
                      background:
                        d.role === 'none'
                          ? 'var(--surface-0)'
                          : `color-mix(in srgb, ${ROLE_TINT[d.role]} 70%, #000)`,
                    }}
                  >
                    {i + 1}
                  </Typography>
                </div>
                <div className="min-w-0 flex-1">
                  <Typography as="p" size={13} weight="semibold" tone="primary" truncate>
                    {d.label}
                  </Typography>
                  <Typography as="p" size={11} tone="muted" truncate>
                    {[
                      `${d.width}×${d.height}`,
                      d.isControl && t('outputs.control'),
                      d.isPrimary && t('outputs.primary'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                </div>
                <PatternButton
                  outputId={outputId}
                  on={patterns.includes(outputId)}
                  disabled={d.role === 'none' || windowMode}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Segmented<OutputRole>
                  label={t('outputs.roleOf', { name: d.label })}
                  value={d.role}
                  onChange={(r) =>
                    void assignDisplay(d.id, r, d.isControl, t('outputs.warnControl'))
                  }
                  options={ROLES.map((r) => ({ value: r, label: t(`outputs.roleShort.${r}`) }))}
                />
                <Typography size={11} tone="muted" className="min-w-0 flex-1">
                  {t(`outputs.roleHelp.${d.role}`)}
                </Typography>
              </div>
            </li>
          );
        })}
        {/* Rehearsal: the audience output as an ordinary window on this screen. */}
        <li className="flex items-center gap-3 px-4 py-3.5">
          <Typography
            tone="muted"
            className="flex h-11 w-[72px] shrink-0 items-center justify-center"
          >
            <AppWindow size={22} />
          </Typography>
          <div className="min-w-0 flex-1">
            <Typography as="p" size={13} weight="semibold" tone="primary">
              {t('outputs.windowMode')}
            </Typography>
            <Typography as="p" size={11} tone="muted">
              {t('outputs.windowModeHelp')}
            </Typography>
          </div>
          {windowMode && (
            <PatternButton
              outputId="window-main"
              on={patterns.includes('window-main')}
              disabled={false}
            />
          )}
          <Switch
            label={t('outputs.windowMode')}
            checked={windowMode}
            onChange={(on) => void saveSettings({ windowMode: on })}
          />
        </li>
      </ul>
      <details className="mt-4 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        <Typography
          as="summary"
          size={12}
          tone="secondary"
          weight="semibold"
          className="cursor-pointer px-4 py-2.5"
        >
          {t('outputs.more')}
        </Typography>
        <SoonList
          ids={['ndi', 'sdi', 'alpha-key', 'syphon', 'edge-blend', 'output-adjust', 'multiview']}
        />
      </details>
    </Dialog>
  );
}
