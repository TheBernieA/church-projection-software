import { useEffect, useState } from 'react';
import { Check, Download, Loader2, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, Switch, Typography } from '@lampstand/ui';
import { SPEECH_MODEL_IDS, type ListeningSettings, type Settings } from '@lampstand/core';
import { voiceCommandExamples } from '@lampstand/detection';
import type { SpeechModelStatus } from '@lampstand/ipc-contract';
import { q } from '../../lib/api';
import {
  forgetAssistantKey,
  refreshAssistant,
  saveAssistantKey,
  useAssistant,
} from '../../lib/assistant';
import { ask } from '../../lib/confirm';
import { useInputDevices } from '../../lib/inputs';
import { refreshModels, useListen, watchModels } from '../../lib/listen/listening';
import { attempt } from '../../lib/store';
import { Select } from '../Select';
import { SoonList } from '../Soon';
import { Group, Notice, Row, SettingsPage, Tag } from './parts';

type Update = (patch: Partial<Settings>) => void;

const fileSize = (bytes: number): string => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * Settings › Assistant: the online assistant (Claude, with the church's own key) and listening
 * (on this computer: the speech model, the input, voice commands). ADR 0008.
 */
export function AssistantPage({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const listening = s.listening;
  const setListening = (patch: Partial<ListeningSettings>): void =>
    update({ listening: { ...listening, ...patch } });
  useEffect(() => void refreshAssistant(), []);
  useEffect(() => watchModels(), []);
  useEffect(() => void refreshModels(), []);

  return (
    <SettingsPage
      title={t('settings.pages.assistant')}
      description={t('settings.pagesHelp.assistant')}
    >
      <Group title={t('assistant.planning')} description={t('assistant.planningHelp')}>
        <KeyRow />
        <Row label={t('assistant.sendTitles')} description={t('assistant.sendTitlesHelp')}>
          <Switch
            label={t('assistant.sendTitles')}
            checked={s.assistant.sendSongTitles}
            onChange={(sendSongTitles) => update({ assistant: { ...s.assistant, sendSongTitles } })}
          />
        </Row>
      </Group>
      <Notice title={t('assistant.privacyTitle')}>{t('assistant.privacy')}</Notice>

      <Group title={t('assistant.listening')} description={t('assistant.listeningHelp')}>
        <Row label={t('assistant.model')} description={t('assistant.modelHelp')} stack>
          <div className="space-y-2">
            {SPEECH_MODEL_IDS.map((id) => (
              <ModelRow
                key={id}
                id={id}
                chosen={listening.model === id}
                onChoose={() => setListening({ model: id })}
              />
            ))}
          </div>
        </Row>
        <InputRow
          value={listening.inputDeviceId}
          onChange={(inputDeviceId) => setListening({ inputDeviceId })}
        />
        <Row label={t('assistant.threshold')} description={t('assistant.thresholdHelp')}>
          <Segmented
            label={t('assistant.threshold')}
            value={String(listening.autoThreshold)}
            options={['0.8', '0.85', '0.9', '0.95'].map((v) => ({
              value: v,
              label: `${Math.round(Number(v) * 100)}%`,
            }))}
            onChange={(v) => setListening({ autoThreshold: Number(v) })}
          />
        </Row>
      </Group>

      <Group
        title={t('assistant.voice')}
        description={t('assistant.voiceHelp')}
        footnote={<VoiceExamples />}
      >
        <Row label={t('listen.voiceCommands')} description={t('assistant.voiceOnHelp')}>
          <Switch
            label={t('listen.voiceCommands')}
            checked={listening.voiceCommands}
            onChange={(voiceCommands) => setListening({ voiceCommands })}
          />
        </Row>
        <Row
          label={t('assistant.wakeWord')}
          description={t('assistant.wakeWordHelp')}
          htmlFor="wake-word"
        >
          <input
            id="wake-word"
            className="field w-44"
            value={listening.wakeWord}
            maxLength={40}
            placeholder={t('assistant.wakeWordNone')}
            onChange={(e) => setListening({ wakeWord: e.target.value })}
          />
        </Row>
      </Group>
      <Notice title={t('assistant.listenPrivacyTitle')}>{t('assistant.listenPrivacy')}</Notice>

      <Group title={t('assistant.next')} description={t('assistant.nextHelp')}>
        <SoonList
          ids={[
            'quoted-verses',
            'live-captions',
            'sermon-points',
            'sermon-notes',
            'lyric-follow',
            'song-suggestions',
            'operator-chat',
          ]}
        />
      </Group>
    </SettingsPage>
  );
}

/** The Anthropic key: saved or not (never shown), add/replace after a check, or forget. */
function KeyRow() {
  const { t } = useTranslation();
  const hasKey = useAssistant((s) => s.hasKey);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const save = async (): Promise<void> => {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveAssistantKey(key);
      setKey('');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const forget = async (): Promise<void> => {
    const ok = await ask({
      message: t('assistant.forgetConfirm'),
      confirm: t('assistant.forget'),
      tone: 'danger',
    });
    if (ok) await attempt(() => forgetAssistantKey());
  };

  return (
    <Row
      label={t('assistant.key')}
      description={t('assistant.keyHelp')}
      badge={hasKey ? <Tag tone="ok">{t('assistant.keySaved')}</Tag> : undefined}
      stack
    >
      {hasKey && !editing ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            {t('assistant.replaceKey')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void forget()}>
            {t('assistant.forget')}
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="field min-w-0 flex-1 font-mono"
              placeholder="sk-ant-…"
              aria-label={t('assistant.key')}
              value={key}
              maxLength={300}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!key.trim() || busy}
              icon={busy ? <Loader2 size={13} className="animate-spin" /> : undefined}
              onClick={() => void save()}
            >
              {busy ? t('assistant.checking') : t('assistant.saveKey')}
            </Button>
            {hasKey && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('song.cancel')}
              </Button>
            )}
          </div>
          {error && (
            <Typography as="p" role="alert" size={12} className="text-[var(--tally-program)]">
              {error}
            </Typography>
          )}
        </div>
      )}
    </Row>
  );
}

