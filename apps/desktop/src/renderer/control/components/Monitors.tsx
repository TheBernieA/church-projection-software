import { useMemo } from 'react';
import {
  Church,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Play,
  Snowflake,
  Square,
  Type,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, sceneIsVisible, type Scene, type Standby } from '@lampstand/core';
import { Button, Kbd, TallyLabel, ToggleChip } from '@lampstand/ui';
import { clearLayer, goLive, toggleMask } from '../lib/actions';
import { useHasMainOutput, useStandby } from '../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../lib/shortcuts';
import { openDialog, useStore } from '../lib/store';
import { MediaTransport } from './MediaTransport';
import { SceneView } from './SceneView';

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
  footer?: React.ReactNode;
  standby?: Standby | null;
  audio?: boolean;
}) {
  const ring =
    tone === 'program'
      ? active
        ? 'shadow-[var(--tally-program-glow)]'
        : 'shadow-[0_0_0_1px_var(--hairline-strong)]'
      : active
        ? 'shadow-[0_0_0_1px_var(--tally-preview)]'
        : 'shadow-[0_0_0_1px_var(--hairline-strong)]';
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      <figcaption className="flex h-5 items-center justify-between gap-2 px-0.5">
        <TallyLabel tone={tone} active={active}>
          {label}
        </TallyLabel>
        {caption && <span className="truncate text-[12px] text-[var(--text-3)]">{caption}</span>}
      </figcaption>
      <div className={`overflow-hidden rounded-[6px] ${ring}`}>
        <SceneView scene={scene} label={label} standby={standby} audio={audio} />
      </div>
      {footer}
    </figure>
  );
}

/** Preview/Program monitors + transport: go live, layer clears, masks, messages. */
export function Monitors() {
  const { t } = useTranslation();
  const live = useStore((s) => s.live);
  const media = useStore((s) => s.media);
  const keys = effectiveShortcuts();
  const standby = useStandby();
  const hasMainOutput = useHasMainOutput();

  const previewScene: Scene | null = useMemo(() => {
    if (!live) return null;
    return makeScene({
      background: live.preview.background ?? live.program.background,
      content: live.preview.content,
      media: live.preview.media ?? null,
    });
  }, [live]);

  if (!live || !previewScene) return null;
  const p = live.program;
  const mediaName = p.media ? media.find((m) => m.id === p.media?.mediaId)?.name : undefined;
  const onAir = sceneIsVisible(p);
  const hasPreview = !!(live.preview.content || live.preview.background || live.preview.media);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div
        className="mx-auto flex w-full max-w-[1400px] gap-4"
        style={{ maxWidth: 'min(1400px, calc((42vh - 40px) * 16 / 9 * 2 + 16px))' }}
      >
        <MonitorCard
          tone="preview"
          label={t('monitor.preview')}
          scene={previewScene}
          active={hasPreview}
          caption={live.preview.content?.label ?? (hasPreview ? '' : t('monitor.empty'))}
        />
        <MonitorCard
          tone="program"
          label={t('monitor.program')}
          scene={p}
          active={onAir}
          caption={p.content?.label ?? mediaName ?? (onAir ? '' : t('monitor.offAir'))}
          footer={p.media?.kind === 'video' ? <MediaTransport media={p.media} /> : undefined}
          standby={standby}
          audio={!hasMainOutput}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="live"
          size="lg"
          className="min-w-[180px]"
          onClick={() => void goLive('ui')}
          disabled={!hasPreview}
          icon={<Play size={18} fill="currentColor" />}
        >
          {t('monitor.goLive')}
          <Kbd tone="onColor">{displayCombo(keys.goLive)}</Kbd>
        </Button>

        <div
          role="group"
          aria-label={t('monitor.clear')}
          className="flex items-center gap-1 rounded-[10px] bg-[var(--surface-0)] p-1 shadow-[inset_0_0_0_1px_var(--hairline)]"
        >
          <ClearButton
            icon={<Type size={16} />}
            label={t('monitor.clearContent')}
            k={keys.clearContent}
            onClick={() => void clearLayer('content')}
            disabled={!p.content}
          />
          <ClearButton
            icon={<Film size={16} />}
            label={t('monitor.clearMedia')}
            k={keys.clearMedia}
            onClick={() => void clearLayer('media')}
            disabled={!p.media}
          />
          <ClearButton
            icon={<ImageIcon size={16} />}
            label={t('monitor.clearBackground')}
            k={keys.clearBackground}
            onClick={() => void clearLayer('background')}
            disabled={!p.background}
          />
          <ClearButton
            icon={<Layers size={16} />}
            label={t('monitor.clearOverlays')}
            k={keys.clearOverlays}
            onClick={() => void clearLayer('overlays')}
            disabled={!p.overlays.length}
          />
        </div>

        <div role="group" aria-label={t('monitor.masks')} className="flex items-center gap-1.5">
          <ToggleChip
            on={p.masks.black}
            onClick={() => void toggleMask('black')}
            icon={<Square size={15} fill="currentColor" />}
            label={t('monitor.black')}
            hint={displayCombo(keys.black)}
          />
          <ToggleChip
            on={p.masks.logo}
            onClick={() => void toggleMask('logo')}
            icon={<Church size={15} />}
            label={t('monitor.logo')}
            hint={displayCombo(keys.logo)}
          />
          <ToggleChip
            on={p.masks.freeze}
            onClick={() => void toggleMask('freeze')}
            icon={<Snowflake size={15} />}
            label={t('monitor.freeze')}
            hint={displayCombo(keys.freeze)}
          />
        </div>

        <Button
          variant="subtle"
          size="md"
          className="ml-auto"
          onClick={() => openDialog('messages')}
          icon={
            live.stageMessage || p.overlays.length ? (
              <Clapperboard size={16} className="text-[var(--accent)]" />
            ) : (
              <MessageSquare size={16} />
            )
          }
        >
          {t('monitor.messages')}
        </Button>
      </div>
    </div>
  );
}

function ClearButton({
  icon,
  label,
  k,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  k: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${displayCombo(k)})`}
      aria-label={label}
      className="group relative flex h-9 cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--text-3)] disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {icon}
      <span className="text-[11px] text-[var(--text-3)]">{displayCombo(k)}</span>
    </button>
  );
}
