import { useState } from 'react';
import { Film, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTimer, newId, timerSeconds, type LiveTimer, type TimerDef } from '@lampstand/core';
import { Button, Segmented } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { useNow, useSettingsList } from '../../lib/hooks';
import { attempt, useStore } from '../../lib/store';
import { AddCard, BIN_CARD, BinRow, CardTitle, FormActions } from '../cards';
import { SoonFeature } from '../Soon';

type Kind = TimerDef['kind'];

/** What a saved timer reads before it starts. */
function idleValue(def: TimerDef, now: number): number {
  const idle: LiveTimer = { ...def, running: false, startedAt: null, accumulatedSec: 0 };
  return timerSeconds(idle, now);
}

function TimerCard({
  def,
  run,
  now,
  send,
  onDelete,
}: {
  def: TimerDef;
  run: LiveTimer | undefined;
  now: number;
  send: (type: string, payload: unknown) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const secs = run ? timerSeconds(run, now) : idleValue(def, now);
  const over = secs < 0;
  return (
    <div
      role="group"
      aria-label={def.name}
      className={`${BIN_CARD} group w-[190px]`}
      style={run?.running ? { boxShadow: '0 0 0 1px var(--accent-line)' } : undefined}
    >
      <CardTitle
        name={def.name}
        badge={t(`timers.kind.${def.kind}`)}
        deleteLabel={t('timers.delete', { name: def.name })}
        onDelete={onDelete}
      />
      <div
        className={`tnum text-ui-26 font-bold leading-none ${over ? 'text-[var(--tally-program)]' : run?.running ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}
        data-testid={`timer-${def.id}`}
      >
        {formatTimer(secs, def.kind)}
      </div>
      <div className="flex gap-1">
        {run?.running ? (
          <Button
            size="xs"
            variant="secondary"
            icon={<Pause size={12} />}
            onClick={() => send('timer.stop', { id: def.id })}
          >
            {t('timers.stop')}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="primary"
            icon={<Play size={12} />}
            onClick={() => send('timer.start', { timer: def })}
          >
            {run ? t('timers.resume') : t('timers.start')}
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          icon={<RotateCcw size={12} />}
          disabled={!run}
          onClick={() => send('timer.reset', { id: def.id })}
        >
          {t('timers.reset')}
        </Button>
      </div>
    </div>
  );
}

function NewTimer({
  onCreate,
  onCancel,
}: {
  onCreate: (d: TimerDef) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('countdown');
  const [minutes, setMinutes] = useState('5');
  const [time, setTime] = useState('10:00');
  const mins = Number(minutes);
  const ready =
    kind === 'elapsed' ||
    (kind === 'countdown' && mins > 0 && mins <= 1440) ||
    (kind === 'to-time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  return (
    <form
      aria-label={t('timers.new')}
      className={`${BIN_CARD} w-[280px]`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const def: TimerDef = { id: newId(), name: name.trim() || t(`timers.kind.${kind}`), kind };
        if (kind === 'countdown') def.durationSec = Math.round(mins * 60);
        if (kind === 'to-time') def.targetTime = time;
        onCreate(def);
      }}
    >
      <input
        className="field !h-8"
        aria-label={t('timers.name')}
        placeholder={t('timers.name')}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Segmented<Kind>
        label={t('timers.kindLabel')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'countdown', label: t('timers.kind.countdown') },
          { value: 'to-time', label: t('timers.kind.to-time') },
          { value: 'elapsed', label: t('timers.kind.elapsed') },
        ]}
      />
      {kind === 'countdown' && (
        <label className="flex items-center gap-2 text-ui-12 text-[var(--text-2)]">
          <input
            className="field !h-8 !w-20"
            type="number"
            min={1}
            max={1440}
            aria-label={t('timers.minutes')}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          {t('timers.minutes')}
        </label>
      )}
      {kind === 'to-time' && (
        <input
          className="field !h-8"
          type="time"
          aria-label={t('timers.target')}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      )}
      <FormActions onCancel={onCancel} submitLabel={t('timers.create')} disabled={!ready} />
    </form>
  );
}

/** Timers bin: countdowns, count-to-time and elapsed timers; running ones show on stage. */
export function TimersBin() {
  const { t } = useTranslation();
  const [timers, save] = useSettingsList('timers');
  const runs = useStore((s) => s.live?.timers);
  const [adding, setAdding] = useState(false);
  // Tick while anything is counting: a running timer, or a count-to-time (it always moves).
  const now = useNow(
    500,
    !!runs?.some((r) => r.running) || timers.some((d) => d.kind === 'to-time'),
  );
  const send = (type: string, payload: unknown): void =>
    void attempt(() => cmd(type, payload), 'errors.action');
  return (
    <BinRow>
      {timers.map((d) => (
        <TimerCard
          key={d.id}
          def={d}
          run={runs?.find((r) => r.id === d.id)}
          now={now}
          send={send}
          onDelete={() => {
            send('timer.reset', { id: d.id });
            save(timers.filter((x) => x.id !== d.id));
          }}
        />
      ))}
      {adding ? (
        <NewTimer
          onCancel={() => setAdding(false)}
          onCreate={(d) => {
            save([...timers, d]);
            setAdding(false);
          }}
        />
      ) : (
        <AddCard
          label={t('timers.new')}
          onClick={() => setAdding(true)}
          className="h-[112px] w-[150px]"
        />
      )}
      <SoonFeature id="video-countdowns" icon={<Film size={14} />} className="self-center" />
      <p className="ml-auto max-w-[220px] self-end text-ui-11 leading-snug text-[var(--text-3)]">
        {t('timers.stageHint')}
      </p>
    </BinRow>
  );
}
