import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Save, Settings2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  channelProcessing,
  deskProfiles,
  PRESET_SCOPES,
  type MixerChannel,
  type PresetScope,
  type Processing,
  type ProcessingPreset,
} from '@lampstand/core';
import type { DeskStatus } from '@lampstand/ipc-contract';
import { Button, Segmented, Typography } from '@lampstand/ui';
import { EMPTY_LIST } from '../../../constants';
import { q } from '../../../lib/api';
import { readDesk, sendToDesk, undoDeskSend, useDeskUndo } from '../../../lib/desk';
import { mixerCmd } from '../../../lib/mixer';
import { applyPreset, noteText, savePreset } from '../../../lib/presets';
import { openDialog, toast, useStore } from '../../../lib/store';
import { Select } from '../../Select';
import { ProcessingCurve } from './ProcessingCurve';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--surface-1)] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <Typography size={12} weight="semibold" tone="primary">
        {title}
      </Typography>
      {children}
    </section>
  );
}

/** The desk isn't set up yet: say where. */
function NotSetUp() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Typography size={14} weight="semibold" tone="primary">
        {t('desk.notSetUp')}
      </Typography>
      <Typography size={12} tone="muted" leading="snug" className="max-w-md">
        {t('desk.notSetUpHelp')}
      </Typography>
      <Button
        size="sm"
        variant="secondary"
        icon={<Settings2 size={14} />}
        onClick={() => openDialog('settings', { settingsPage: 'audio' })}
      >
        {t('desk.openSettings')}
      </Button>
    </div>
  );
}

/**
 * Desk (channel window): link this channel to a sound desk channel, read what the desk has on it
 * (apply it here, or keep it as a preset), and send this channel's processing, or a preset, to
 * the desk. Every send shows what will change first and can be undone.
 */
