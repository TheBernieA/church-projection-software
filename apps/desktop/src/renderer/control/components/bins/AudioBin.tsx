import { useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Ellipsis,
  Headphones,
  ListPlus,
  Music,
  Pause,
  Play,
  Plus,
  Radio,
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
import { Button, IconButton, Slider, Typography } from '@lampstand/ui';
import { audioCmd, neighbourTrack, playAudio, probeDuration } from '../../lib/audio';

import { useNow } from '../../lib/hooks';
import {
  previewTrack,
  seekPreview,
  setPreviewOutput,
  stopPreview,
  togglePreview,
  useAudioPreview,
} from '../../lib/audioPreview';
import { useInputDevices } from '../../lib/inputs';
import { useDraft } from '../../lib/slider';
import { useKnownDuration } from '../../lib/mediaDurations';
import {
  addToMediaPlaylist,
  createMediaPlaylist,
  deleteMediaPlaylist,
  importMedia,
  removeFromMediaPlaylist,
  usePlaylists,
} from '../../lib/mediaPlaylists';
import { useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { Select } from '../Select';
import { AudioInputs } from './AudioInputs';

/** What's playing through the room, with its transport, fade out and volume. */
function NowPlaying() {
  const { t } = useTranslation();
  const fadeSec = useStore((s) => s.settings?.audio.fadeSec ?? 3);
  const a = useStore((s) => s.live?.audio ?? null);
  const name = useStore((s) => (a ? s.media.find((m) => m.id === a.mediaId)?.name : undefined));
  const lib = useStore((s) =>
    a ? s.media.find((m) => m.id === a.mediaId)?.durationSec : undefined,
  );
  const now = useNow(250, !!a?.playing);
  useEffect(() => {
    if (a) probeDuration(a.mediaId);
  }, [a?.mediaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const duration = useKnownDuration(a?.mediaId, lib);
  const playhead = a ? Math.min(audioPositionAt(a, now), duration ?? Infinity) : 0;
  // Drags stay local and send one command on release (not one per pixel).
  const seek = useDraft(a?.syncedAt, (position) => void audioCmd({ action: 'seek', position }));
  const volume = useDraft(a?.volume, (v) => void audioCmd({ action: 'set', volume: v }));
  const pos = seek.draft ?? playhead;
  const vol = volume.draft ?? a?.volume ?? 1;
  // Nothing in the room: one quiet line, so the track list gets the height.
  if (!a)
    return (
      <div
        role="group"
        aria-label={t('audio.nowPlaying')}
        className="m-2.5 flex items-center gap-2 rounded-[8px] bg-[var(--surface-0)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--hairline)]"
      >
        <Music size={13} className="shrink-0 text-[var(--text-3)]" />
        <Typography size={12} tone="muted" truncate>
          {t('audio.nothing')} · {t('audio.nothingHint')}
        </Typography>
      </div>
    );
  return (
    <div
      role="group"
      aria-label={t('audio.nowPlaying')}
      className={`m-2.5 flex flex-col gap-1.5 rounded-[10px] bg-[var(--surface-0)] px-3 pb-2 pt-2.5 shadow-[inset_0_0_0_1px_var(--hairline),var(--highlight-top)]`}
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
          <Typography as="p" size={12} weight="medium" truncate tone="primary">
            {name}
          </Typography>
          <Typography as="p" size={11} tone="muted" truncate>
            {a.fade ? t('audio.fading') : a.playing ? t('audio.playing') : t('audio.paused')}
          </Typography>
        </div>
        <Volume2 size={14} className="shrink-0 text-[var(--text-3)]" />
        <Slider
          aria-label={t('audio.volume')}
          min={0}
          max={1}
          step={0.05}
          value={vol}
          {...volume.props}
          className="w-[88px] shrink-0"
        />
      </div>
      <div>
        <Slider
          format={null}
          aria-label={t('audio.position')}
          min={0}
          max={duration ?? 0}
          step={0.1}
          disabled={!duration}
          value={pos}
          {...seek.props}
          className="w-full"
        />
        <div className="flex justify-between">
          <Typography size={10} tone="muted" tabular>
            {formatClock(Math.floor(pos))}
          </Typography>
          <Typography size={10} tone="muted" tabular>
            {duration ? `−${formatClock(Math.ceil(duration - pos))}` : '--:--'}
          </Typography>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <IconButton
          size="xs"
          variant="quiet"
          aria-label={t('audio.loop')}
          aria-pressed={a.loop}
          active={a.loop}
          onClick={() => void audioCmd({ action: 'set', loop: !a.loop })}
        >
          <Repeat size={14} />
        </IconButton>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            variant="quiet"
            aria-label={t('audio.previous')}
            onClick={() => {
              const prev = neighbourTrack(-1);
              void (prev && pos < 3
                ? playAudio(prev, a.playlistId ?? null)
                : audioCmd({ action: 'seek', position: 0 }));
            }}
          >
            <SkipBack size={16} fill="currentColor" />
          </IconButton>
          <Button
            variant="bare"
            aria-label={a.playing ? t('audio.pause') : t('audio.play')}
            title={a.playing ? t('audio.pause') : t('audio.play')}
            onClick={() => void audioCmd({ action: 'toggle' })}
            className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--text-1)] text-[var(--surface-0)] shadow-[0_2px_10px_rgba(0,0,0,0.45)] hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {a.playing ? (
              <Pause size={15} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />
            )}
          </Button>
          <IconButton
            size="sm"
            variant="quiet"
            disabled={!neighbourTrack(1)}
            aria-label={t('audio.next')}
            onClick={() => {
              const next = neighbourTrack(1);
              if (next) void playAudio(next, a.playlistId ?? null);
            }}
          >
            <SkipForward size={16} fill="currentColor" />
          </IconButton>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton
            size="xs"
            variant="quiet"
            disabled={!!a.fade}
            aria-label={t('audio.fadeOut')}
            onClick={() => void audioCmd({ action: 'fadeOut', sec: fadeSec })}
          >
            <TrendingDown size={14} />
          </IconButton>
          <IconButton
            size="xs"
            variant="quiet"
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

/**
 * Listening on this computer before the room hears it: the track, where it plays (headphones,
 * speakers), its transport, and "Play in room", which carries on from where you are.
 */
function PreviewBar({ playlistId }: { playlistId: string | null }) {
  const { t } = useTranslation();
  const p = useAudioPreview();
  const name = useStore((s) => s.media.find((m) => m.id === p.mediaId)?.name);
  const duration = useKnownDuration(p.mediaId ?? undefined);
  const outputs = useInputDevices('audiooutput');
  if (!p.mediaId) return null;
  const id = p.mediaId;
  return (
    <div
      role="group"
      aria-label={t('audio.preview')}
      className="mx-2.5 mb-2 flex flex-col gap-1.5 rounded-[10px] bg-[color-mix(in_srgb,var(--tally-preview)_10%,var(--surface-0))] px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tally-preview)_45%,transparent)]"
    >
      <div className="flex items-center gap-2">
        <Headphones size={14} className="shrink-0 text-[var(--tally-preview)]" />
        <div className="min-w-0 flex-1">
          <Typography as="p" size={12} weight="medium" truncate>
            {name}
          </Typography>
          <Typography as="p" size={11} tone="muted" truncate>
            {t('audio.previewHint')}
          </Typography>
        </div>
        <IconButton
          size="xs"
          variant="quiet"
          aria-label={t('audio.stopPreview')}
          onClick={stopPreview}
        >
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex items-center gap-2">
        <IconButton
          size="xs"
          variant="subtle"
          aria-label={p.playing ? t('audio.pausePreview') : t('audio.playPreview')}
          onClick={togglePreview}
          className="!rounded-full"
        >
          {p.playing ? (
            <Pause size={12} fill="currentColor" />
          ) : (
            <Play size={12} fill="currentColor" />
          )}
        </IconButton>
        <Slider
          format={null}
          aria-label={t('audio.previewPosition')}
          min={0}
          max={duration ?? 0}
          step={0.1}
          disabled={!duration}
          value={Math.min(p.position, duration ?? 0)}
          onChange={(e) => seekPreview(Number(e.target.value))}
          className="flex-1"
        />
        <Typography size={10} tone="muted" tabular className="w-9 text-right">
          {formatClock(Math.floor(p.position))}
        </Typography>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select<string>
            size="sm"
            aria-label={t('audio.listenOn')}
            value={p.sinkId || 'default'}
            onChange={(v) => setPreviewOutput(v === 'default' ? '' : v)}
            options={[
              { value: 'default', label: t('audio.defaultOutput') },
              ...(outputs ?? []).map((o) => ({ value: o.deviceId, label: o.label })),
            ]}
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          icon={<Radio size={13} />}
          onClick={() => {
            const at = p.position;
            stopPreview();
            void playAudio(id, playlistId, at);
          }}
        >
          {t('audio.sendToRoom')}
        </Button>
      </div>
    </div>
  );
}

/** One track: click plays it; its menu adds it to (or takes it out of) audio playlists. */
function TrackRow({ m, playlistId }: { m: MediaItem; playlistId: string | null }) {
  const { t } = useTranslation();
  const playing = useStore((s) => s.live?.audio?.mediaId === m.id);
  const listening = useAudioPreview((p) => p.mediaId === m.id);
  const clickToRoom = useStore((s) => s.settings?.audio.click === 'room');
  const playlists = usePlaylists('audio');
  const length = useKnownDuration(m.id, m.durationSec);
  useEffect(() => probeDuration(m.id), [m.id]);
  return (
    <li className="group relative">
      <Button
        variant="bare"
        aria-label={t('audio.listenTo', { name: m.name })}
        aria-current={playing || undefined}
        title={clickToRoom ? t('audio.rowHintRoom') : t('audio.rowHint')}
        // Click: listen here first (headphones), or straight into the room (Settings › Audio).
        // Double-click always goes to the room.
        onClick={() => {
          if (!clickToRoom) return previewTrack(m.id);
          stopPreview();
          void playAudio(m.id, playlistId);
        }}
        onDoubleClick={() => {
          stopPreview();
          void playAudio(m.id, playlistId);
        }}
        className={`flex h-8 w-full items-center gap-2 rounded-[5px] px-2 pr-14 text-left transition-colors ${
          playing
            ? 'bg-[var(--select)] text-white'
            : listening
              ? 'bg-[color-mix(in_srgb,var(--tally-preview)_18%,transparent)] shadow-[inset_0_0_0_1px_var(--tally-preview)]'
              : 'hover:bg-[var(--surface-2)]'
        }`}
      >
        {listening ? (
          <Headphones size={13} className="text-[var(--tally-preview)]" />
        ) : (
          <Music size={13} className={playing ? '' : 'text-[var(--text-3)]'} />
        )}
        <Typography size={12} truncate className="min-w-0 flex-1">
          {m.name}
        </Typography>
        <Typography size={11} tabular tone={playing ? 'inherit' : 'muted'}>
          {length ? formatClock(Math.round(length)) : ''}
        </Typography>
      </Button>
      <IconButton
        size="3xs"
        variant="quiet"
        aria-label={t('audio.playInRoom', { name: m.name })}
        onClick={() => {
          stopPreview();
          void playAudio(m.id, playlistId);
        }}
        className={`absolute right-7 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${playing ? '!text-white' : ''}`}
      >
        <Radio size={13} />
      </IconButton>
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
  const playlists = usePlaylists('audio');
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
      <PreviewBar playlistId={playlist?.id ?? null} />
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
          onClick={() => void importMedia({ playlistId: playlist?.id ?? null })}
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
      <div className="mt-auto pt-1">
        <AudioInputs />
      </div>
    </div>
  );
}
