import { useEffect, useState } from 'react';
import { Plus, Radio, Send, SlidersVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DESK_EVENTS,
  describeSource,
  newId,
  SURFACE_ACTIONS,
  type DeskCue,
  type DeskMessage,
  type MixerChannel,
  type OscArg,
  type Settings,
  type SurfaceBinding,
  type SurfaceSource,
  type SurfacesSettings,
  type SurfaceTarget,
} from '@lampstand/core';
import type { OscStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Segmented, Switch, Typography } from '@lampstand/ui';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { EMPTY_LIST } from '../../constants';
import { learnControl, sendDeskMessage, useSurfacePorts } from '../../lib/surfaces';
import { DeferredInput } from '../DeferredControls';
import { Select } from '../Select';
import { EmptyState, Group, Notice, Row, SettingsPage, Tag, UnitInput } from './parts';

type Update = (patch: Partial<Settings>) => void;

// ---------- What a control does: one string per choice, for the dropdown ----------

const targetKey = (t: SurfaceTarget): string => {
  switch (t.kind) {
    case 'action':
      return `action:${t.action}`;
    case 'camera':
      return `camera:${t.n}:${t.take ? 'take' : 'preview'}`;
    case 'fader':
    case 'mute':
      return `${t.kind}:${t.bus}${t.bus === 'channel' ? `:${t.channelId ?? ''}` : ''}`;
    case 'tbar':
      return 'tbar';
  }
};

function targetFromKey(key: string): SurfaceTarget | null {
  const [kind, a, b] = key.split(':');
  if (kind === 'tbar') return { kind: 'tbar' };
  if (kind === 'action') {
    const action = SURFACE_ACTIONS.find((x) => x === a);
    return action ? { kind: 'action', action } : null;
  }
  if (kind === 'camera') return { kind: 'camera', n: Number(a), take: b === 'take' };
  if (kind === 'fader' || kind === 'mute') {
    if (a === 'room' || a === 'stream') return { kind, bus: a };
    if (a === 'channel' && b) return { kind, bus: 'channel', channelId: b };
  }
  return null;
}

function useTargetOptions(): { value: string; label: string }[] {
  const { t } = useTranslation();
  const channels = useStore((s) => s.live?.mixer.channels ?? (EMPTY_LIST as MixerChannel[]));
  const mixerTargets = (kind: 'fader' | 'mute') => [
    ...channels.map((c) => ({
      value: `${kind}:channel:${c.id}`,
      label: t(`surfaces.target.${kind}`, { name: c.name }),
    })),
    {
      value: `${kind}:room`,
      label: t(`surfaces.target.${kind}`, { name: t('surfaces.roomMaster') }),
    },
    {
      value: `${kind}:stream`,
      label: t(`surfaces.target.${kind}`, { name: t('surfaces.streamMaster') }),
    },
  ];
  return [
    ...SURFACE_ACTIONS.map((a) => ({ value: `action:${a}`, label: t(`shortcuts.action.${a}`) })),
    ...mixerTargets('fader'),
    ...mixerTargets('mute'),
    { value: 'tbar', label: t('surfaces.target.tbar') },
    ...Array.from({ length: 9 }, (_, i) => [
      { value: `camera:${i + 1}:preview`, label: t('surfaces.target.preview', { n: i + 1 }) },
      { value: `camera:${i + 1}:take`, label: t('surfaces.target.take', { n: i + 1 }) },
    ]).flat(),
  ];
}

// ---------- One control (a binding) ----------

/** "Learn": the next control touched on the desk is this one. */
function useLearn(onLearned: (s: SurfaceSource) => void): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    return learnControl((s) => {
      setOn(false);
      onLearned(s);
    });
  }, [on, onLearned]);
  return [on, () => setOn((x) => !x)];
}

function LearnButton({
  label,
  learning,
  onClick,
}: {
  label: string;
  learning: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="xs"
      variant={learning ? 'primary' : 'secondary'}
      aria-pressed={learning}
      aria-label={label}
      icon={<Radio size={13} className={learning ? 'animate-pulse' : ''} />}
      onClick={onClick}
      className="shrink-0"
    >
      {learning ? t('surfaces.listening') : t('surfaces.learn')}
    </Button>
  );
}

