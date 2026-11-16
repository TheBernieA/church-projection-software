import { useMemo, type ReactNode } from 'react';
import {
  AudioLines,
  Church,
  Eraser,
  Film,
  Image as ImageIcon,
  ListChecks,
  Megaphone,
  MessageSquareText,
  Play,
  Snowflake,
  Sparkle,
  Square,
  SquareDashed,
  Type,
  Video,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  makeScene,
  overlayGroup,
  sceneIsVisible,
  type Layer,
  type Scene,
  type Standby,
} from '@lampstand/core';
import { Button, Kbd, SoonBadge, TallyLabel, ToggleChip } from '@lampstand/ui';
import { clearLayer, goLive, toggleMask } from '../../lib/actions';
import { useHasMainOutput, useStandby } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { feature } from '../../lib/features';
import { useStore } from '../../lib/store';
import { SoonFeature } from '../Soon';
import { MediaTransport } from '../MediaTransport';
import { SceneView } from '../SceneView';
import { PaneHeader } from './PaneHeader';
import { urlHost } from '../../lib/utils';

function MonitorCard({
  tone,
  label,
  scene,
  active,
  caption,
  footer,
  standby,
  audio,
}: {
  tone: 'preview' | 'program';
  label: string;
  scene: Scene;
  active: boolean;
  caption?: string;
  /** Controls under the screen (the live video transport). */
  footer?: ReactNode;
  standby?: Standby | null;
  audio?: boolean;
}) {
  const ring =
    tone === 'program'
      ? active
        ? 'shadow-[var(--tally-program-glow)]'
        : 'shadow-[0_0_0_1px_var(--hairline-strong)]'
      : active
        ? 'shadow-[0_0_0_2px_var(--tally-preview)]'
        : 'shadow-[0_0_0_1px_var(--hairline-strong)]';
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="flex h-5 items-center justify-between gap-2 px-0.5">
        <TallyLabel tone={tone} active={active}>
          {label}
        </TallyLabel>
        {caption && <span className="truncate text-[11px] text-[var(--text-3)]">{caption}</span>}
      </figcaption>
      <div className={`overflow-hidden rounded-[4px] ${ring}`}>
        <SceneView scene={scene} label={label} standby={standby} audio={audio} />
      </div>
      {footer}
    </figure>
  );
}

/** One row of the clear stack: lights up while its layer has something on screen. */
function ClearRow({
  icon,
  label,
  hint,
  on,
  onClick,
  soon,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  on?: boolean;
  onClick?: () => void;
  /** Feature id of a planned layer: shown disabled with a "Soon" badge. */
  soon?: string;
}) {
  const { t } = useTranslation();
  const planned = soon ? feature(soon) : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!soon || !on}
      aria-label={
        soon
          ? `${t('monitor.clearLayer', { name: label })} (${t('soon.badge')})`
          : t('monitor.clearLayer', { name: label })
      }
      title={
        soon
          ? `${t('soon.tooltip', { name: label })}. ${planned?.description ?? ''}`
          : `${t('monitor.clearLayer', { name: label })}${hint ? ` (${hint})` : ''}`
      }
      className={`flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-[5px] px-2 text-left text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default ${
        on
          ? 'bg-[var(--tally-program-soft)] text-[var(--text-1)] hover:bg-[rgba(239,74,80,0.24)]'
          : 'text-[var(--text-3)]'
      }`}
    >
      <span className={on ? 'text-[var(--tally-program)]' : ''}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {soon ? (
        <SoonBadge />
      ) : (
        hint && <span className="text-[10px] text-[var(--text-3)]">{hint}</span>
      )}
    </button>
  );
}

/**
 * One layer in the clear strip (in on-screen order). Lit red while its layer shows something;
 * clicking clears just that layer. Dimmed and inert when the layer is empty.
 */
function LayerButton({
  icon,
  label,
  hint,
  on,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const name = t('monitor.clearLayer', { name: label });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!on}
      aria-label={name}
      title={hint ? `${name} (${hint})` : name}
      className={`relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] py-2 text-[10px] font-medium transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default ${
        on
          ? 'bg-[var(--tally-program-soft)] text-[var(--text-1)] shadow-[inset_0_0_0_1px_rgba(239,74,80,0.35)] hover:bg-[rgba(239,74,80,0.24)] [&_svg]:text-[var(--tally-program)]'
          : 'text-[var(--text-3)]'
      }`}
    >
      {on && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--tally-program)] shadow-[0_0_6px_var(--tally-program)]"
        />
      )}
      {icon}
      <span className="w-full truncate px-0.5 text-center">{label}</span>
    </button>
  );
}

/**
 * Right column: what the room sees (Live), the optional Preview monitor ("Preview first"),
 * video controls, then a clear button per layer and the screen masks.
 */
