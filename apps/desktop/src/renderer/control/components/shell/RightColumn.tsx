import { useMemo, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AudioLines,
  Church,
  Film,
  Image as ImageIcon,
  Megaphone,
  MessageSquareText,
  Play,
  Snowflake,
  Sparkle,
  Square,
  Type,
  ListChecks,
  Video,
  Power,
  Ellipsis,
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
import { Button, Kbd, SoonBadge, TallyLabel } from '@lampstand/ui';
import { feature } from '../../lib/features';
import { clearLayer, goLive, toggleMask } from '../../lib/actions';
import { useHasMainOutput, useStandby } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { useStore } from '../../lib/store';
import { MediaTransport } from '../MediaTransport';
import { SceneView } from '../SceneView';
import { ShowControls } from './ShowControls';
import { Select } from '../Select';
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
        {caption && <span className="truncate text-ui-11 text-[var(--text-3)]">{caption}</span>}
      </figcaption>
      <div className={`overflow-hidden rounded-[4px] ${ring}`}>
        <SceneView scene={scene} label={label} standby={standby} audio={audio} />
      </div>
      {footer}
    </figure>
  );
}

/** Layers planned but not built yet: shown dimmed in the strip, with a "soon" tooltip. */
const PLANNED_LAYERS = [
  { id: 'announcements-layer', label: 'announcements', icon: <Megaphone size={14} /> },
  { id: 'audio-bin', label: 'audio', icon: <AudioLines size={14} /> },
  { id: 'video-input', label: 'videoInput', icon: <Video size={14} /> },
  { id: 'custom-clear-groups', label: 'custom', icon: <ListChecks size={14} /> },
];

