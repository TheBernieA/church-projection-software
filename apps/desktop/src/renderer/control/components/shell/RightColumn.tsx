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
  Settings2,
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
  type MediaLayer,
  type RestorableLayer,
  type Scene,
  type Settings,
  type Standby,
} from '@lampstand/core';
import {
  Button,
  Kbd,
  SoonBadge,
  TallyLabel,
  Typography,
  IconButton,
  typographyClass,
  Segmented,
} from '@lampstand/ui';
import { feature } from '../../lib/features';
import {
  clearGroup,
  clearLayer,
  goLive,
  restoreAll,
  restoreLayer,
  toggleMask,
} from '../../lib/actions';
import { useHasMainOutput, useStandby } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { openDialog, useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
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
        {caption && (
          <Typography size={11} tone="muted" truncate>
            {caption}
          </Typography>
        )}
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
];

/**
 * "…" at the foot of the layer strip: the operator's clear groups (one click clears exactly
 * those layers), a way to edit them, and the layers still to come, marked Soon.
 */
function LayersMenu() {
  const { t } = useTranslation();
  const groups = useStore((s) => s.settings?.clearGroups ?? EMPTY_GROUPS);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton size="2xs" variant="quiet" aria-label={t('monitor.moreLayers')}>
          <Ellipsis size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="left" align="end" sideOffset={6} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL}>{t('clearGroups.title')}</DropdownMenu.Label>
          {groups.map((g) => (
            <DropdownMenu.Item
              key={g.id}
              className={ITEM_CLASS}
              onSelect={() => void clearGroup(g.layers)}
              title={g.layers.map((l) => t(`clearGroups.layers.${l}`)).join(', ')}
            >
              <ListChecks size={14} />
              <Typography truncate className="flex-1">
                {t('clearGroups.clear', { name: g.name })}
              </Typography>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => openDialog('settings', { settingsPage: 'presenting' })}
          >
            <Settings2 size={14} />
            {groups.length ? t('clearGroups.edit') : t('clearGroups.create')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Label className={MENU_LABEL}>{t('monitor.moreLayers')}</DropdownMenu.Label>
          {PLANNED_LAYERS.map((l) => {
            const f = feature(l.id);
            return (
              <DropdownMenu.Item
                key={l.id}
                disabled
                title={`${t('soon.tooltip', { name: f.name })}. ${f.description}`}
                className={ITEM_CLASS}
              >
                <Typography tone="muted" className="flex">
                  {l.icon}
                </Typography>
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

const EMPTY_GROUPS: NonNullable<Settings['clearGroups']> = [];
const MENU_LABEL = `px-2.5 pb-1 pt-1.5 ${typographyClass({ size: 11, tone: 'muted', weight: 'semibold', caps: true })}`;

/**
 * One layer in the vertical clear strip beside the monitor. Lit red while the layer shows
 * something; clicking clears just that layer. Once cleared it remembers what was there: it gets
 * a red outline and clicking again brings it back. Inert when there is nothing to bring back.
 */
function LayerButton({
  icon,
  label,
  hint,
  on,
  restorable,
  restoreWhat,
  onClick,
  onRestore,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  on: boolean;
  /** Empty now, but the last clear can be undone. */
  restorable: boolean;
  /** What would come back (a slide label, a file name), for the tooltip. */
  restoreWhat?: string | undefined;
  onClick: () => void;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const restore = !on && restorable;
  const name = restore
    ? t('monitor.restoreLayer', { name: label })
    : t('monitor.clearLayer', { name: label });
  const tip = restore && restoreWhat ? `${name}: ${restoreWhat}` : name;
  return (
    <IconButton
      size="2xs"
      variant="quiet"
      onClick={restore ? onRestore : onClick}
      disabled={!on && !restorable}
      active={on}
      activeTone="live"
      aria-label={name}
      title={hint && !restore ? `${tip} (${hint})` : tip}
      // An empty layer is shown as a plain icon, not a faded "disabled" one; a layer that can be
      // brought back is outlined in red.
      className={`disabled:cursor-default disabled:opacity-100 ${
        restore
          ? '!text-[var(--text-1)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tally-program)_70%,transparent)]'
          : ''
      }`}
    >
      {icon}
    </IconButton>
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
    <Button
      size="xs"
      variant="subtle"
      aria-pressed={on}
      aria-label={label}
      title={`${label} (${hint})`}
      onClick={onClick}
      icon={icon}
      className={`!gap-1 ${typographyClass({ size: 11, important: true })} ${on ? '!bg-[var(--tally-program)] !text-white' : '!text-[var(--text-2)]'}`}
    >
      {hint}
    </Button>
  );
}

/**
 * The transport under the monitor drives the video on screen, or the one waiting in Preview
 * (played silently, so the operator can check it). With both, a Live / Preview switch picks.
 */
function VideoControls({
  program,
  preview,
}: {
  program: MediaLayer | null;
  preview: MediaLayer | null;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState<'program' | 'preview'>('program');
  const target = program && preview ? pick : preview && !program ? 'preview' : 'program';
  return (
    <MediaTransport
      media={target === 'preview' ? preview : program}
      target={target}
      switcher={
        program && preview ? (
          <Segmented<'program' | 'preview'>
            label={t('media.which')}
            value={target}
            onChange={setPick}
            options={[
              { value: 'program', label: t('media.liveLabel') },
              { value: 'preview', label: t('media.previewLabel') },
            ]}
          />
        ) : undefined
      }
    />
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
  const back = (layer: RestorableLayer) => () => void restoreLayer(layer);
  const cleared = live.cleared;
  // "Romans 8:36–38 + background", for the power button's tooltip.
  const offSummary = (cleared.off?.layers ?? [])
    .map((l) =>
      l === 'content'
        ? (cleared.content?.content?.label ?? t('monitor.layers.slide'))
        : t(`monitor.layers.${l}`).toLowerCase(),
    )
    .join(' + ');
  const clearedMedia = cleared.media
    ? media.find((m) => m.id === cleared.media?.mediaId)?.name
    : undefined;
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
            <Typography size={11} tone="muted" truncate>
              {p.content?.label ?? mediaName ?? ''}
            </Typography>
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
                <IconButton
                  size="2xs"
                  active
                  activeTone="live"
                  aria-label={`${t('monitor.clearAll')} (${displayCombo(keys.clearAll)})`}
                  onClick={() => void clearLayer('all')}
                  className="!rounded-full"
                >
                  <Power size={13} strokeWidth={2.5} />
                </IconButton>
              ) : cleared.off ? (
                // After Turn off live, the power button brings everything back (mouse only).
                <IconButton
                  size="2xs"
                  variant="quiet"
                  aria-label={t('monitor.restoreAll')}
                  title={`${t('monitor.restoreAll')}: ${offSummary}`}
                  onClick={() => void restoreAll()}
                  className="!rounded-full !text-[var(--tally-program)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tally-program)_70%,transparent)]"
                >
                  <Power size={13} strokeWidth={2.5} />
                </IconButton>
              ) : (
                <Typography
                  tone="muted"
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
                >
                  <Power size={12} />
                </Typography>
              )}
              <LayerButton
                icon={<MessageSquareText size={14} />}
                label={t('monitor.layers.messages')}
                on={has('messages')}
                onClick={clear('messages')}
                restorable={!!cleared.messages}
                restoreWhat={
                  cleared.messages?.length
                    ? t('monitor.restoreCount', { count: cleared.messages.length })
                    : undefined
                }
                onRestore={back('messages')}
              />
              <LayerButton
                icon={<Sparkle size={14} />}
                label={t('monitor.layers.props')}
                on={has('props')}
                onClick={clear('props')}
                restorable={!!cleared.props}
                restoreWhat={
                  cleared.props?.length
                    ? t('monitor.restoreCount', { count: cleared.props.length })
                    : undefined
                }
                onRestore={back('props')}
              />
              <LayerButton
                icon={<Type size={14} />}
                label={t('monitor.layers.slide')}
                hint={displayCombo(keys.clearContent)}
                on={!!p.content}
                onClick={clear('content')}
                restorable={!!cleared.content}
                restoreWhat={
                  cleared.content?.content?.label ??
                  (cleared.content?.web ? urlHost(cleared.content.web.url) : undefined)
                }
                onRestore={back('content')}
              />
              <LayerButton
                icon={<Film size={14} />}
                label={t('monitor.layers.media')}
                hint={displayCombo(keys.clearMedia)}
                on={!!p.media || !!p.web}
                onClick={clear('media')}
                restorable={!!cleared.media}
                restoreWhat={clearedMedia}
                onRestore={back('media')}
              />
              <LayerButton
                icon={<ImageIcon size={14} />}
                label={t('monitor.layers.background')}
                hint={displayCombo(keys.clearBackground)}
                on={!!p.background}
                onClick={clear('background')}
                restorable={!!cleared.background}
                restoreWhat={undefined}
                onRestore={back('background')}
              />
              <LayersMenu />
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
        <VideoControls
          program={p.media?.kind === 'video' ? p.media : null}
          preview={live.preview.media?.kind === 'video' ? live.preview.media : null}
        />
      </div>
      <ShowControls />
    </div>
  );
}
