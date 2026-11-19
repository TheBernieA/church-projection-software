import { useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StreamDestinationSchema, type StreamDestination } from '@lampstand/core';
import { Button, Segmented, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { attempt, toast } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';

export const DESTINATION_KINDS = StreamDestinationSchema.shape.kind.options;

const KIND_COLOR: Record<StreamDestination['kind'], string> = {
  youtube: '#d43b30',
  facebook: '#2f6ad9',
  custom: '#555b6e',
  direct: '#1f8a70',
};

/** The small coloured label that says what kind of destination this is. */
export function KindBadge({ kind }: { kind: StreamDestination['kind'] }) {
  const { t } = useTranslation();
  return (
    <Typography
      size={10}
      weight="bold"
      caps
      tone="white"
      className="shrink-0 rounded-[3px] px-1.5 py-0.5"
      style={{ background: KIND_COLOR[kind] }}
    >
      {t(`streaming.kinds.${kind}`)}
    </Typography>
  );
}

type Protocol = 'udp' | 'srt';

/** A direct link's address in its parts (anything after "?" is kept as typed). */
export function parseDirect(url: string): {
  protocol: Protocol;
  host: string;
  port: string;
  query: string;
} {
  const [base = '', query = ''] = url.trim().split('?');
  const protocol: Protocol = /^srt:/i.test(base) ? 'srt' : 'udp';
  const rest = base.replace(/^[a-z]+:\/\//i, '');
  const at = rest.lastIndexOf(':');
  const hasPort = at > -1 && /^\d*$/.test(rest.slice(at + 1));
  return {
    protocol,
    host: hasPort ? rest.slice(0, at) : rest,
    port: hasPort ? rest.slice(at + 1) : '',
    query,
  };
}

const formatDirect = (p: ReturnType<typeof parseDirect>): string =>
  `${p.protocol}://${p.host}${p.port ? `:${p.port}` : ''}${p.query ? `?${p.query}` : ''}`;

/** A direct link: which kind, and the receiver's address and port. */
function DirectAddress({
  dest,
  srt,
  onChange,
}: {
  dest: StreamDestination;
  /** This computer's ffmpeg can send SRT (null: not known yet). */
  srt: boolean | null;
  onChange: (patch: Partial<StreamDestination>) => void;
}) {
  const { t } = useTranslation();
  const parts = parseDirect(dest.url);
  const set = (patch: Partial<typeof parts>): void =>
    onChange({ url: formatDirect({ ...parts, ...patch }) });
  return (
    <div className="flex flex-col gap-2">
      <Segmented<Protocol>
        label={t('streaming.direct.protocol')}
        value={parts.protocol}
        onChange={(protocol) => set({ protocol })}
        options={[
          { value: 'udp', label: t('streaming.direct.udp') },
          { value: 'srt', label: t('streaming.direct.srt') },
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
        <DeferredInput
          aria-label={t('streaming.direct.host')}
          placeholder="192.168.1.50"
          value={parts.host}
          maxLength={200}
          onCommit={(host) => set({ host: host.trim().replace(/^[a-z]+:\/\//i, '') })}
          className="field !h-8"
        />
        <DeferredInput
          aria-label={t('streaming.direct.port')}
          placeholder="9000"
          inputMode="numeric"
          value={parts.port}
          maxLength={5}
          onCommit={(port) => set({ port: port.replace(/\D/g, '') })}
          className="field !h-8"
        />
      </div>
      <Typography as="p" size={11} tone="muted" leading="snug">
        {t(`streaming.direct.help.${parts.protocol}`, { port: parts.port || '9000' })}
      </Typography>
      {parts.protocol === 'srt' && srt === false && (
        <Typography as="p" size={11} tone="inherit" leading="snug" className="text-[var(--accent)]">
          {t('streaming.direct.noSrt')}
        </Typography>
      )}
    </div>
  );
}

/** A stream key: pasted and saved (never shown back), replaced or forgotten. */
function KeyField({
  dest,
  hasKey,
  onKeySaved,
}: {
  dest: StreamDestination;
  hasKey: boolean;
  onKeySaved: () => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const save = async (value: string | null): Promise<void> => {
    const r = await attempt(
      () => cmd('stream.setKey', { destinationId: dest.id, key: value }),
      'errors.save',
    );
    if (r === undefined) return;
    setKey('');
    onKeySaved();
    toast(value ? t('streaming.keySaved', { name: dest.name }) : t('streaming.keyRemoved'));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound
            size={13}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
          />
          <input
            type="password"
            autoComplete="off"
            aria-label={t('streaming.keyOf', { name: dest.name })}
            placeholder={hasKey ? t('streaming.keyReplace') : t('streaming.keyPlaceholder')}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && key.trim() && void save(key)}
            className="field !h-8 w-full !pl-8"
          />
        </div>
        <Button size="xs" variant="primary" disabled={!key.trim()} onClick={() => void save(key)}>
          {t('streaming.saveKey')}
        </Button>
      </div>
      {hasKey ? (
        <div className="flex items-center gap-1.5">
          <Check size={12} aria-hidden className="shrink-0 text-[var(--tally-preview)]" />
          <Typography size={11} tone="muted" className="min-w-0 flex-1">
            {t('streaming.keyStored')}
          </Typography>
          <Button size="2xs" variant="ghost" onClick={() => void save(null)}>
            {t('streaming.forgetKey')}
          </Button>
        </div>
      ) : (
        <Typography as="p" size={11} tone="muted" leading="snug">
          {t(`streaming.keyHelp.${dest.kind}`)}
        </Typography>
      )}
    </div>
  );
}

/**
 * What a destination needs filled in, by kind: a stream key (YouTube, Facebook), a server
 * address and key (custom RTMP), or a receiver's address (a direct link).
 */
export function DestinationFields({
  dest,
  hasKey,
  srt,
  onChange,
  onKeySaved,
}: {
  dest: StreamDestination;
  hasKey: boolean;
  srt: boolean | null;
  onChange: (patch: Partial<StreamDestination>) => void;
  onKeySaved: () => void;
}) {
  const { t } = useTranslation();
  if (dest.kind === 'direct') return <DirectAddress dest={dest} srt={srt} onChange={onChange} />;
  return (
    <div className="flex flex-col gap-2">
      {dest.kind === 'custom' && (
        <DeferredInput
          aria-label={t('streaming.url')}
          placeholder="rtmp://…"
          value={dest.url}
          maxLength={500}
          onCommit={(url) => onChange({ url: url.trim() })}
          className="field !h-8 w-full"
        />
      )}
      <KeyField dest={dest} hasKey={hasKey} onKeySaved={onKeySaved} />
    </div>
  );
}