/** "…" at the foot of the layer strip: the layers still to come, each marked Soon. */
function PlannedLayers() {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('monitor.moreLayers')}
          title={t('monitor.moreLayers')}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[5px] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <Ellipsis size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="left"
          align="end"
          sideOffset={6}
          className="z-[60] min-w-[230px] rounded-[8px] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-3)] outline-none focus-visible:!shadow-[var(--shadow-3)] data-[state=open]:animate-[ls-pop_120ms_ease-out]"
        >
          <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-ui-11 font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
            {t('monitor.moreLayers')}
          </DropdownMenu.Label>
          {PLANNED_LAYERS.map((l) => {
            const f = feature(l.id);
            return (
              <DropdownMenu.Item
                key={l.id}
                disabled
                title={`${t('soon.tooltip', { name: f.name })}. ${f.description}`}
                className="flex items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 text-ui-13 text-[var(--text-2)] outline-none"
              >
                <span className="flex text-[var(--text-3)]">{l.icon}</span>
                <span className="flex-1">{t(`monitor.layers.${l.label}`)}</span>
                <SoonBadge label={t('soon.badge')} />
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * One layer in the vertical clear strip beside the monitor. Lit red while the layer shows
 * something; clicking clears just that layer. Inert when the layer is empty.
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
      className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-[5px] transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default ${
        on
          ? 'bg-[var(--tally-program)] text-white shadow-[0_0_8px_rgba(239,74,80,0.45)] hover:brightness-110'
          : 'text-[var(--text-3)]'
      }`}
    >
      {icon}
    </button>
  );
}

/** Black / Logo / Freeze: compact toggles under the monitor; red while engaged. */
function MaskButton({
  on,
  onClick,
  icon,
  label,
  hint,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={`${label} (${hint})`}
      onClick={onClick}
      className={`flex h-7 cursor-pointer items-center gap-1 rounded-[5px] px-2 text-ui-11 font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        on
          ? 'bg-[var(--tally-program)] text-white'
          : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
      }`}
    >
      {icon}
      <span>{hint}</span>
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
  // The monitor shows the audience screen, or what the stage screen shows next.
  const [screen, setScreen] = useState<'audience' | 'stage'>('audience');

  const previewScene: Scene | null = useMemo(() => {
    if (!live) return null;
    return makeScene({
      background: live.preview.background ?? live.program.background,
      content: live.preview.content,
      media: live.preview.media ?? null,
      web: live.preview.web ?? null,
    });
  }, [live]);

  const nextScene: Scene | null = useMemo(
    () =>
      live ? makeScene({ background: live.program.background, content: live.next ?? null }) : null,
    [live],
  );

  if (!live || !previewScene || !nextScene) return null;
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
  const anything = onAir || p.overlays.length > 0 || p.masks.black || p.masks.logo;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--divider)] p-2.5">
        <figure className="flex flex-col gap-2">
          <figcaption className="sr-only">{t('monitor.live')}</figcaption>
          {/* What's on air: one line, red while live. */}
          <div
            role="status"
            aria-live="polite"
            className="flex h-5 items-center justify-between px-0.5"
          >
            <TallyLabel tone="program" active={onAir}>
              {onAir ? t('top.live').toUpperCase() : t('top.offAirShort')}
            </TallyLabel>
            <span className="truncate text-ui-11 text-[var(--text-3)]">
              {p.content?.label ?? mediaName ?? ''}
            </span>
          </div>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {screen === 'audience' ? (
                <div
                  className={`overflow-hidden rounded-[3px] ${onAir ? 'shadow-[var(--tally-program-glow)]' : 'shadow-[0_0_0_1px_var(--hairline-strong)]'}`}
                >
                  <SceneView
                    scene={p}
                    label={t('monitor.live')}
                    standby={standby}
                    audio={!hasMainOutput}
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--hairline-strong)]">
                  <SceneView scene={nextScene} label={t('monitor.next')} />
                </div>
              )}
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
                    size="sm"
                    className="w-full"
                    onClick={() => void goLive('ui')}
                    disabled={!hasPreview}
                    icon={<Play size={14} fill="currentColor" />}
                  >
                    {t('monitor.goLive')}
                    <Kbd tone="onColor">{displayCombo(keys.goLive)}</Kbd>
                  </Button>
                </>
              )}
            </div>
            {/* Layers, top to bottom as stacked on screen; each clears just its layer. */}
            <div
              role="group"
              aria-label={t('monitor.clear')}
              className="flex w-7 shrink-0 flex-col items-center gap-[3px]"
            >
              {anything ? (
                <button
                  type="button"
                  aria-label={`${t('monitor.clearAll')} (${displayCombo(keys.clearAll)})`}
                  title={`${t('monitor.clearAll')} (${displayCombo(keys.clearAll)})`}
                  onClick={() => void clearLayer('all')}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[var(--tally-program)] text-white shadow-[0_2px_10px_rgba(239,74,80,0.45)] hover:brightness-110"
                >
                  <Power size={13} strokeWidth={2.5} />
                </button>
              ) : (
                <span
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-3)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
                >
                  <Power size={12} />
                </span>
              )}
              <LayerButton
                icon={<MessageSquareText size={14} />}
                label={t('monitor.layers.messages')}
                on={has('messages')}
                onClick={clear('messages')}
              />
              <LayerButton
                icon={<Sparkle size={14} />}
                label={t('monitor.layers.props')}
                on={has('props')}
                onClick={clear('props')}
              />
              <LayerButton
                icon={<Type size={14} />}
                label={t('monitor.layers.slide')}
                hint={displayCombo(keys.clearContent)}
                on={!!p.content}
                onClick={clear('content')}
              />
              <LayerButton
                icon={<Film size={14} />}
                label={t('monitor.layers.media')}
                hint={displayCombo(keys.clearMedia)}
                on={!!p.media || !!p.web}
                onClick={clear('media')}
              />
              <LayerButton
                icon={<ImageIcon size={14} />}
                label={t('monitor.layers.background')}
                hint={displayCombo(keys.clearBackground)}
                on={!!p.background}
                onClick={clear('background')}
              />
              <PlannedLayers />
            </div>
          </div>
        </figure>
        <div className="flex items-center gap-1.5">
          <Select<'audience' | 'stage'>
            size="sm"
            aria-label={t('monitor.screen')}
            value={screen}
            onChange={setScreen}
            options={[
              { value: 'audience', label: t('toolbar.audience') },
              { value: 'stage', label: t('monitor.stageNext') },
            ]}
          />
          <span className="flex-1" />
          <MaskButton
            on={p.masks.black}
            onClick={() => void toggleMask('black')}
            icon={<Square size={13} fill="currentColor" />}
            label={t('monitor.black')}
            hint={displayCombo(keys.black)}
          />
          <MaskButton
            on={p.masks.logo}
            onClick={() => void toggleMask('logo')}
            icon={<Church size={13} />}
            label={t('monitor.logo')}
            hint={displayCombo(keys.logo)}
          />
          <MaskButton
            on={p.masks.freeze}
            onClick={() => void toggleMask('freeze')}
            icon={<Snowflake size={13} />}
            label={t('monitor.freeze')}
            hint={displayCombo(keys.freeze)}
          />
        </div>
        {p.media?.kind === 'video' && <MediaTransport media={p.media} />}
      </div>
      <ShowControls />
    </div>
  );
}
