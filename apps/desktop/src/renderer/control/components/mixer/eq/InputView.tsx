import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MixerChannel } from '@lampstand/core';
import { Switch, Typography } from '@lampstand/ui';
import { useHiddenAudioInputs, useInputDevices } from '../../../lib/inputs';
import { mixerCmd, mixerLive } from '../../../lib/mixer';
import { Select } from '../../Select';
import { clamp } from './eqGeometry';
import { Knob } from './Knob';

type Patch = Parameters<typeof mixerLive>[0]['patch'];

const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`;

/** A switch with its name and what it does. */
function Toggle({
  title,
  help,
  label,
  on,
  disabled,
  onChange,
}: {
  title: string;
  help: string;
  label: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Typography size={12} weight="medium" tone="primary">
          {title}
        </Typography>
        <Typography size={11} tone="muted" leading="snug">
          {help}
        </Typography>
      </div>
      <Switch label={label} checked={on} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <Typography size={12} weight="semibold" tone="primary">
        {title}
      </Typography>
      {children}
    </section>
  );
}

/** The channel's input: device, trim, polarity, sync delay, pan, mono and noise suppression. */
export function InputView({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const hidden = useHiddenAudioInputs();
  const devices = useInputDevices('audioinput')?.filter(
    (d) => !hidden.has(d.deviceId) || d.deviceId === c.deviceId,
  );
  const off = c.locked;
  const n = { name: c.name };
  const set = (patch: Patch): void => mixerLive({ action: 'channel', id: c.id, patch });
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 overflow-y-auto">
      <Group title={t('mixer.eqw.levelAndTime')}>
        <div className="flex flex-wrap items-start justify-around gap-4">
          <Knob
            label={t('mixer.trim')}
            pos={(c.trimDb + 20) / 40}
            onPos={(p) => set({ trimDb: Math.round(clamp(p * 40 - 20, -20, 20) * 2) / 2 })}
            onReset={() => set({ trimDb: 0 })}
            text={signed(c.trimDb)}
            bipolar
            disabled={off}
            step={1 / 80}
            size={54}
          />
          <Knob
            label={t('mixer.syncDelay')}
            pos={c.delayMs / 1000}
            onPos={(p) => set({ delayMs: Math.round(clamp(p, 0, 1) * 200) * 5 })}
            onReset={() => set({ delayMs: 0 })}
            text={`${c.delayMs} ms`}
            disabled={off}
            step={1 / 200}
            size={54}
          />
          <Knob
            label={t('mixer.pan')}
            pos={(c.pan + 1) / 2}
            onPos={(p) => set({ pan: Math.round(clamp(p * 2 - 1, -1, 1) * 20) / 20 })}
            onReset={() => set({ pan: 0 })}
            text={
              Math.abs(c.pan) < 0.025
                ? 'C'
                : `${c.pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(c.pan) * 100)}`
            }
            bipolar
            disabled={off}
            step={1 / 40}
            size={54}
          />
        </div>
        <Toggle
          title={t('mixer.invert')}
          help={t('mixer.eqw.invertHelp')}
          label={t('mixer.invertOf', n)}
          on={c.invert}
          disabled={off}
          onChange={(invert) => set({ invert })}
        />
      </Group>
      <Group title={t('mixer.input')}>
        {c.kind === 'input' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Typography size={11} tone="secondary">
                {t('mixer.device')}
              </Typography>
              <Select<string>
                size="sm"
                aria-label={t('mixer.device')}
                value={c.deviceId}
                onChange={(deviceId) =>
                  void mixerCmd({ action: 'channel', id: c.id, patch: { deviceId } })
                }
                options={(devices ?? []).map((d) => ({ value: d.deviceId, label: d.label }))}
                placeholder={t('mixer.deviceMissing')}
              />
            </div>
            <Toggle
              title={t('mixer.mono')}
              help={t('mixer.eqw.monoHelp')}
              label={t('mixer.monoOf', n)}
              on={c.mono}
              disabled={off}
              onChange={(mono) => set({ mono })}
            />
            <Toggle
              title={t('mixer.denoise')}
              help={t('mixer.eqw.denoiseHelp')}
              label={t('mixer.denoiseOf', n)}
              on={c.denoise}
              disabled={off}
              onChange={(denoise) => set({ denoise })}
            />
          </>
        ) : (
          <Typography size={11} tone="muted" leading="snug">
            {t(c.kind === 'tracks' ? 'mixer.eqw.tracksSource' : 'mixer.eqw.videoSource')}
          </Typography>
        )}
      </Group>
    </div>
  );
}