export function DeskView({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const desk = useStore((s) => s.settings?.desk ?? null);
  const custom = useStore((s) => s.settings?.deskProfiles);
  const presets = useStore(
    (s) => s.settings?.processingPresets ?? (EMPTY_LIST as ProcessingPreset[]),
  );
  const undo = useDeskUndo((s) => s);
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [names, setNames] = useState<(string | null)[]>([]);
  const [read, setRead] = useState<{ name: string | null; processing: Processing } | null>(null);
  const [scope, setScope] = useState<PresetScope>('all');
  const [presetId, setPresetId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const profile = deskProfiles(custom ?? []).find((p) => p.id === desk?.profile) ?? null;
  const ready = !!desk?.enabled && !!desk.host && !!profile;

  /** Ask the desk if it's there, and its channel names (shown in the link list). */
  const check = useCallback(
    (): Promise<void> =>
      q('desk.status')
        .then(async (st) => {
          setStatus(st);
          if (!st.answering) return;
          const list = await q('desk.channels');
          setNames(list.map((x) => x.name));
        })
        .catch(() => setStatus((st) => (st ? { ...st, answering: false } : st))),
    [],
  );
  useEffect(() => {
    if (!ready) return;
    void check();
  }, [ready, check, desk?.host, desk?.profile]);

  if (!ready) return <NotSetUp />;
  const ch = c.deskChannel;
  const run = async (job: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await job();
    } finally {
      setBusy(false);
    }
  };
  const options = [
    { value: '0', label: t('desk.notLinked') },
    ...Array.from({ length: profile.channels }, (_, i) => ({
      value: String(i + 1),
      label: names[i] ? `${i + 1} · ${names[i]}` : t('desk.channelN', { n: i + 1 }),
    })),
  ];
  const chosen = presets.find((p) => p.id === presetId) ?? presets[0] ?? null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-y-auto">
      <div className="flex min-w-0 flex-col gap-3">
        <Card title={t('desk.link')}>
          <div className="flex items-center gap-2">
            <span
              className={`size-2 shrink-0 rounded-full ${status?.answering ? 'bg-[var(--tally-preview)]' : status?.answering === false ? 'bg-[var(--tally-program)]' : 'bg-[var(--surface-4)]'}`}
            />
            <Typography size={11} tone="secondary" truncate className="min-w-0 flex-1">
              {status?.answering
                ? t('desk.answering', { desk: profile.name, host: desk.host })
                : status?.answering === false
                  ? t('desk.notAnswering', { host: desk.host })
                  : t('desk.checking')}
            </Typography>
            <Button
              size="2xs"
              variant="ghost"
              icon={<RefreshCw size={12} />}
              onClick={() => void check()}
            >
              {t('desk.check')}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Typography size={11} tone="secondary">
              {t('desk.linkedTo')}
            </Typography>
            <Select<string>
              size="sm"
              aria-label={t('desk.linkedTo')}
              value={String(ch ?? 0)}
              onChange={(v) =>
                void mixerCmd({
                  action: 'channel',
                  id: c.id,
                  patch: { deskChannel: v === '0' ? null : Number(v) },
                })
              }
              options={options}
            />
          </div>
          {undo && (
            <Button
              size="xs"
              variant="ghost"
              icon={<Undo2 size={12} />}
              onClick={() => void undoDeskSend()}
            >
              {t('desk.undo', { channel: undo.channel })}
            </Button>
          )}
        </Card>

        <Card title={t('desk.sendTitle')}>
          <Segmented<PresetScope>
            label={t('presets.scope')}
            value={scope}
            onChange={setScope}
            options={PRESET_SCOPES.map((s) => ({ value: s, label: t(`presets.scopes.${s}`) }))}
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowUpFromLine size={14} />}
            disabled={!ch || busy}
            onClick={() =>
              ch && void run(() => sendToDesk(ch, channelProcessing(c, scope), c.name))
            }
          >
            {ch ? t('desk.sendChannel', { channel: ch }) : t('desk.linkFirst')}
          </Button>
          {presets.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select<string>
                  size="sm"
                  aria-label={t('desk.presetToSend')}
                  value={chosen?.id ?? ''}
                  onChange={setPresetId}
                  options={presets.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!ch || !chosen || busy}
                onClick={() =>
                  ch && chosen && void run(() => sendToDesk(ch, chosen.processing, chosen.name))
                }
              >
                {t('desk.sendPreset')}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card title={t('desk.readTitle')}>
        <Button
          size="sm"
          variant="secondary"
          icon={<ArrowDownToLine size={14} />}
          disabled={!ch || busy}
          onClick={() =>
            ch &&
            void run(async () => {
              const r = await readDesk(ch);
              if (r) setRead(r);
            })
          }
        >
          {ch ? t('desk.read', { channel: ch }) : t('desk.linkFirst')}
        </Button>
        {read && (
          <div className="flex flex-col gap-2.5">
            <ProcessingCurve processing={read.processing} width={300} height={110} />
            <Typography size={11} tone="secondary">
              {t('desk.readSummary', {
                name: read.name ?? t('desk.channelN', { n: ch ?? 0 }),
                bands: read.processing.filters.length,
              })}
            </Typography>
            <div className="flex flex-wrap gap-2">
              <Button
                size="xs"
                variant="primary"
                disabled={c.locked}
                onClick={() =>
                  void applyPreset(c, read.processing).then(
                    (notes) =>
                      notes.length > 0 &&
                      toast(
                        `${t('presets.notApplied')} ${notes.map(noteText).join(' · ')}`,
                        'warning',
                      ),
                  )
                }
              >
                {t('desk.applyHere')}
              </Button>
              <Button
                size="xs"
                variant="secondary"
                icon={<Save size={12} />}
                onClick={() =>
                  void savePreset(
                    read.name ?? t('desk.channelN', { n: ch ?? 0 }),
                    read.processing.comp || read.processing.gate ? 'all' : 'eq',
                    read.processing,
                    `${profile.name} · ${t('desk.channelN', { n: ch ?? 0 })}`,
                  )
                }
              >
                {t('desk.saveAsPreset')}
              </Button>
            </div>
          </div>
        )}
        <Typography size={11} tone="muted" leading="snug">
          {profile.note ?? t('desk.profileFrom', { desk: profile.name })}
        </Typography>
      </Card>
    </div>
  );
}
