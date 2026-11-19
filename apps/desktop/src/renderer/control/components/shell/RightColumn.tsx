import { useMemo, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Church,
  Film,
  Image as ImageIcon,
  Megaphone,
  PanelBottom,
  Pencil,
  MessageSquareText,
  Play,
  Snowflake,
  Sparkle,
  Square,
  Type,
  Power,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  applyLook,
  lookLayersFor,
  maskForRole,
  makeScene,
  overlayGroup,
  sceneIsVisible,
  themeAligned,
  themeAlignOf,
  withWordsTheme,
  type Layer,
  type MediaLayer,
  type RestorableLayer,
  type Scene,
  type Standby,
  type Theme,
} from '@lampstand/core';
import {
  Button,
  Kbd,
  TallyLabel,
  Typography,
  IconButton,
  typographyClass,
  Segmented,
  Switch,
} from '@lampstand/ui';
import {
  clearLayer,
  goLive,
  restoreAll,
  restoreLayer,
  setLowerThird,
  toggleMask,
} from '../../lib/actions';
import { lowerThirdThemes } from '../../lib/slides';
import {
  LT_ALIGN_KEY,
  LT_THEME_KEY,
  remember,
  remembered,
  type Align,
} from '../../lib/screenScenes';
import { ScreenScenes } from './ScreenScenes';
import { useHasMainOutput, useLiveEdited, useStandby } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { useStore } from '../../lib/store';
import { MediaTransport } from '../MediaTransport';
import { SceneView } from '../SceneView';
import { LayerStrip, type StripLayer } from './LayerStrip';
import { CameraSwitcher } from '../media/CameraSwitcher';
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
 * Lower third on the audience screens: a switch, the theme it uses and where it sits. On, every
 * slide's words are drawn along the bottom in that theme (over a camera or a video) until it is
 * switched off. The theme and position are remembered for next time.
 */