function BindingRow({
  binding,
  options,
  onChange,
  onRemove,
}: {
  binding: SurfaceBinding;
  options: { value: string; label: string }[];
  onChange: (b: SurfaceBinding) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const key = targetKey(binding.target);
  const label = options.find((o) => o.value === key)?.label ?? key;
  const [learning, toggle] = useLearn((source) => onChange({ ...binding, source }));
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Select<string>
          size="sm"
          aria-label={t('surfaces.does', { name: label })}
          value={key}
          onChange={(v) => {
            const target = targetFromKey(v);
            if (target) onChange({ ...binding, target });
          }}
          options={
            options.some((o) => o.value === key) ? options : [{ value: key, label }, ...options]
          }
        />
      </div>
      <Typography
        size={12}
        tone="secondary"
        tabular
        truncate
        className="w-44 shrink-0"
        title={
          binding.source.kind === 'midi' && binding.source.device
            ? binding.source.device
            : undefined
        }
      >
        {describeSource(binding.source)}
      </Typography>
      <LearnButton
        label={t('surfaces.relearn', { name: label })}
        learning={learning}
        onClick={toggle}
      />
      <IconButton
        size="xs"
        variant="danger"
        aria-label={t('surfaces.remove', { name: label })}
        onClick={onRemove}
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

/** A new control: choose what it does, then touch it on the desk. */
function NewBinding({
  options,
  onAdd,
}: {
  options: { value: string; label: string }[];
  onAdd: (b: SurfaceBinding) => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState(options[0]?.value ?? 'action:next');
  const [learning, toggle] = useLearn((source) => {
    const target = targetFromKey(key);
    if (target) onAdd({ id: newId(), source, target });
  });
  return (
    <div className="flex items-center gap-3 bg-[var(--surface-1)]/50 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Select<string>
          size="sm"
          aria-label={t('surfaces.newDoes')}
          value={key}
          onChange={setKey}
          options={options}
        />
      </div>
      <Typography size={12} tone="muted" className="w-44 shrink-0">
        {learning ? t('surfaces.touchIt') : t('surfaces.thenLearn')}
      </Typography>
      <LearnButton label={t('surfaces.learnNew')} learning={learning} onClick={toggle} />
      <span className="w-6 shrink-0" />
    </div>
  );
}

// ---------- One cue to the desk ----------

const OSC_ARG_TYPES = ['none', 'i', 'f', 's'] as const;

function argFrom(type: OscArg['type'], raw: string): OscArg {
  if (type === 'none') return { type };
  if (type === 's') return { type, value: raw.slice(0, 200) };
  const n = Number(raw);
  if (type === 'i') return { type, value: Number.isFinite(n) ? Math.round(n) : 0 };
  return { type, value: Number.isFinite(n) ? n : 0 };
}

function CueRow({
  cue,
  outputs,
  oscReady,
  onChange,
  onRemove,
}: {
  cue: DeskCue;
  outputs: string[];
  oscReady: boolean;
  onChange: (c: DeskCue) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const m = cue.send;
  const setSend = (send: DeskMessage): void => onChange({ ...cue, send });
  const when = t(`surfaces.events.${cue.when}`);
  return (
    <section aria-label={when} className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Typography size={12} tone="secondary" className="shrink-0">
          {t('surfaces.when')}
        </Typography>
        <div className="min-w-0 flex-1">
          <Select<DeskCue['when']>
            size="sm"
            aria-label={t('surfaces.whenLabel')}
            value={cue.when}
            onChange={(v) => onChange({ ...cue, when: v })}
            options={DESK_EVENTS.map((e) => ({ value: e, label: t(`surfaces.events.${e}`) }))}
          />
        </div>
        <Segmented<'midi' | 'osc'>
          label={t('surfaces.sendAs', { name: when })}
          value={m.kind}
          onChange={(kind) =>
            setSend(
              kind === 'midi'
                ? { kind, device: '', type: 'cc', channel: 1, number: 0, value: 127 }
                : { kind, address: '/', arg: { type: 'none' } },
            )
          }
          options={[
            { value: 'midi', label: 'MIDI' },
            { value: 'osc', label: 'OSC' },
          ]}
        />
        <Button
          size="xs"
          variant="ghost"
          icon={<Send size={13} />}
          aria-label={t('surfaces.test', { name: when })}
          onClick={() => sendDeskMessage(m)}
        >
          {t('surfaces.testShort')}
        </Button>
        <IconButton
          size="xs"
          variant="danger"
          aria-label={t('surfaces.removeCue', { name: when })}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      {m.kind === 'midi' ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-48">
            <Select<string>
              size="sm"
              aria-label={t('surfaces.port')}
              value={m.device}
              onChange={(device) => setSend({ ...m, device })}
              options={[
                { value: '', label: t('surfaces.everyPort') },
                ...[...new Set([...outputs, ...(m.device ? [m.device] : [])])].map((o) => ({
                  value: o,
                  label: o,
                })),
              ]}
            />
          </div>
          <Segmented<'cc' | 'note' | 'pc'>
            label={t('surfaces.messageType')}
            value={m.type}
            onChange={(type) => setSend({ ...m, type })}
            options={[
              { value: 'cc', label: 'CC' },
              { value: 'note', label: t('surfaces.note') },
              { value: 'pc', label: t('surfaces.program') },
            ]}
          />
          <UnitInput
            id={`cue-ch-${cue.id}`}
            value={String(m.channel)}
            unit={t('surfaces.channelUnit')}
            min={1}
            max={16}
            onCommit={(v) => setSend({ ...m, channel: Math.min(16, Math.max(1, Number(v) || 1)) })}
          />
          <UnitInput
            id={`cue-n-${cue.id}`}
            value={String(m.number)}
            unit={
              m.type === 'note'
                ? t('surfaces.noteUnit')
                : m.type === 'pc'
                  ? t('surfaces.programUnit')
                  : t('surfaces.ccUnit')
            }
            min={0}
            max={127}
            onCommit={(v) => setSend({ ...m, number: Math.min(127, Math.max(0, Number(v) || 0)) })}
          />
          {m.type !== 'pc' && (
            <UnitInput
              id={`cue-v-${cue.id}`}
              value={String(m.value)}
              unit={t('surfaces.valueUnit')}
              min={0}
              max={127}
              onCommit={(v) => setSend({ ...m, value: Math.min(127, Math.max(0, Number(v) || 0)) })}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <DeferredInput
            aria-label={t('surfaces.oscAddress')}
            value={m.address}
            maxLength={200}
            placeholder="/ch/01/mix/on"
            onCommit={(v) => {
              const address = v.trim();
              if (address.startsWith('/')) setSend({ ...m, address });
            }}
            className="field !h-8 min-w-0 flex-1 font-mono"
          />
          <Segmented<OscArg['type']>
            label={t('surfaces.argType')}
            value={m.arg.type}
            onChange={(type) => setSend({ ...m, arg: argFrom(type, '0') })}
            options={OSC_ARG_TYPES.map((x) => ({ value: x, label: t(`surfaces.args.${x}`) }))}
          />
          {m.arg.type !== 'none' && (
            <DeferredInput
              aria-label={t('surfaces.argValue')}
              value={String(m.arg.value)}
              maxLength={200}
              onCommit={(v) => setSend({ ...m, arg: argFrom(m.arg.type, v) })}
              className="field !h-8 w-24"
            />
          )}
          {!oscReady && (
            <Typography size={11} tone="muted" className="basis-full">
              {t('surfaces.oscNoAddress')}
            </Typography>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- The page ----------

/** The last control that moved, as a little live light. */
function Activity() {
  const { t } = useTranslation();
  const { last } = useSurfacePorts();
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  const fresh = !!last && now - last.at < 600;
  return (
    <span className="flex min-w-0 items-center gap-2" aria-live="off">
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full transition-colors ${fresh ? 'bg-[var(--tally-preview)]' : 'bg-[var(--surface-3)]'}`}
      />
      <Typography size={12} tone="secondary" tabular truncate>
        {last
          ? t('surfaces.lastMoved', {
              control: describeSource(last.source),
              value: Math.round(last.value * 100),
            })
          : t('surfaces.nothingYet')}
      </Typography>
    </span>
  );
}

/**
 * Settings › Control surfaces: a sound desk, MIDI controller or OSC app runs the show (slides,
 * cameras, the T-bar, the mixer's faders and mutes), with motor faders and button lights kept
 * in step; and cues go back to the desk when things happen (a video starts: mute the pulpit).
 */
export function SurfacesPage({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const ports = useSurfacePorts();
  const options = useTargetOptions();
  const [osc, setOsc] = useState<OscStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void api.oscStatus().then((x) => alive && setOsc(x));
    const off = api.onOscStatus(setOsc);
    return () => {
      alive = false;
      off();
    };
  }, []);
  const sf = s.surfaces;
  const set = (patch: Partial<SurfacesSettings>): void => update({ surfaces: { ...sf, ...patch } });
  const setOscSettings = (patch: Partial<SurfacesSettings['osc']>): void =>
    set({ osc: { ...sf.osc, ...patch } });
  const bindings = sf.bindings;
  const cues = sf.cues;

  return (
    <SettingsPage
      title={t('settings.pages.surfaces')}
      description={t('settings.pagesHelp.surfaces')}
    >
      <Group title={t('surfaces.connections')}>
        <Row
          label={t('surfaces.midi')}
          description={
            ports.midi === 'unavailable'
              ? t('surfaces.midiUnavailable')
              : ports.inputs.length
                ? ports.inputs.join(' · ')
                : t('surfaces.midiNone')
          }
          badge={
            sf.midi && ports.midi === 'ready' ? (
              <Tag tone={ports.inputs.length ? 'ok' : 'neutral'}>
                {t('surfaces.ports', { count: ports.inputs.length })}
              </Tag>
            ) : undefined
          }
        >
          <Switch label={t('surfaces.midi')} checked={sf.midi} onChange={(midi) => set({ midi })} />
        </Row>
        <Row
          label={t('surfaces.osc')}
          description={t('surfaces.oscHelp')}
          badge={
            sf.osc.enabled && osc ? (
              <Tag tone={osc.listening ? 'ok' : 'neutral'}>
                {osc.listening ? t('surfaces.oscListening') : t('surfaces.oscOff')}
              </Tag>
            ) : undefined
          }
        >
          <div className="flex items-center gap-3">
            <UnitInput
              id="osc-port"
              value={String(sf.osc.port)}
              unit={t('surfaces.portUnit')}
              min={1024}
              max={65535}
              onCommit={(v) => {
                const port = Math.round(Number(v));
                if (port >= 1024 && port <= 65535) setOscSettings({ port });
              }}
            />
            <Switch
              label={t('surfaces.osc')}
              checked={sf.osc.enabled}
              onChange={(enabled) => setOscSettings({ enabled })}
            />
          </div>
        </Row>
        {sf.osc.enabled && osc?.error && (
          <div className="px-4 py-3">
            <Notice tone="error">{t('surfaces.oscFailed', { port: sf.osc.port })}</Notice>
          </div>
        )}
        {sf.osc.enabled && osc?.listening && (
          <div className="px-4 py-3">
            <Typography as="p" size={12} tone="secondary" leading="snug">
              {t('surfaces.oscSendHere', {
                addresses: osc.addresses.join(', ') || '127.0.0.1',
                port: osc.port,
              })}
            </Typography>
          </div>
        )}
        <Row label={t('surfaces.deskAddress')} description={t('surfaces.deskAddressHelp')}>
          <div className="flex items-center gap-2">
            <DeferredInput
              aria-label={t('surfaces.deskHost')}
              value={sf.osc.sendHost}
              maxLength={200}
              placeholder="192.168.1.50"
              onCommit={(v) => setOscSettings({ sendHost: v.trim() })}
              className="field !h-8 w-36"
            />
            <UnitInput
              id="osc-send-port"
              value={String(sf.osc.sendPort)}
              unit={t('surfaces.portUnit')}
              min={1}
              max={65535}
              onCommit={(v) => {
                const sendPort = Math.round(Number(v));
                if (sendPort >= 1 && sendPort <= 65535) setOscSettings({ sendPort });
              }}
            />
          </div>
        </Row>
        <Row label={t('surfaces.feedback')} description={t('surfaces.feedbackHelp')}>
          <Switch
            label={t('surfaces.feedback')}
            checked={sf.feedback}
            onChange={(feedback) => set({ feedback })}
          />
        </Row>
        <Row label={t('surfaces.activity')} description={t('surfaces.activityHelp')}>
          <Activity />
        </Row>
      </Group>

      <Group title={t('surfaces.controls')} description={t('surfaces.controlsHelp')}>
        {bindings.length === 0 && (
          <EmptyState icon={<SlidersVertical size={22} />}>{t('surfaces.noControls')}</EmptyState>
        )}
        {bindings.map((b) => (
          <BindingRow
            key={b.id}
            binding={b}
            options={options}
            onChange={(next) => set({ bindings: bindings.map((x) => (x.id === b.id ? next : x)) })}
            onRemove={() => set({ bindings: bindings.filter((x) => x.id !== b.id) })}
          />
        ))}
        <NewBinding options={options} onAdd={(b) => set({ bindings: [...bindings, b] })} />
      </Group>

      <Group
        title={t('surfaces.cues')}
        description={t('surfaces.cuesHelp')}
        action={
          <Button
            size="xs"
            variant="secondary"
            icon={<Plus size={13} />}
            onClick={() =>
              set({
                cues: [
                  ...cues,
                  {
                    id: newId(),
                    when: 'videoPlay',
                    send: {
                      kind: 'midi',
                      device: '',
                      type: 'cc',
                      channel: 1,
                      number: 0,
                      value: 127,
                    },
                  },
                ],
              })
            }
          >
            {t('surfaces.addCue')}
          </Button>
        }
      >
        {cues.length === 0 && (
          <EmptyState icon={<Send size={22} />}>{t('surfaces.noCues')}</EmptyState>
        )}
        {cues.map((c) => (
          <CueRow
            key={c.id}
            cue={c}
            outputs={ports.outputs}
            oscReady={!!sf.osc.sendHost}
            onChange={(next) => set({ cues: cues.map((x) => (x.id === c.id ? next : x)) })}
            onRemove={() => set({ cues: cues.filter((x) => x.id !== c.id) })}
          />
        ))}
      </Group>
    </SettingsPage>
  );
}
