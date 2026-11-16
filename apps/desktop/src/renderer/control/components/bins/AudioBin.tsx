import { useEffect, useState, type CSSProperties } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Ellipsis,
  ListPlus,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  TrendingDown,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { audioPositionAt, formatClock, type MediaItem } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { audioCmd, neighbourTrack, playAudio, probeDuration } from '../../lib/audio';
import { q } from '../../lib/api';
import { useNow } from '../../lib/hooks';
import { knownDuration } from '../../lib/mediaDurations';
import {
  addToMediaPlaylist,
  createMediaPlaylist,
  deleteMediaPlaylist,
  removeFromMediaPlaylist,
} from '../../lib/mediaPlaylists';
import { attempt, toast, useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { Select } from '../Select';
import { SoonFeature } from '../Soon';
import i18n from '../../i18n';

const pct = (v: number, max: number): CSSProperties =>
  ({ '--pct': `${max > 0 ? Math.min(100, (v / max) * 100) : 0}%` }) as CSSProperties;

/** Import audio files into the library (and into the open audio playlist). */
async function importAudio(playlistId: string | null): Promise<void> {
  const r = await attempt(() => q('media.import', { asBackground: false }), 'errors.import');
  if (!r) return;
  if (r.imported) toast(i18n.t('media.imported', { count: r.imported }));
  if (playlistId && r.ids.length) await addToMediaPlaylist(playlistId, r.ids);
}

/** What's playing through the room, with its transport, fade out and volume. */
function NowPlaying() {
  const { t } = useTranslation();
  const a = useStore((s) => s.live?.audio ?? null);
  const name = useStore((s) => (a ? s.media.find((m) => m.id === a.mediaId)?.name : undefined));
  const lib = useStore((s) =>
    a ? s.media.find((m) => m.id === a.mediaId)?.durationSec : undefined,
  );
  const now = useNow(250, !!a?.playing);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!a) return;
    probeDuration(a.mediaId);
    const id = setTimeout(() => bump((n) => n + 1), 600); // re-read once the probe lands
    return () => clearTimeout(id);
  }, [a?.mediaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const duration = a ? knownDuration(a.mediaId, lib) : undefined;
  const pos = a ? Math.min(audioPositionAt(a, now), duration ?? Infinity) : 0;
  const idle = !a;
  return (
    <div
      role="group"
      aria-label={t('audio.nowPlaying')}
      className={`m-2.5 flex flex-col gap-1.5 rounded-[10px] bg-[var(--surface-0)] px-3 pb-2 pt-2.5 shadow-[inset_0_0_0_1px_var(--hairline),var(--highlight-top)] ${idle ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <Typography
          as="div"
          tone="white"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[radial-gradient(circle_at_30%_20%,#5b4bb7,#2a2350_60%,#15122b)]"
        >
          <Music size={16} />
        </Typography>
        <div className="min-w-0 flex-1">
          <Typography as="p" size={12} weight="medium" truncate tone={idle ? 'muted' : 'primary'}>
            {name ?? t('audio.nothing')}
          </Typography>
          <Typography as="p" size={11} tone="muted" truncate>
            {idle
              ? t('audio.nothingHint')
              : a.fade
                ? t('audio.fading')
                : a.playing
                  ? t('audio.playing')
                  : t('audio.paused')}
          </Typography>
        </div>
        <Volume2 size={14} className="shrink-0 text-[var(--text-3)]" />
        <input
          type="range"
          aria-label={t('audio.volume')}
          min={0}
          max={1}
          step={0.05}
          disabled={idle}
          value={a?.volume ?? 1}
          onChange={(e) => void audioCmd({ action: 'set', volume: Number(e.target.value) })}
          style={pct(a?.volume ?? 1, 1)}
          className="ls-range w-16 shrink-0"
        />
      </div>
      <div>
        <input
          type="range"
          aria-label={t('audio.position')}
          min={0}
          max={duration ?? 0}
          step={0.1}
          disabled={!duration}
          value={pos}
          onChange={(e) => void audioCmd({ action: 'seek', position: Number(e.target.value) })}
          style={pct(pos, duration ?? 0)}
          className="ls-range block w-full"
        />
        <div className="flex justify-between">
          <Typography size={10} tone="muted" tabular>
            {a ? formatClock(Math.floor(pos)) : '--:--'}
          </Typography>
          <Typography size={10} tone="muted" tabular>
            {a && duration ? `−${formatClock(Math.ceil(duration - pos))}` : '--:--'}
          </Typography>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <IconButton
          size="xs"
          variant="quiet"
          disabled={idle}
          aria-label={t('audio.loop')}
          aria-pressed={!!a?.loop}
          active={!!a?.loop}
          onClick={() => void audioCmd({ action: 'set', loop: !a?.loop })}
        >
          <Repeat size={14} />
        </IconButton>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            variant="quiet"
            disabled={idle}
            aria-label={t('audio.previous')}
            onClick={() => {
              const prev = neighbourTrack(-1);
              void (prev && pos < 3
                ? playAudio(prev, a?.playlistId ?? null)
                : audioCmd({ action: 'seek', position: 0 }));
            }}
          >
            <SkipBack size={16} fill="currentColor" />
          </IconButton>
          <Button
            variant="bare"
            disabled={idle}
            aria-label={a?.playing ? t('audio.pause') : t('audio.play')}
            title={a?.playing ? t('audio.pause') : t('audio.play')}
            onClick={() => void audioCmd({ action: 'toggle' })}
            className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--text-1)] text-[var(--surface-0)] shadow-[0_2px_10px_rgba(0,0,0,0.45)] hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {a?.playing ? (
              <Pause size={15} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />
            )}
          </Button>
          <IconButton
            size="sm"
            variant="quiet"
            disabled={idle || !neighbourTrack(1)}
            aria-label={t('audio.next')}
            onClick={() => {
              const next = neighbourTrack(1);
              if (next) void playAudio(next, a?.playlistId ?? null);
            }}
          >
            <SkipForward size={16} fill="currentColor" />
          </IconButton>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton
            size="xs"
            variant="quiet"
            disabled={idle || !!a.fade}
            aria-label={t('audio.fadeOut')}
            onClick={() => void audioCmd({ action: 'fadeOut', sec: 3 })}
          >
            <TrendingDown size={14} />
          </IconButton>
          <IconButton
            size="xs"
            variant="quiet"
            disabled={idle}
            aria-label={t('audio.stop')}
            onClick={() => void audioCmd({ action: 'stop' })}
          >
            <Square size={12} fill="currentColor" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/** One track: click plays it; its menu adds it to (or takes it out of) audio playlists. */
function TrackRow({ m, playlistId }: { m: MediaItem; playlistId: string | null }) {
  const { t } = useTranslation();
  const playing = useStore((s) => s.live?.audio?.mediaId === m.id);
  const playlists = useStore((s) => s.mediaPlaylists).filter((p) => p.kind === 'audio');
  const length = knownDuration(m.id, m.durationSec);
  useEffect(() => probeDuration(m.id), [m.id]);
  return (
    <li className="group relative">
      <Button
        variant="bare"
        aria-label={m.name}
        aria-current={playing || undefined}
        onClick={() => void playAudio(m.id, playlistId)}
        className={`flex h-8 w-full items-center gap-2 rounded-[5px] px-2 pr-8 text-left transition-colors ${
          playing ? 'bg-[var(--select)] text-white' : 'hover:bg-[var(--surface-2)]'
        }`}
      >
        <Music size={13} className={playing ? '' : 'text-[var(--text-3)]'} />
        <Typography size={12} truncate className="min-w-0 flex-1">
          {m.name}
        </Typography>
        <Typography size={11} tabular tone={playing ? 'inherit' : 'muted'}>
          {length ? formatClock(Math.round(length)) : ''}
        </Typography>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton
            size="3xs"
            variant="quiet"
            aria-label={t('audio.trackMenu', { name: m.name })}
            className={`absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 ${playing ? '!text-white' : ''}`}
          >
            <Ellipsis size={13} />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
            {playlists
              .filter((p) => p.id !== playlistId)
              .map((p) => (
                <DropdownMenu.Item
                  key={p.id}
                  className={ITEM_CLASS}
                  disabled={p.mediaIds.includes(m.id)}
                  onSelect={() => void addToMediaPlaylist(p.id, [m.id])}
                >
                  <ListPlus size={14} />
                  <Typography truncate className="flex-1">
                    {t('audio.addTo', { name: p.name })}
                  </Typography>
                </DropdownMenu.Item>
              ))}
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => void createMediaPlaylist([m.id], 'audio')}
            >
              <Plus size={14} />
              {t('audio.newWith')}
            </DropdownMenu.Item>
            {playlistId && (
              <>
                <DropdownMenu.Separator className={SEPARATOR_CLASS} />
                <DropdownMenu.Item
                  className={ITEM_CLASS}
                  onSelect={() => void removeFromMediaPlaylist(playlistId, m.id)}
                >
                  <X size={14} />
                  {t('audio.remove')}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}

/**
 * Audio bin (Show controls › Audio): walk-in music and sound cues. Play any track, or build
 * audio playlists that play straight through; fade out to finish. Sound comes out of the main
 * output (or this computer when no output is connected).
 */
export function AudioBin() {
  const { t } = useTranslation();
  const all = useStore((s) => s.media);
  const playlists = useStore((s) => s.mediaPlaylists).filter((p) => p.kind === 'audio');
  const selected = useStore((s) => s.audioPlaylistId);
  const playlist = playlists.find((p) => p.id === selected) ?? null;
  const audio = all.filter((m) => m.kind === 'audio');
  const byId = new Map(audio.map((m) => [m.id, m]));
  // A playlist plays in its own order; all audio is listed by name.
  const tracks = playlist
    ? playlist.mediaIds.flatMap((id) => byId.get(id) ?? [])
    : [...audio].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NowPlaying />
      <div className="flex items-center gap-1.5 px-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <Select<string>
            size="sm"
            aria-label={t('audio.source')}
            value={playlist?.id ?? 'all'}
            onChange={(v) => useStore.setState({ audioPlaylistId: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: t('audio.all') },
              ...playlists.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <IconButton
          size="sm"
          variant="quiet"
          aria-label={t('audio.newPlaylist')}
          onClick={() => void createMediaPlaylist([], 'audio')}
        >
          <Plus size={15} />
        </IconButton>
        {playlist && (
          <IconButton
            size="sm"
            variant="quiet"
            aria-label={t('audio.deletePlaylist', { name: playlist.name })}
            onClick={() => void deleteMediaPlaylist(playlist.id)}
          >
            <Trash2 size={14} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          variant="quiet"
          aria-label={t('audio.import')}
          onClick={() => void importAudio(playlist?.id ?? null)}
        >
          <Upload size={14} />
        </IconButton>
      </div>
      {tracks.length === 0 ? (
        <Typography as="p" variant="caption" leading="snug" className="px-4 py-3">
          {playlist ? t('audio.emptyPlaylist') : t('audio.empty')}
        </Typography>
      ) : (
        <ul aria-label={t('audio.tracks')} className="flex flex-col gap-px px-1.5 pb-2">
          {tracks.map((m) => (
            <TrackRow key={m.id} m={m} playlistId={playlist?.id ?? null} />
          ))}
        </ul>
      )}
      <div className="mt-auto px-2.5 pb-2.5">
        <SoonFeature id="audio-input" label={t('audio.inputs')} />
      </div>
    </div>
  );
}
