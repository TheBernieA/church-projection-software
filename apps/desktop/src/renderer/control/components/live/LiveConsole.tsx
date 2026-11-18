import { useRef } from 'react';
import {
  Circle,
  ExternalLink,
  FolderOpen,
  PanelRightClose,
  PictureInPicture2,
  Radio,
  Settings2,
  Square,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StreamSettings } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { q } from '../../lib/api';
import { openDialog, useStore } from '../../lib/store';
import { useStreamPreview } from '../../lib/streamPreview';
import { CheckComputer } from './CheckComputer';
import { formatBytes, run, Section, usePref } from './consoleParts';
import { DestinationsPanel } from './DestinationsPanel';
import { LowerThirdPanel } from './LowerThirdPanel';
import { QuickSettings } from './QuickSettings';
import { FooterReadings, HeaderReadings, HealthPanel, StatusPill } from './readings';
import { SoundPanel } from './SoundPanel';
import { ScenePreviews, SilentNotice, StreamMeterOverlay, StreamSound } from './StreamBar';

const NO_DESTINATIONS: StreamSettings['destinations'] = [];
const READY_KEY = 'lampstand.liveReady';

/**
 * The Live console: everything for running the livestream and recording in one place, docked
 * beside the output or in its own window (another display). The real outgoing picture, going
 * live and recording, what the stream shows and hears, each destination, and how the computer
 * is coping.
 */
