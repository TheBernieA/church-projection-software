import { useTranslation } from 'react-i18next';
import type { StreamSettings } from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Segmented, Switch, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { QUICK_MODES } from '../../lib/streamOptions';
import { Section } from './consoleParts';

/**
 * The few settings worth reaching without opening Settings: how hard the stream works this
 * computer, whether going live also records, and whether the picture shows before going live.
 */
export function QuickSettings({
  s,
  st,
  showReady,
  canReady,
  onReady,
}: {
  s: StreamStatus | null;
  st: StreamSettings;
  showReady: boolean;
  canReady: boolean;
  onReady: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const running = !!s && s.state !== 'idle';
  const p = s?.profile;
  return (
    <Section title={t('console.quick')}>
      <div className="flex flex-col gap-1.5">
        <Segmented<StreamSettings['performance']>
          label={t('streaming.performanceMode')}
          value={st.performance}
          disabled={running}
          onChange={(performance) => void saveSettings({ stream: { ...st, performance } })}
          options={[
            ...QUICK_MODES.map((m) => ({ value: m, label: t(`streaming.modes.${m}`) })),
            ...(st.performance === 'custom'
              ? [{ value: 'custom' as const, label: t('streaming.modes.custom') }]
              : []),
          ]}
        />
        <Typography as="p" size={11} tone="muted" leading="snug">
          {running
            ? t('console.quickLocked')
            : p
              ? t('console.quickNow', {
                  size: `${p.height}p${p.fps}`,
                  rate: (p.videoKbps / 1000).toFixed(1),
                })
              : null}
        </Typography>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Typography size={12} tone="secondary">
          {t('console.recordWithStream')}
        </Typography>
        <Switch
          label={t('console.recordWithStream')}
          checked={st.recording.recordWhileStreaming}
          disabled={!!s?.streaming}
          onChange={(recordWhileStreaming) =>
            void saveSettings({
              stream: { ...st, recording: { ...st.recording, recordWhileStreaming } },
            })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Typography size={12} tone="secondary">
          {t('console.showBefore')}
        </Typography>
        <Switch
          label={t('console.showBefore')}
          checked={showReady && canReady}
          disabled={!canReady}
          onChange={onReady}
        />
      </div>
    </Section>
  );
}
