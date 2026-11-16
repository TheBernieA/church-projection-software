import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem } from '@lampstand/core';
import { Button, Segmented, Typography } from '@lampstand/ui';
import { useSelectedItem } from '../lib/hooks';
import { knownDuration } from '../lib/mediaDurations';
import { closeDialog, patchItem, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import { Field } from './form';

/** Seconds field: typed freely, saved on Enter or when leaving it (one undo step). */
function SecondsInput({
  id,
  unit,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  unit: string;
  /** null: not set (shows the placeholder). */
  value: number | null;
  placeholder?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    const v = draft === '' ? 0 : Number(draft);
    if (draft !== null && Number.isFinite(v) && v !== value) onCommit(Math.round(v * 10) / 10);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        min={0}
        step={0.5}
        value={draft ?? value ?? ''}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="field tnum !h-8 !w-28 text-right"
      />
      <Typography size={13} tone="muted">
        {unit}
      </Typography>
    </div>
  );
}

type MediaItem = Extract<ServiceItem, { kind: 'media' }>;
type Playback = NonNullable<MediaItem['playback']>;
type OnEnd = 'stop' | 'loop' | 'next';
type Autoplay = 'setting' | 'play' | 'wait';

/**
 * Playback options for a video cue in the playlist: trim (in and out points), fade in and out,
 * what happens at the end (stop, loop, go to the next item), and whether it plays as soon as it
 * goes live. Changes save with the playlist and apply the next time it goes live.
 */
export function PlaybackDialog() {
  const { t } = useTranslation();
  const id = useStore((s) => s.playbackItemId);
  const selected = useSelectedItem();
  const items = useStore((s) => s.service?.items);
  const item = (items?.find((i) => i.id === id) ?? selected) as ServiceItem | null | undefined;
  const name = useStore((s) =>
    item?.kind === 'media' ? s.media.find((m) => m.id === item.mediaId)?.name : undefined,
  );
  const libraryDuration = useStore((s) =>
    item?.kind === 'media' ? s.media.find((m) => m.id === item.mediaId)?.durationSec : undefined,
  );
  const duration =
    item?.kind === 'media' ? knownDuration(item.mediaId, libraryDuration) : undefined;
  if (item?.kind !== 'media') return null;
  const pb: Playback = item.playback ?? {};
  const set = (patch: { [K in keyof Playback]?: Playback[K] | undefined }): void =>
    patchItem<MediaItem>(item, (cur) => {
      const merged = { ...cur.playback, ...patch };
      // A zero fade, a 0 in-point or an out-point at the file's end are the same as none.
      const next: Playback = {};
      if (merged.start) next.start = merged.start;
      if (merged.end !== undefined && !(duration && merged.end >= duration)) next.end = merged.end;
      if (merged.fadeIn) next.fadeIn = merged.fadeIn;
      if (merged.fadeOut) next.fadeOut = merged.fadeOut;
      if (merged.autoplay !== undefined) next.autoplay = merged.autoplay;
      return { playback: Object.keys(next).length ? next : undefined };
    });
  const onEnd: OnEnd = item.loop ? 'loop' : item.autoAdvance ? 'next' : 'stop';
  const autoplay: Autoplay = pb.autoplay === undefined ? 'setting' : pb.autoplay ? 'play' : 'wait';
  const seconds = t('playback.seconds');

  return (
    <Dialog
      name="playback"
      title={t('playback.title', { name: name ?? t('service.kind.media') })}
      footer={
        <Button variant="primary" onClick={closeDialog}>
          {t('playback.done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section>
          <Typography as="h3" variant="overline" className="pb-2">
            {t('playback.trim')}
          </Typography>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('playback.start')} htmlFor="pb-start">
              <SecondsInput
                id="pb-start"
                unit={seconds}
                value={pb.start ?? 0}
                onCommit={(v) => set({ start: Math.max(0, v) })}
              />
            </Field>
            <Field label={t('playback.end')} htmlFor="pb-end">
              <SecondsInput
                id="pb-end"
                unit={seconds}
                value={pb.end ?? (duration ? Math.round(duration * 10) / 10 : null)}
                placeholder={t('playback.endOfClip')}
                onCommit={(v) => set({ end: v > 0 ? v : undefined })}
              />
            </Field>
          </div>
          <Typography as="p" variant="caption" leading="snug" className="pt-1.5">
            {duration
              ? t('playback.trimHelp', { length: Math.round(duration * 10) / 10 })
              : t('playback.trimHelpUnknown')}
          </Typography>
        </section>

        <section>
          <Typography as="h3" variant="overline" className="pb-2">
            {t('playback.fades')}
          </Typography>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('playback.fadeIn')} htmlFor="pb-fade-in">
              <SecondsInput
                id="pb-fade-in"
                unit={seconds}
                value={pb.fadeIn ?? 0}
                onCommit={(v) => set({ fadeIn: Math.min(30, Math.max(0, v)) })}
              />
            </Field>
            <Field label={t('playback.fadeOut')} htmlFor="pb-fade-out">
              <SecondsInput
                id="pb-fade-out"
                unit={seconds}
                value={pb.fadeOut ?? 0}
                onCommit={(v) => set({ fadeOut: Math.min(30, Math.max(0, v)) })}
              />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Field label={t('playback.atEnd')} group>
            <Segmented<OnEnd>
              label={t('playback.atEnd')}
              value={onEnd}
              onChange={(v) =>
                patchItem<MediaItem>(item, { loop: v === 'loop', autoAdvance: v === 'next' })
              }
              options={[
                { value: 'stop', label: t('playback.stop') },
                { value: 'loop', label: t('playback.loop') },
                { value: 'next', label: t('playback.next') },
              ]}
            />
          </Field>
          <Field label={t('playback.whenLive')} group>
            <Segmented<Autoplay>
              label={t('playback.whenLive')}
              value={autoplay}
              onChange={(v) => set({ autoplay: v === 'setting' ? undefined : v === 'play' })}
              options={[
                { value: 'setting', label: t('playback.useSetting') },
                { value: 'play', label: t('settings.autoplayPlay') },
                { value: 'wait', label: t('settings.autoplayWait') },
              ]}
            />
          </Field>
        </section>
      </div>
    </Dialog>
  );
}