function ModelRow({
  id,
  chosen,
  onChoose,
}: {
  id: (typeof SPEECH_MODEL_IDS)[number];
  chosen: boolean;
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  const m: SpeechModelStatus | undefined = useListen((s) => s.models.find((x) => x.id === id));
  const state = m?.state ?? { kind: 'missing' as const };
  return (
    <div
      className={`flex items-center gap-3 rounded-[8px] px-3 py-2.5 ${chosen ? 'bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent)]' : 'bg-[var(--surface-1)] shadow-[0_0_0_1px_var(--hairline)]'}`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
        <input
          type="radio"
          name="speech-model"
          checked={chosen}
          onChange={onChoose}
          className="mt-1 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <Typography as="span" size={13} weight="medium" tone="primary" className="block">
            {t(`assistant.models.${id}.name`)}
          </Typography>
          <Typography as="span" size={11} tone="muted" className="block">
            {t(`assistant.models.${id}.help`)} · {fileSize(m?.bytes ?? 0)}
          </Typography>
        </span>
      </label>
      {state.kind === 'ready' ? (
        <span className="flex items-center gap-1.5">
          <Tag tone="ok">
            <Check size={10} className="mr-0.5 inline" />
            {t('assistant.modelReady')}
          </Tag>
          <IconRemove onClick={() => void attempt(() => q('speech.remove', { id }))} />
        </span>
      ) : state.kind === 'downloading' ? (
        <span className="flex items-center gap-2">
          <Typography size={11} tone="secondary" tabular>
            {Math.round((state.received / Math.max(1, state.total)) * 100)}%
          </Typography>
          <Button
            size="2xs"
            variant="quiet"
            icon={<X size={11} />}
            onClick={() => void attempt(() => q('speech.cancel', { id }))}
          >
            {t('assistant.cancel')}
          </Button>
        </span>
      ) : (
        <span className="flex flex-col items-end gap-1">
          <Button
            size="2xs"
            icon={<Download size={11} />}
            onClick={() => void attempt(() => q('speech.download', { id }))}
          >
            {t('assistant.download')}
          </Button>
          {state.kind === 'error' && (
            <Typography size={11} className="max-w-[28ch] text-right text-[var(--tally-program)]">
              {state.message}
            </Typography>
          )}
        </span>
      )}
    </div>
  );
}

function IconRemove({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button size="2xs" variant="quiet" icon={<Trash2 size={11} />} onClick={onClick}>
      {t('assistant.remove')}
    </Button>
  );
}

function InputRow({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const devices = useInputDevices('audioinput');
  const DEFAULT = 'default-input';
  return (
    <Row label={t('assistant.input')} description={t('assistant.inputHelp')} htmlFor="listen-input">
      <Select
        id="listen-input"
        value={value || DEFAULT}
        onChange={(v) => onChange(v === DEFAULT ? '' : v)}
        options={[
          { value: DEFAULT, label: t('assistant.defaultInput') },
          ...(devices ?? []).map((d) => ({ value: d.deviceId, label: d.label })),
        ]}
      />
    </Row>
  );
}

function VoiceExamples() {
  const { t } = useTranslation();
  const ex = voiceCommandExamples();
  const rows: [string, readonly string[] | undefined][] = [
    [t('assistant.voiceEx.next'), ex.next?.slice(0, 2)],
    [t('assistant.voiceEx.previous'), ex.previous?.slice(0, 2)],
    [
      t('assistant.voiceEx.items'),
      [...(ex.nextItem ?? []).slice(0, 1), ...(ex.previousItem ?? []).slice(0, 1)],
    ],
    [
      t('assistant.voiceEx.verses'),
      [...(ex.nextVerse ?? []).slice(0, 1), ...(ex.previousVerse ?? []).slice(0, 1)],
    ],
    [t('assistant.voiceEx.show'), ex.show],
    [t('assistant.voiceEx.version'), ex.version],
    [
      t('assistant.voiceEx.screen'),
      [
        ...(ex.clear ?? []).slice(0, 1),
        ...(ex.black ?? []).slice(0, 1),
        ...(ex.logo ?? []).slice(1, 2),
        ...(ex.restore ?? []).slice(0, 1),
      ],
    ],
  ];
  return (
    <span className="block">
      {t('assistant.voiceExamples')}
      <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([what, list]) => (
          <span key={what} className="contents">
            <Typography as="span" size={12} tone="secondary">
              {what}
            </Typography>
            <span>{(list ?? []).map((p) => `“${p}”`).join(', ')}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
