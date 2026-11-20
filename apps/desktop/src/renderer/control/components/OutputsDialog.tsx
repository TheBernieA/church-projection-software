import { useEffect } from 'react';
import { AppWindow, Grid3x3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { KEY_COLORS, type KeyFeedMode, type OutputRole } from '@lampstand/core';
import { Button, Segmented, Switch, Typography } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { cmd } from '../lib/api';
import { closeDialog, openDialog, refresh, useStore } from '../lib/store';
import { feature } from '../lib/features';
import type { SettingsPageId } from '../types';
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
/**
 * The alternate (HDMI) output as a key feed for a video mixer: the words and props only, over a
 * flat colour the mixer removes. Its themes are chosen in Themes › Alternate.
 */
function KeyFeed({ hasAlternate }: { hasAlternate: boolean }) {
  const { t } = useTranslation();
  const mode = useStore((s) => s.settings?.keyFeed.mode ?? 'off');
  return (
    <section
      aria-label={t('outputs.key.title')}
      className="mt-4 flex flex-col gap-2.5 rounded-[var(--radius-card)] bg-[var(--surface-2)] px-4 py-3.5 shadow-[var(--shadow-1)]"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-11 w-[72px] shrink-0 rounded-[4px] shadow-[0_0_0_1.5px_var(--hairline-strong)]"
          style={{ background: mode === 'off' ? 'var(--surface-0)' : KEY_COLORS[mode] }}
        />
        <div className="min-w-0 flex-1">
          <Typography as="p" size={13} weight="semibold" tone="primary">
            {t('outputs.key.title')}
          </Typography>
          <Typography as="p" size={11} tone="muted" leading="snug">
            {t('outputs.key.help')}
          </Typography>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Segmented<KeyFeedMode>
          label={t('outputs.key.mode')}
          value={mode}
          onChange={(m) => void saveSettings({ keyFeed: { mode: m } })}
          options={(['off', 'green', 'blue', 'black'] as const).map((m) => ({
            value: m,
            label: t(`outputs.key.modes.${m}`),
          }))}
        />
        <Typography size={11} tone="muted" className="min-w-0 flex-1">
          {t(`outputs.key.modeHelp.${mode}`)}
        </Typography>
      </div>
      {!hasAlternate && (
        <Typography as="p" size={11} tone="inherit" className="text-[var(--accent)]">
          {t('outputs.key.noAlternate')}
        </Typography>
      )}
      <div>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            closeDialog();
            useStore.setState({ mode: 'themes' });
          }}
        >
          {t('outputs.key.themes')}
        </Button>
      </div>
    </section>
  );
}

/** Open Settings at one of its pages (the Outputs dialog makes way for it). */
const openSettingsPage = (page: SettingsPageId): void =>
  openDialog('settings', { settingsPage: page });

/** A ready output type: what it does, and a button to where it's set up. */
function MoreOutput({ id, action, onClick }: { id: string; action: string; onClick: () => void }) {
  const f = feature(id);
  return (
    <li className="flex items-start gap-3 px-4 py-3" data-feature={id}>
      <div className="min-w-0 flex-1">
        <Typography as="p" size={13} tone="primary" weight="medium">
          {f.name}
        </Typography>
        <Typography as="p" variant="caption" leading="snug" className="mt-0.5">
          {f.description}
        </Typography>
      </div>
      <Button size="xs" variant="ghost" onClick={onClick} className="shrink-0">
        {action}
      </Button>
    </li>
  );
}

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
      <KeyFeed hasAlternate={displays.some((d) => d.role === 'secondary')} />
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
        <ul className="divide-y divide-[var(--hairline)]">
          <MoreOutput
            id="ndi"
            action={t('outputs.openNdi')}
            onClick={() => openSettingsPage('ndi')}
          />
          <MoreOutput
            id="multiview"
            action={t('outputs.openMultiview')}
            onClick={() => void cmd('multiview.open', { open: true })}
          />
          <MoreOutput
            id="edge-blend"
            action={t('outputs.openScreens')}
            onClick={() => openSettingsPage('screens')}
          />
          <MoreOutput
            id="output-adjust"
            action={t('outputs.openScreens')}
            onClick={() => openSettingsPage('screens')}
          />
        </ul>
        <SoonList ids={['sdi', 'syphon']} />
      </details>
    </Dialog>
  );
}
