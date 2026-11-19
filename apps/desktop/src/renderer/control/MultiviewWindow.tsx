import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveStageLayout } from '@lampstand/core';
import { TallyLabel, Typography } from '@lampstand/ui';
import { CameraThumb, useCameras } from './components/scenes/SceneStrip';
import { SceneView } from './components/SceneView';
import { StagePreview } from './components/StagePreview';
import { Toasts } from './components/Toasts';
import {
  useAlternateScene,
  useAudienceScene,
  useNextScene,
  usePreviewScene,
  useScreenMask,
} from './lib/screenViews';
import { useStreamPreview } from './lib/streamPreview';
import { useStandby } from './lib/hooks';
import { useStore } from './lib/store';

type Tally = 'program' | 'preview' | 'none';

/** One picture in the grid, with its name (and a red / green tally when it's on air / next). */
function Tile({
  label,
  tally = 'none',
  caption,
  children,
}: {
  label: string;
  tally?: Tally;
  caption?: string;
  children: ReactNode;
}) {
  const ring =
    tally === 'program'
      ? 'shadow-[0_0_0_2px_var(--tally-program)]'
      : tally === 'preview'
        ? 'shadow-[0_0_0_2px_var(--tally-preview)]'
        : 'shadow-[0_0_0_1px_var(--hairline-strong)]';
  return (
    <figure role="group" aria-label={label} className="flex min-w-0 flex-col gap-1.5">
      <div className={`relative aspect-video overflow-hidden rounded-[4px] bg-black ${ring}`}>
        {children}
      </div>
      <figcaption className="flex h-5 items-center justify-between gap-2 px-0.5">
        {tally === 'none' ? (
          <Typography size={11} weight="semibold" tone="secondary" caps truncate>
            {label}
          </Typography>
        ) : (
          <TallyLabel tone={tally} active>
            {label}
          </TallyLabel>
        )}
        {caption && (
          <Typography size={11} tone="muted" truncate className="min-w-0">
            {caption}
          </Typography>
        )}
      </figcaption>
    </figure>
  );
}

/** A tile with nothing to show yet: a quiet word in the middle. */
const Empty = ({ children }: { children: string }) => (
  <Typography
    as="span"
    size={12}
    tone="muted"
    className="absolute inset-0 flex items-center justify-center"
  >
    {children}
  </Typography>
);

/** The stream as it goes out (while streaming or recording). */
function StreamTile() {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const status = useStore((s) => s.stream);
  const on = !!status && (status.streaming || status.recording);
  const drawn = useStreamPreview(canvas, on ? 15 : 0);
  return (
    <Tile
      label={t('multiview.stream')}
      tally={status?.streaming ? 'program' : 'none'}
      caption={on ? (status.streaming ? t('multiview.streaming') : t('multiview.recording')) : ''}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full object-contain" />
      {(!on || !drawn) && <Empty>{t('multiview.streamOff')}</Empty>}
    </Tile>
  );
}

/**
 * The operator multi-view (`?view=multiview`): every screen (audience, preview, next, the
 * alternate output, the stage display), the stream and each camera, on one screen. It only
 * watches: nothing here changes what's on air.
 */
export function MultiviewWindow() {
  const { t } = useTranslation();
  const uiTheme = useStore((s) => s.settings?.uiTheme ?? 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.title = 'Lampstand Multi-view';
  }, [uiTheme]);
  const audience = useAudienceScene();
  const preview = usePreviewScene();
  const next = useNextScene();
  const alternate = useAlternateScene();
  const audienceMask = useScreenMask('main');
  const alternateMask = useScreenMask('secondary');
  const standby = useStandby();
  const live = useStore((s) => s.live);
  const hasAlternate = useStore((s) => s.displays.some((d) => d.role === 'secondary'));
  const stageLayouts = useStore((s) => s.settings?.stageLayouts);
  const stageId = useStore((s) => s.settings?.stageLayoutId);
  const stageLayout = useMemo(
    () => resolveStageLayout(stageLayouts ?? [], stageId ?? null),
    [stageLayouts, stageId],
  );
  const cameras = useCameras();
  const onAir = live?.program.input?.deviceId;
  const waiting = live?.switcher.preview?.deviceId;
  return (
    <main className="h-full overflow-y-auto bg-[var(--surface-0)] p-3">
      <h1 className="sr-only">{t('multiview.title')}</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        <Tile label={t('multiview.program')} tally="program" caption={live?.program.content?.label}>
          {audience && (
            <SceneView
              scene={audience}
              standby={standby}
              mask={audienceMask}
              label={t('multiview.program')}
            />
          )}
        </Tile>
        <Tile label={t('multiview.preview')} tally="preview" caption={live?.preview.content?.label}>
          {preview && <SceneView scene={preview} label={t('multiview.preview')} />}
        </Tile>
        <Tile label={t('multiview.next')} caption={live?.next?.label}>
          {next && <SceneView scene={next} label={t('multiview.next')} />}
        </Tile>
        <Tile label={t('multiview.stage')}>
          <StagePreview layout={stageLayout} />
        </Tile>
        <Tile
          label={t('multiview.alternate')}
          caption={hasAlternate ? '' : t('multiview.notConnected')}
        >
          {alternate && (
            <SceneView scene={alternate} mask={alternateMask} label={t('multiview.alternate')} />
          )}
        </Tile>
        <StreamTile />
        {cameras.map((c) => (
          <Tile
            key={c.id}
            label={c.name}
            tally={c.id === onAir ? 'program' : c.id === waiting ? 'preview' : 'none'}
          >
            <CameraThumb deviceId={c.id} />
          </Tile>
        ))}
      </div>
      <Toasts />
    </main>
  );
}
