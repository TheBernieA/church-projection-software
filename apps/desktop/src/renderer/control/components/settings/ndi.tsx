import { Cast, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type NdiFeed, type Settings } from '@lampstand/core';
import { Button, IconButton, Segmented, Switch, Typography } from '@lampstand/ui';
import { useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { CardField, EmptyState, Group, Notice, Row, SettingsPage, Tag } from './parts';

type Update = (patch: Partial<Settings>) => void;

const NDI_TOOLS = 'https://ndi.video/tools/';

/** One feed: its name on the network, what it shows, its size, sound, and who's watching. */
function FeedCard({
  feed,
  watching,
  running,
  onChange,
  onRemove,
}: {
  feed: NdiFeed;
  watching: number | undefined;
  running: boolean;
  onChange: (patch: Partial<NdiFeed>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={feed.name} className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <Switch
          label={t('ndi.enabledOf', { name: feed.name })}
          checked={feed.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
        <DeferredInput
          aria-label={t('ndi.name')}
          value={feed.name}
          maxLength={60}
          onCommit={(v) => v.trim() && onChange({ name: v.trim() })}
          className="field !h-8 min-w-0 flex-1"
        />
        {feed.enabled && running && (
          <Tag tone={watching ? 'ok' : 'neutral'}>
            {t('ndi.watching', { count: watching ?? 0 })}
          </Tag>
        )}
        <IconButton
          size="xs"
          variant="danger"
          aria-label={t('ndi.remove', { name: feed.name })}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <CardField label={t('ndi.content')} className="col-span-2">
          <Segmented<NdiFeed['content']>
            label={t('ndi.contentOf', { name: feed.name })}
            value={feed.content}
            onChange={(content) => onChange({ content })}
            options={(['program', 'words', 'stream'] as const).map((c) => ({
              value: c,
              label: t(`ndi.contents.${c}`),
            }))}
          />
          <Typography as="p" variant="caption" leading="snug">
            {t(`ndi.contentHelp.${feed.content}`)}
          </Typography>
        </CardField>
        <CardField label={t('ndi.size')}>
          <Segmented<string>
            label={t('ndi.sizeOf', { name: feed.name })}
            value={`${feed.height}p${feed.fps}`}
            onChange={(v) => {
              const [h, f] = v.split('p').map(Number);
              onChange({ height: h === 720 ? 720 : 1080, fps: f === 60 ? 60 : 30 });
            }}
            options={['720p30', '1080p30', '1080p60'].map((v) => ({ value: v, label: v }))}
          />
        </CardField>
        <CardField label={t('ndi.sound')}>
          <Switch
            label={t('ndi.soundOf', { name: feed.name })}
            checked={feed.sound}
            onChange={(sound) => onChange({ sound })}
          />
        </CardField>
      </div>
    </section>
  );
}

/**
 * Settings › NDI: Lampstand as sources on the network for vMix, OBS, a streaming computer or a
 * TV with an NDI receiver. Each feed shows the program, the words alone over transparency (to
 * key over cameras), or the stream picture. Needs the free NDI runtime (NDI Tools).
 */
export function NdiPage({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const status = useStore((x) => x.ndi);
  const feeds = s.ndi.feeds;
  const setFeeds = (next: NdiFeed[]): void => update({ ndi: { ...s.ndi, feeds: next } });
  const change = (id: string, patch: Partial<NdiFeed>): void =>
    setFeeds(feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const add = (content: NdiFeed['content']): void =>
    setFeeds([
      ...feeds,
      {
        id: newId(),
        name: `Lampstand (${t(`ndi.contents.${content}`)})`,
        content,
        height: 1080,
        fps: 30,
        sound: content !== 'words',
        enabled: true,
      },
    ]);
  const available = !!status?.available;
  const running = available && !!status.version && !status.error;
  return (
    <SettingsPage title={t('settings.pages.ndi')} description={t('settings.pagesHelp.ndi')}>
      {status && !available && (
        <Notice
          tone="warn"
          title={t('ndi.noRuntimeTitle')}
          action={
            <Button
              size="xs"
              variant="secondary"
              icon={<ExternalLink size={13} />}
              onClick={() => window.open(NDI_TOOLS)}
            >
              {t('ndi.getTools')}
            </Button>
          }
        >
          {status.error === 'loadFailed'
            ? t('ndi.loadFailed', { message: status.version ?? '' })
            : t('ndi.noRuntime')}
        </Notice>
      )}
      {running && (
        <Notice title={t('ndi.readyTitle')}>{t('ndi.ready', { version: status.version })}</Notice>
      )}
      <Group
        title={t('ndi.feeds')}
        description={t('ndi.feedsHelp')}
        action={
          <div className="flex gap-1">
            {(['program', 'words'] as const).map((c) => (
              <Button
                key={c}
                size="xs"
                variant="ghost"
                icon={<Plus size={13} />}
                disabled={feeds.length >= 4}
                onClick={() => add(c)}
              >
                {t(`ndi.contents.${c}`)}
              </Button>
            ))}
          </div>
        }
      >
        {feeds.length === 0 ? (
          <EmptyState icon={<Cast size={22} />}>{t('ndi.noFeeds')}</EmptyState>
        ) : (
          feeds.map((f) => (
            <FeedCard
              key={f.id}
              feed={f}
              running={running}
              watching={status?.connections[f.id]}
              onChange={(patch) => change(f.id, patch)}
              onRemove={() => setFeeds(feeds.filter((x) => x.id !== f.id))}
            />
          ))
        )}
      </Group>
      <Group title={t('ndi.howTitle')}>
        <Row label={t('ndi.howReceive')} description={t('ndi.howReceiveHelp')}>
          <span />
        </Row>
        <Row label={t('ndi.howKey')} description={t('ndi.howKeyHelp')}>
          <span />
        </Row>
      </Group>
      <Typography as="p" variant="caption" leading="relaxed">
        {t('ndi.trademark')}
      </Typography>
    </SettingsPage>
  );
}
