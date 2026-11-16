import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Circle, FolderOpen, Radio, Settings2, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, secondsSince, type StreamDestination } from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, Typography } from '@lampstand/ui';
import { cmd, q } from '../../lib/api';
import { useNow } from '../../lib/hooks';
import { attempt, openDialog, useStore } from '../../lib/store';
import { MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { ToolbarButton } from './ToolbarButton';

const NO_DESTINATIONS: StreamDestination[] = [];

const DOT: Record<StreamStatus['destinations'][number]['state'], string> = {
  connecting: 'var(--accent)',
  ok: 'var(--tally-preview)',
  failed: 'var(--tally-program)',
};

/** Start / stop streaming or recording (one step each, with a check before going live). */
const run = (
  type: 'stream.start' | 'stream.stop',
  payload: { stream?: boolean; record?: boolean },
) => void attempt(() => cmd(type, payload), 'errors.stream');

/**
 * The toolbar's Live button: livestream to YouTube, Facebook or any RTMP service, and record,
 * all from Lampstand. The panel shows what's going out, how it's doing, and the controls.
 */
export function LiveMenu() {
  const { t } = useTranslation();
  const s = useStore((x) => x.stream);
  const destinations = useStore((x) => x.settings?.stream.destinations ?? NO_DESTINATIONS);
  const live = !!s && s.state !== 'idle';
  const now = useNow(1000, live);
  const enabled = destinations.filter((d) => d.enabled);
  const elapsed = s?.since ? formatClock(secondsSince(s.since, now)) : '00:00';
  const struggling = !!s && s.state === 'live' && s.speed > 0 && s.speed < 0.95;

  const goLive = (): void => {
    const names = enabled.map((d) => d.name).join(', ');
    if (window.confirm(t('live.confirmStart', { names }))) run('stream.start', { stream: true });
  };
  const endStream = (): void => {
    if (window.confirm(t('live.confirmEnd'))) run('stream.stop', { stream: true, record: true });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <ToolbarButton
          icon={<Radio size={20} />}
          label={t('toolbar.live')}
          aria-label={
            s?.streaming ? t('live.onAir') : s?.recording ? t('live.recording') : t('live.open')
          }
          badge={
            live ? (
              <span
                aria-hidden
                className="absolute -right-1.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-[var(--tally-program)] shadow-[0_0_6px_var(--tally-program)] ring-2 ring-[var(--toolbar)]"
              />
            ) : undefined
          }
          className={live ? '!text-[var(--tally-program)]' : ''}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${MENU_CLASS} w-[340px] !p-3`}>
          <div role="group" aria-label={t('live.title')} className="flex flex-col gap-3">
            {/* What's going out. */}
            <div className="flex items-center gap-2">
              <Typography size={13} weight="semibold" tone="primary" className="flex-1">
                {t('live.title')}
              </Typography>
              {live && (
                <Typography
                  size={11}
                  weight="bold"
                  tone="white"
                  caps
                  tabular
                  className="flex items-center gap-1.5 rounded-[4px] bg-[var(--tally-program)] px-1.5 py-0.5"
                >
                  {s.streaming ? t('live.badgeLive') : t('live.badgeRec')} · {elapsed}
                </Typography>
              )}
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-[6px] bg-black shadow-[0_0_0_1px_var(--hairline-strong)]">
              {s?.preview ? (
                <img
                  src={s.preview}
                  alt={t('live.preview')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Typography
                  as="div"
                  size={12}
                  tone="muted"
                  className="absolute inset-0 flex items-center justify-center px-6 text-center"
                >
                  {live ? t('live.starting') : t('live.previewIdle')}
                </Typography>
              )}
            </div>

            {s && !s.available ? (
              <Typography as="p" size={12} tone="secondary" leading="snug">
                {t('live.noFfmpeg')}
              </Typography>
            ) : (
              <>
                {/* Health. */}
                {live && (
                  <div className="flex flex-col gap-1.5">
                    {s.destinations.map((d) => (
                      <Typography
                        key={d.id}
                        size={12}
                        tone="secondary"
                        className="flex items-center gap-2"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ background: DOT[d.state] }}
                        />
                        <Typography size={12} tone="secondary" truncate className="min-w-0 flex-1">
                          {d.name}
                        </Typography>
                        <Typography size={11} tone="muted">
                          {t(`live.dest.${d.state}`)}
                        </Typography>
                      </Typography>
                    ))}
                    <Typography size={11} tone="muted" tabular>
                      {s.kbps > 0
                        ? t('live.stats', {
                            fps: Math.round(s.fps),
                            kbps: Math.round(s.kbps).toLocaleString(),
                            speed: s.speed.toFixed(2),
                          })
                        : t('live.statsShort', {
                            fps: Math.round(s.fps),
                            speed: s.speed.toFixed(2),
                          })}
                      {s.dropped > 0 && ` · ${t('live.dropped', { count: s.dropped })}`}
                    </Typography>
                    {struggling && (
                      <Typography size={11} tone="inherit" className="text-[var(--accent)]">
                        {t('live.struggling')}
                      </Typography>
                    )}
                  </div>
                )}
                {s?.error && (
                  <Typography
                    as="p"
                    size={12}
                    tone="inherit"
                    leading="snug"
                    className="text-[var(--tally-program)]"
                  >
                    {t(`live.errors.${s.error}`)}
                  </Typography>
                )}
                {/* Controls. */}
                <div className="flex gap-2">
                  {s?.streaming ? (
                    <Button
                      size="sm"
                      variant="live"
                      className="flex-1"
                      icon={<Square size={13} fill="currentColor" />}
                      onClick={endStream}
                    >
                      {t('live.end')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="live"
                      className="flex-1"
                      icon={<Radio size={14} />}
                      disabled={!enabled.length}
                      title={enabled.length ? undefined : t('live.noDestinations')}
                      onClick={goLive}
                    >
                      {t('live.goLive')}
                    </Button>
                  )}
                  {s?.recording ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      icon={<Square size={12} fill="currentColor" />}
                      onClick={() => run('stream.stop', { record: true })}
                    >
                      {t('live.stopRecording')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="subtle"
                      icon={<Circle size={12} fill="var(--tally-program)" strokeWidth={0} />}
                      onClick={() => run('stream.start', { record: true })}
                    >
                      {t('live.record')}
                    </Button>
                  )}
                </div>
                {!enabled.length && (
                  <Typography as="p" size={11} tone="muted" leading="snug">
                    {t('live.noDestinations')}
                  </Typography>
                )}
              </>
            )}
            <DropdownMenu.Separator className={SEPARATOR_CLASS} />
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="ghost"
                icon={<FolderOpen size={13} />}
                onClick={() => void q('recording.reveal', { path: s?.recordingPath ?? null })}
              >
                {t('live.openRecordings')}
              </Button>
              <span className="flex-1" />
              <Button
                size="xs"
                variant="ghost"
                icon={<Settings2 size={13} />}
                onClick={() => openDialog('settings', { settingsPage: 'streaming' })}
              >
                {t('live.settings')}
              </Button>
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
