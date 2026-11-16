import { useState } from 'react';
import { Mic, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '@lampstand/core';
import { Button, Slider, Typography } from '@lampstand/ui';
import { setPreviewOutput, useAudioPreview } from '../../lib/audioPreview';
import { rescanDevices, useInputDevices } from '../../lib/inputs';
import { LevelMeter } from '../bins/AudioInputs';
import { CameraAccess } from '../media/CameraAccess';
import { Select } from '../Select';
import { Group, Row, SettingsPage } from './parts';

const DEFAULT = 'default';

/**
 * Settings › Audio: where the room hears tracks and live inputs, how long Fade out takes,
 * where you listen first on this computer, and every microphone or mixer input with a level
 * meter to check it.
 */
export function AudioPage({
  s,
  update,
}: {
  s: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = useTranslation();
  const outputs = useInputDevices('audiooutput');
  const inputs = useInputDevices('audioinput');
  const preview = useAudioPreview();
  // The fade slider saves once, when let go.
  const [fadeDraft, setFadeDraft] = useState<number | null>(null);
  const fade = fadeDraft ?? s.audio.fadeSec;
  const commitFade = (): void => {
    if (fadeDraft !== null && fadeDraft !== s.audio.fadeSec)
      update({ audio: { ...s.audio, fadeSec: fadeDraft } });
    setFadeDraft(null);
  };
  const outputOptions = [
    { value: DEFAULT, label: t('audioSettings.defaultOutput') },
    ...(outputs ?? []).map((d) => ({ value: d.deviceId, label: d.label })),
  ];
  return (
    <SettingsPage title={t('settings.pages.audio')} description={t('settings.pagesHelp.audio')}>
      <Group title={t('audioSettings.room')} footnote={t('audioSettings.roomHelp')}>
        <Row label={t('audioSettings.roomOutput')} description={t('audioSettings.roomOutputHelp')}>
          <div className="w-60">
            <Select<string>
              size="sm"
              aria-label={t('audioSettings.roomOutput')}
              value={s.audio.roomOutput || DEFAULT}
              onChange={(v) =>
                update({ audio: { ...s.audio, roomOutput: v === DEFAULT ? '' : v } })
              }
              options={outputOptions}
            />
          </div>
        </Row>
        <Row label={t('audioSettings.fade')} description={t('audioSettings.fadeHelp')}>
          <Slider
            aria-label={t('audioSettings.fade')}
            min={0.5}
            max={15}
            step={0.5}
            value={fade}
            format={(v) => t('audioSettings.seconds', { count: v })}
            onChange={(e) => setFadeDraft(Number(e.currentTarget.value))}
            onPointerUp={commitFade}
            onKeyUp={commitFade}
            onBlur={commitFade}
            className="w-60"
          />
        </Row>
      </Group>
      <Group title={t('audioSettings.listen')}>
        <Row label={t('audio.listenOn')} description={t('audioSettings.listenHelp')}>
          <div className="w-60">
            <Select<string>
              size="sm"
              aria-label={t('audio.listenOn')}
              value={preview.sinkId || DEFAULT}
              onChange={(v) => setPreviewOutput(v === DEFAULT ? '' : v)}
              options={outputOptions}
            />
          </div>
        </Row>
      </Group>
      <CameraAccess kind="microphone" />
      <Group
        title={`${t('audioSettings.inputs')}${inputs ? ` · ${inputs.length}` : ''}`}
        footnote={t('audioSettings.inputsHelp')}
        action={
          <Button size="xs" variant="ghost" icon={<RefreshCw size={13} />} onClick={rescanDevices}>
            {t('inputs.lookAgain')}
          </Button>
        }
      >
        {inputs === null ? (
          <Typography as="p" size={12} tone="muted" className="px-4 py-4">
            {t('inputs.looking')}
          </Typography>
        ) : inputs.length === 0 ? (
          <Typography as="p" size={12} tone="muted" className="px-4 py-4">
            {t('inputs.noMics')}
          </Typography>
        ) : (
          inputs.map((d) => (
            <div key={d.deviceId} className="flex items-center gap-3 px-4 py-3">
              <Typography tone="muted" className="flex shrink-0">
                <Mic size={14} />
              </Typography>
              <Typography size={13} truncate className="w-56 shrink-0">
                {d.label}
              </Typography>
              <div className="min-w-0 flex-1">
                <LevelMeter device={d} />
              </div>
            </div>
          ))
        )}
      </Group>
    </SettingsPage>
  );
}