export function RightColumn() {
  const { t } = useTranslation();
  const live = useStore((s) => s.live);
  const media = useStore((s) => s.media);
  const clickGoesLive = useStore((s) => s.settings?.clickGoesLive ?? true);
  const keys = effectiveShortcuts();
  const standby = useStandby();
  const hasMainOutput = useHasMainOutput();

  const previewScene: Scene | null = useMemo(() => {
    if (!live) return null;
    return makeScene({
      background: live.preview.background ?? live.program.background,
      content: live.preview.content,
      media: live.preview.media ?? null,
      web: live.preview.web ?? null,
    });
  }, [live]);

  if (!live || !previewScene) return null;
  const p = live.program;
  const mediaName = p.media
    ? media.find((m) => m.id === p.media?.mediaId)?.name
    : p.web
      ? urlHost(p.web.url)
      : undefined;
  const onAir = sceneIsVisible(p);
  const hasPreview = !!(
    live.preview.content ||
    live.preview.background ||
    live.preview.media ||
    live.preview.web
  );
  const has = (g: 'messages' | 'props'): boolean => p.overlays.some((o) => overlayGroup(o) === g);
  const clear = (layer: Layer) => () => void clearLayer(layer);
  const anything = onAir || p.overlays.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PaneHeader title={t('monitor.output')} />
      <div className="flex flex-col gap-3 p-3">
        <MonitorCard
          tone="program"
          label={t('monitor.live')}
          scene={p}
          active={onAir}
          caption={p.content?.label ?? mediaName ?? (onAir ? '' : t('monitor.offAir'))}
          footer={p.media?.kind === 'video' ? <MediaTransport media={p.media} /> : undefined}
          standby={standby}
          audio={!hasMainOutput}
        />
        {!clickGoesLive && (
          <>
            <MonitorCard
              tone="preview"
              label={t('monitor.preview')}
              scene={previewScene}
              active={hasPreview}
              caption={live.preview.content?.label ?? (hasPreview ? '' : t('monitor.empty'))}
            />
            <Button
              variant="live"
              size="md"
              className="w-full"
              onClick={() => void goLive('ui')}
              disabled={!hasPreview}
              icon={<Play size={16} fill="currentColor" />}
            >
              {t('monitor.goLive')}
              <Kbd tone="onColor">{displayCombo(keys.goLive)}</Kbd>
            </Button>
          </>
        )}
      </div>

      <PaneHeader title={t('monitor.clear')} />
      <div className="flex flex-col gap-2 p-2.5">
        {/* Layers in on-screen order, top to bottom (as ProPresenter stacks them). */}
        <div
          role="group"
          aria-label={t('monitor.clear')}
          className="flex gap-1 rounded-[8px] bg-[var(--surface-0)] p-1 shadow-[inset_0_0_0_1px_var(--hairline)]"
        >
          <LayerButton
            icon={<MessageSquareText size={16} />}
            label={t('monitor.layers.messages')}
            on={has('messages')}
            onClick={clear('messages')}
          />
          <LayerButton
            icon={<Sparkle size={16} />}
            label={t('monitor.layers.props')}
            on={has('props')}
            onClick={clear('props')}
          />
          <LayerButton
            icon={<Type size={16} />}
            label={t('monitor.layers.slide')}
            hint={displayCombo(keys.clearContent)}
            on={!!p.content}
            onClick={clear('content')}
          />
          <LayerButton
            icon={<Film size={16} />}
            label={t('monitor.layers.media')}
            hint={displayCombo(keys.clearMedia)}
            on={!!p.media || !!p.web}
            onClick={clear('media')}
          />
          <LayerButton
            icon={<ImageIcon size={16} />}
            label={t('monitor.layers.background')}
            hint={displayCombo(keys.clearBackground)}
            on={!!p.background}
            onClick={clear('background')}
          />
        </div>
        <Button
          size="sm"
          variant={anything ? 'danger' : 'ghost'}
          className={`w-full ${anything ? 'shadow-[inset_0_0_0_1px_rgba(239,74,80,0.4)]' : ''}`}
          disabled={!anything}
          icon={<Eraser size={14} />}
          onClick={() => void clearLayer('all')}
        >
          {t('monitor.clearAllLayers')}
          <Kbd>{displayCombo(keys.clearAll)}</Kbd>
        </Button>
        {/* Planned layers keep their "Soon" markers. */}
        <div className="grid grid-cols-2 gap-1">
          <ClearRow
            icon={<Megaphone size={14} />}
            label={t('monitor.layers.announcements')}
            soon="announcements-layer"
          />
          <ClearRow
            icon={<AudioLines size={14} />}
            label={t('monitor.layers.audio')}
            soon="audio-bin"
          />
          <ClearRow
            icon={<Video size={14} />}
            label={t('monitor.layers.videoInput')}
            soon="video-input"
          />
          <ClearRow
            icon={<ListChecks size={14} />}
            label={t('monitor.layers.custom')}
            soon="custom-clear-groups"
          />
        </div>
      </div>

      <PaneHeader title={t('monitor.masks')} />
      <div role="group" aria-label={t('monitor.masks')} className="flex flex-col gap-1.5 p-2.5">
        <div className="grid grid-cols-[1.45fr_1fr_1fr] gap-1">
          <ToggleChip
            on={p.masks.black}
            onClick={() => void toggleMask('black')}
            icon={<Square size={14} fill="currentColor" />}
            label={t('monitor.black')}
            hint={displayCombo(keys.black)}
            className="w-full justify-center !px-2"
          />
          <ToggleChip
            on={p.masks.logo}
            onClick={() => void toggleMask('logo')}
            icon={<Church size={14} />}
            label={t('monitor.logo')}
            hint={displayCombo(keys.logo)}
            className="w-full justify-center !px-2"
          />
          <ToggleChip
            on={p.masks.freeze}
            onClick={() => void toggleMask('freeze')}
            icon={<Snowflake size={14} />}
            label={t('monitor.freeze')}
            hint={displayCombo(keys.freeze)}
            className="w-full justify-center !px-2"
          />
        </div>
        <SoonFeature id="masks" icon={<SquareDashed size={14} />} label={t('monitor.masksSoon')} />
      </div>
    </div>
  );
}