export function LiveConsole({ mode }: { mode: 'docked' | 'window' }) {
  const { t } = useTranslation();
  const s = useStore((x) => x.stream);
  const settings = useStore((x) => x.settings);
  const st: StreamSettings | null = settings?.stream ?? null;
  const destinations = st?.destinations ?? NO_DESTINATIONS;
  const enabled = destinations.filter((d) => d.enabled);
  const [showReady, toggleReady] = usePref(READY_KEY, true);
  const canReady = s?.profile.allowReady ?? true;
  const running = !!s && s.state !== 'idle';
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const preview = useStreamPreview(
    previewCanvas,
    running || (showReady && canReady) ? 30 : 0,
    showReady && canReady,
  );

  const goLive = (): void => {
    const names = enabled.map((d) => d.name).join(', ');
    if (window.confirm(t('live.confirmStart', { names }))) run('stream.start', { stream: true });
  };
  const endStream = (): void => {
    if (window.confirm(t('live.confirmEnd'))) run('stream.stop', { stream: true, record: true });
  };

  if (!st) return null;
  return (
    <section
      aria-label={t('console.title')}
      className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-3">
        <Radio size={16} className="text-[var(--tally-program)]" />
        <Typography as="h2" size={14} weight="semibold" tone="primary" className="flex-1 shrink-0">
          {t('console.title')}
        </Typography>
        {s && s.available && <HeaderReadings s={s} />}
        <StatusPill s={s} />
        {mode === 'docked' ? (
          <>
            <IconButton
              size="xs"
              aria-label={t('console.popOut')}
              onClick={() => run('liveConsole.open', { open: true })}
            >
              <ExternalLink size={14} />
            </IconButton>
            <IconButton
              size="xs"
              aria-label={t('console.close')}
              onClick={() => useStore.setState({ liveConsole: 'closed' })}
            >
              <X size={14} />
            </IconButton>
          </>
        ) : (
          <IconButton
            size="xs"
            aria-label={t('console.dock')}
            onClick={() => run('liveConsole.open', { open: false })}
          >
            <PanelRightClose size={14} />
          </IconButton>
        )}
      </header>

      {/* Always in view: going live, recording and the picture. The options scroll beneath. */}
      <div className="shrink-0">
        {/* Going live and recording. */}
        <div className="flex flex-col gap-2 px-4 py-3.5">
          {s && !s.available ? (
            <Typography as="p" size={12} tone="secondary" leading="snug">
              {t('live.noFfmpeg')}
            </Typography>
          ) : (
            <div className="flex gap-2">
              {s?.streaming ? (
                <Button
                  size="md"
                  variant="live"
                  className="flex-1"
                  icon={<Square size={14} fill="currentColor" />}
                  onClick={endStream}
                >
                  {t('live.end')}
                </Button>
              ) : (
                <Button
                  size="md"
                  variant="live"
                  className="flex-1"
                  icon={<Radio size={15} />}
                  disabled={!enabled.length}
                  title={enabled.length ? undefined : t('live.noDestinations')}
                  onClick={goLive}
                >
                  {t('live.goLive')}
                </Button>
              )}
              {s?.recording ? (
                <Button
                  size="md"
                  variant="subtle"
                  icon={<Square size={13} fill="currentColor" />}
                  onClick={() => run('stream.stop', { record: true })}
                >
                  {t('live.stopRecording')}
                </Button>
              ) : (
                <Button
                  size="md"
                  variant="subtle"
                  icon={<Circle size={13} fill="var(--tally-program)" strokeWidth={0} />}
                  onClick={() => run('stream.start', { record: true })}
                >
                  {t('live.record')}
                </Button>
              )}
            </div>
          )}
          {s?.error && s.error !== 'reconnecting' && (
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
        </div>

        {/* The real picture going out, its sound, and the scene. */}
        <div className="flex flex-col gap-2.5 px-4 pb-3.5">
          <div
            className={`relative aspect-video w-full overflow-hidden rounded-[8px] bg-black ${s?.streaming ? 'shadow-[0_0_0_2px_var(--tally-program)]' : 'shadow-[0_0_0_1px_var(--hairline-strong)]'}`}
          >
            <canvas
              ref={previewCanvas}
              role="img"
              aria-label={t('live.preview')}
              className={`h-full w-full object-contain ${preview ? '' : 'invisible'}`}
            />
            {!preview && (
              <Typography
                as="div"
                size={12}
                tone="muted"
                leading="snug"
                className="absolute inset-0 flex items-center justify-center px-8 text-center"
              >
                {running
                  ? t('live.starting')
                  : canReady
                    ? t('console.previewOff')
                    : t('console.previewLight')}
              </Typography>
            )}
            {(preview || running) && <StreamMeterOverlay />}
          </div>
          {s && <SilentNotice s={s} />}
          {/* Pinned with the picture (the options scroll beneath): scenes, then the sound. */}
          <ScenePreviews st={st} streaming={!!s?.streaming} />
          <StreamSound />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The lower third's look, while the scene on air has one. */}
        <LowerThirdPanel st={st} />
        <SoundPanel />
        <DestinationsPanel s={s} st={st} />
        <QuickSettings
          s={s}
          st={st}
          showReady={showReady}
          canReady={canReady}
          onReady={toggleReady}
        />
        {s && <HealthPanel s={s} />}

        {s?.recordingPath && (
          <Section title={t('console.recordingTitle')}>
            <div className="flex items-center gap-2">
              <Typography size={12} tone="primary" truncate className="min-w-0 flex-1">
                {s.recordingPath.split(/[\\/]/).pop()}
              </Typography>
              <Typography size={12} tone="muted" tabular>
                {formatBytes(s.recordingBytes)}
              </Typography>
              <IconButton
                size="xs"
                aria-label={t('live.openRecordings')}
                onClick={() => void q('recording.reveal', { path: s.recordingPath })}
              >
                <FolderOpen size={14} />
              </IconButton>
            </div>
          </Section>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-1 border-t border-[var(--hairline)] px-3 py-2">
        {s && s.available ? <FooterReadings s={s} /> : <span className="flex-1" />}
        <CheckComputer compact />
        <IconButton
          size="sm"
          aria-label={t('live.openRecordings')}
          onClick={() => void q('recording.reveal', { path: s?.recordingPath ?? null })}
        >
          <FolderOpen size={15} />
        </IconButton>
        {mode === 'docked' && (
          <IconButton
            size="sm"
            aria-label={t('console.popOut')}
            onClick={() => run('liveConsole.open', { open: true })}
          >
            <PictureInPicture2 size={15} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          aria-label={t('live.settings')}
          onClick={() => openDialog('settings', { settingsPage: 'streaming' })}
        >
          <Settings2 size={15} />
        </IconButton>
      </footer>
    </section>
  );
}