function LowerThirdRow() {
  const { t } = useTranslation();
  const current = useStore((s) => s.live?.lowerThird ?? null);
  const themes = useStore((s) => s.themes);
  const choices = useMemo(() => lowerThirdThemes(themes), [themes]);
  const [themeId, setThemeId] = useState<string | null>(() => remembered(LT_THEME_KEY));
  const [align, setAlign] = useState<Align | null>(() => {
    const a = remembered(LT_ALIGN_KEY);
    return a === 'left' || a === 'center' || a === 'right' ? a : null;
  });
  // What's on screen wins over what was remembered (another window may have set it).
  const theme = choices.find((th) => th.id === (current?.id ?? themeId)) ?? choices[0] ?? null;
  const position: Align = current
    ? themeAlignOf(current)
    : (align ?? (theme ? themeAlignOf(theme) : 'center'));
  if (!theme) return null;
  const apply = (th: Theme, a: Align): void => void setLowerThird(themeAligned(th, a));
  return (
    <section
      aria-label={t('monitor.lowerThird')}
      className={`flex flex-col gap-2 rounded-[var(--radius-control)] px-2.5 py-2 ${
        current ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <PanelBottom
          size={14}
          aria-hidden
          className={current ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}
        />
        <div className="min-w-0 flex-1">
          <Typography as="p" size={12} weight="semibold" tone="primary">
            {t('monitor.lowerThird')}
          </Typography>
          <Typography as="p" size={11} tone="muted" truncate>
            {current ? t('monitor.lowerThirdOn') : t('monitor.lowerThirdHelp')}
          </Typography>
        </div>
        <Switch
          label={t('monitor.lowerThird')}
          checked={!!current}
          onChange={(on) => (on ? apply(theme, position) : void setLowerThird(null))}
        />
      </div>
      {current && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select<string>
              size="sm"
              aria-label={t('monitor.lowerThirdTheme')}
              value={theme.id}
              onChange={(id) => {
                const next = choices.find((th) => th.id === id);
                if (!next) return;
                // A new theme starts where it was designed to sit.
                const a = themeAlignOf(next);
                setThemeId(id);
                setAlign(a);
                remember(LT_THEME_KEY, id);
                remember(LT_ALIGN_KEY, a);
                apply(next, a);
              }}
              options={choices.map((th) => ({ value: th.id, label: th.name }))}
            />
          </div>
          <Segmented<Align>
            label={t('monitor.lowerThirdPosition')}
            value={position}
            onChange={(a) => {
              setAlign(a);
              remember(LT_ALIGN_KEY, a);
              apply(theme, a);
            }}
            options={[
              {
                value: 'left',
                label: '',
                name: t('streaming.align.left'),
                icon: <AlignLeft size={14} />,
              },
              {
                value: 'center',
                label: '',
                name: t('streaming.align.center'),
                icon: <AlignCenter size={14} />,
              },
              {
                value: 'right',
                label: '',
                name: t('streaming.align.right'),
                icon: <AlignRight size={14} />,
              },
            ]}
          />
        </div>
      )}
    </section>
  );
}

/** The live slide was edited: say so, and put the new version up only when asked. */
function LiveEditedBar() {
  const { t } = useTranslation();
  const { edited, update } = useLiveEdited();
  if (!edited) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-soft)] py-1.5 pl-2.5 pr-1.5"
    >
      <Pencil size={13} aria-hidden className="shrink-0 text-[var(--accent)]" />
      <Typography
        size={12}
        weight="medium"
        tone="primary"
        title={t('monitor.liveEditedHelp')}
        className="min-w-0 flex-1"
        truncate
      >
        {t('monitor.liveEdited')}
      </Typography>
      <Button size="xs" variant="primary" onClick={update}>
        {t('monitor.updateLive')}
      </Button>
    </div>
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
  // Only there when there's a video to drive: the height goes to the show controls otherwise.
  if (!program && !preview) return null;
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

  // The Program monitor shows the audience screens' shape (Settings › Screens).
  const audienceMask = useStore((s) => (s.settings ? maskForRole(s.settings, 'main') : null));
  // The Program monitor shows what the audience screens show under the active Look.
  const audienceScene = useMemo(
    () =>
      live
        ? applyLook(withWordsTheme(live.program, live.lowerThird), lookLayersFor(live.look, 'main'))
        : null,
    [live],
  );
  if (!live || !previewScene || !nextScene || !audienceScene) return null;
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
  const stripLayers: StripLayer[] = [
    {
      id: 'messages',
      icon: <MessageSquareText size={14} />,
      label: t('monitor.layers.messages'),
      on: has('messages'),
      onClear: clear('messages'),
      restorable: !!cleared.messages,
      restoreWhat: cleared.messages?.length
        ? t('monitor.restoreCount', { count: cleared.messages.length })
        : undefined,
      onRestore: back('messages'),
    },
    {
      id: 'props',
      icon: <Sparkle size={14} />,
      label: t('monitor.layers.props'),
      on: has('props'),
      onClear: clear('props'),
      restorable: !!cleared.props,
      restoreWhat: cleared.props?.length
        ? t('monitor.restoreCount', { count: cleared.props.length })
        : undefined,
      onRestore: back('props'),
    },
    {
      id: 'announcements',
      icon: <Megaphone size={14} />,
      label: t('monitor.layers.announcements'),
      on: !!p.announcement,
      onClear: clear('announcements'),
      restorable: !!cleared.announcements,
      restoreWhat: cleared.announcements?.label,
      onRestore: back('announcements'),
    },
    {
      id: 'content',
      icon: <Type size={14} />,
      label: t('monitor.layers.slide'),
      hint: displayCombo(keys.clearContent),
      on: !!p.content,
      onClear: clear('content'),
      restorable: !!cleared.content,
      restoreWhat:
        cleared.content?.content?.label ??
        (cleared.content?.web ? urlHost(cleared.content.web.url) : undefined),
      onRestore: back('content'),
    },
    {
      id: 'media',
      icon: <Film size={14} />,
      label: t('monitor.layers.media'),
      hint: displayCombo(keys.clearMedia),
      on: !!p.media || !!p.web || !!p.input,
      onClear: clear('media'),
      restorable: !!cleared.media || !!cleared.input,
      restoreWhat: clearedMedia ?? cleared.input?.label,
      onRestore: back('media'),
    },
    {
      id: 'background',
      icon: <ImageIcon size={14} />,
      label: t('monitor.layers.background'),
      hint: displayCombo(keys.clearBackground),
      on: !!p.background,
      onClear: clear('background'),
      restorable: !!cleared.background,
      onRestore: back('background'),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--divider)] p-2.5">
        <figure className="flex flex-col gap-2">
          <figcaption className="sr-only">{t('monitor.live')}</figcaption>
          {/* What's on air: one line, red while live. */}
          <div
            role="status"
            aria-live="polite"
            className="flex h-5 items-center justify-between gap-3 px-0.5"
          >
            <TallyLabel tone="program" active={onAir}>
              {onAir ? t('top.live').toUpperCase() : t('top.offAirShort')}
            </TallyLabel>
            <Typography size={11} tone="muted" truncate className="min-w-0">
              {p.content?.label ?? mediaName ?? ''}
            </Typography>
          </div>
          <LiveEditedBar />
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {screen === 'audience' ? (
                <div
                  className={`overflow-hidden rounded-[3px] ${onAir ? 'shadow-[var(--tally-program-glow)]' : 'shadow-[0_0_0_1px_var(--hairline-strong)]'}`}
                >
                  <SceneView
                    scene={audienceScene}
                    label={t('monitor.live')}
                    standby={standby}
                    audio={!hasMainOutput}
                    mask={audienceMask}
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
            {/* Layers, top to bottom in the operator's order; each clears just its layer. */}
            <LayerStrip
              power={
                anything ? (
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
                )
              }
              layers={stripLayers}
            />
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
        <ScreenScenes />
        <LowerThirdRow />
        {p.input && <CameraSwitcher />}
        <VideoControls
          program={p.media?.kind === 'video' ? p.media : null}
          preview={live.preview.media?.kind === 'video' ? live.preview.media : null}
        />
      </div>
      <ShowControls />
    </div>
  );
}
