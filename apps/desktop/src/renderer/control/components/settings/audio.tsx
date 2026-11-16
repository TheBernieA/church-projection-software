import { useState } from 'react';
import { Mic, Plus, RefreshCw, RotateCcw, SlidersVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '@lampstand/core';
import { Button, Segmented, Slider, Switch, Typography } from '@lampstand/ui';
import { setPreviewOutput, useAudioPreview } from '../../lib/audioPreview';
import { rescanDevices, useInputDevices } from '../../lib/inputs';
import { LevelMeter } from '../bins/AudioInputs';
import { CameraAccess } from '../media/CameraAccess';
import { Select } from '../Select';
import { mixerCmd } from '../../lib/mixer';
import { closeDialog, useStore } from '../../lib/store';
import { Group, Row, SettingsPage, Tag } from './parts';

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
  const mixer = useStore((x) => x.live?.mixer ?? null);
  const onMixer = new Set(mixer?.channels.map((c) => c.deviceId) ?? []);
  // The fade slider saves once, when let go.
  const [fadeDraft, setFadeDraft] = useState<number | null>(null);
  const fade = fadeDraft ?? s.audio.fadeSec;
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const volume = volumeDraft ?? s.audio.startVolume ?? 0.8;
  const commitVolume = (): void => {
    if (volumeDraft !== null) update({ audio: { ...s.audio, startVolume: volumeDraft } });
    setVolumeDraft(null);
  };
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
      <Group title={t('mixer.title')} footnote={t('audioSettings.mixerHelp')}>
        <Row
          label={t('audioSettings.openMixer')}
          description={t('audioSettings.openMixerHelp', { count: mixer?.channels.length ?? 0 })}
        >
          <Button
            size="sm"
            variant="secondary"
            icon={<SlidersVertical size={14} />}
            onClick={() => {
              useStore.setState({ mixerOpen: true });
              closeDialog();
            }}
          >
            {t('audioSettings.openMixer')}
          </Button>
        </Row>
        {mixer && (
          <Row label={t('audioSettings.roomLimiter')} description={t('mixer.limiterHelp')}>
            <Switch
              label={t('audioSettings.roomLimiter')}
              checked={mixer.room.limiter}
              onChange={(limiter) =>
                void mixerCmd({ action: 'bus', bus: 'room', patch: { limiter } })
              }
            />
          </Row>
        )}
        <Row label={t('mixer.reset')} description={t('mixer.resetConfirm')}>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={14} />}
            onClick={() =>
              window.confirm(t('mixer.resetConfirm')) && void mixerCmd({ action: 'reset' })
            }
          >
            {t('settings.reset')}
          </Button>
        </Row>
      </Group>
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
      <Group title={t('audioSettings.tracks')}>
        <Row label={t('audioSettings.click')} description={t('audioSettings.clickHelp')}>
          <Segmented<'listen' | 'room'>
            label={t('audioSettings.click')}
            value={s.audio.click}
            onChange={(click) => update({ audio: { ...s.audio, click } })}
            options={[
              { value: 'listen', label: t('audioSettings.clickListen') },
              { value: 'room', label: t('audioSettings.clickRoom') },
            ]}
          />
        </Row>
        <Row
          label={t('audioSettings.startVolume')}
          description={t('audioSettings.startVolumeHelp')}
        >
          <div className="flex w-60 items-center gap-3">
            <Switch
              label={t('audioSettings.fixedVolume')}
              checked={s.audio.startVolume !== null}
              onChange={(on) => update({ audio: { ...s.audio, startVolume: on ? 0.8 : null } })}
            />
            {s.audio.startVolume === null ? (
              <Typography size={12} tone="muted">
                {t('audioSettings.keepLast')}
              </Typography>
            ) : (
              <Slider
                aria-label={t('audioSettings.startVolume')}
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolumeDraft(Number(e.currentTarget.value))}
                onPointerUp={commitVolume}
                onKeyUp={commitVolume}
                onBlur={commitVolume}
                className="flex-1"
              />
            )}
          </div>
        </Row>
        <Row label={t('audioSettings.afterTrack')} description={t('audioSettings.afterTrackHelp')}>
          <Segmented<'next' | 'stop'>
            label={t('audioSettings.afterTrack')}
            value={s.audio.afterTrack}
            onChange={(afterTrack) => update({ audio: { ...s.audio, afterTrack } })}
            options={[
              { value: 'next', label: t('audioSettings.afterNext') },
              { value: 'stop', label: t('audioSettings.afterStop') },
            ]}
          />
        </Row>
        <Row label={t('audioSettings.loop')} description={t('audioSettings.loopHelp')}>
          <Switch
            label={t('audioSettings.loop')}
            checked={s.audio.loopPlaylist}
            disabled={s.audio.afterTrack === 'stop'}
            onChange={(loopPlaylist) => update({ audio: { ...s.audio, loopPlaylist } })}
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
              {onMixer.has(d.deviceId) ? (
                <Tag tone="ok">{t('audioSettings.onMixer')}</Tag>
              ) : (
                <Button
                  size="2xs"
                  variant="subtle"
                  icon={<Plus size={12} />}
                  onClick={() =>
                    void mixerCmd({ action: 'add', deviceId: d.deviceId, name: d.label })
                  }
                >
                  {t('audioSettings.addToMixer')}
                </Button>
              )}
            </div>
          ))
        )}
      </Group>
    </SettingsPage>
  );
}
