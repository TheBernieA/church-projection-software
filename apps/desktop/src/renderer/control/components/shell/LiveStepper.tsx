import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Scene } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { goLiveSlide, step } from '../../lib/actions';
import { useItemSlides } from '../../lib/hooks';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { thumbScene } from '../../lib/slideThumbs';
import { itemIn, useStore } from '../../lib/store';
import { SceneView } from '../SceneView';

/** A neighbouring slide, small: click it to show it; hovering it (or focus) shows it large. */
function Neighbour({
  scene,
  label,
  onShow,
  onZoom,
}: {
  scene: Scene | null;
  label: string;
  onShow: () => void;
  onZoom: (on: boolean) => void;
}) {
  if (!scene) return <span aria-hidden className="aspect-video w-[64px] shrink-0" />;
  return (
    <Button
      variant="bare"
      aria-label={label}
      title={label}
      onClick={onShow}
      onPointerEnter={() => onZoom(true)}
      onPointerLeave={() => onZoom(false)}
      onFocus={() => onZoom(true)}
      onBlur={() => onZoom(false)}
      className="block w-[64px] shrink-0 cursor-pointer overflow-hidden rounded-[3px] opacity-80 shadow-[0_0_0_1px_var(--hairline-strong)] transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)]"
    >
      <SceneView scene={scene} mode="thumbnail" />
    </Button>
  );
}

/**
 * Under the live monitor: step to the previous or next slide of what's on screen (the stream
 * follows when it shows the screens), with the slides either side, small, to click or hover.
 * Only there while a slide from an item is live.
 */
export function LiveStepper() {
  const { t } = useTranslation();
  const cursor = useStore((s) => s.liveCursor);
  const item = useStore((s) => itemIn(s, cursor?.itemId));
  useStore((s) => s.settings?.shortcuts); // the key hints follow a remapped shortcut
  const { slides } = useItemSlides(item);
  const index = cursor && item && cursor.itemId === item.id ? cursor.index : -1;
  const prev = index > 0 ? slides[index - 1] : undefined;
  const next = index >= 0 ? slides[index + 1] : undefined;
  const prevScene = useMemo(() => (prev ? thumbScene(prev) : null), [prev]);
  const nextScene = useMemo(() => (next ? thumbScene(next) : null), [next]);
  /** Which neighbour is shown large (hovered or focused). */
  const [zoom, setZoom] = useState<'previous' | 'next' | null>(null);
  const zoomed = zoom === 'previous' ? prev : zoom === 'next' ? next : undefined;
  const zoomScene = zoom === 'previous' ? prevScene : zoom === 'next' ? nextScene : null;
  if (!item || index < 0 || slides.length < 2) return null;
  const keys = effectiveShortcuts();
  const prevLabel = `${t('monitor.prevSlide')} (${displayCombo(keys.previous)})`;
  const nextLabel = `${t('monitor.nextSlideStep')} (${displayCombo(keys.next)})`;
  return (
    <div
      role="group"
      aria-label={t('monitor.stepper')}
      className="relative flex items-center gap-1.5"
      data-testid="live-stepper"
    >
      {zoomScene && zoomed && (
        // As wide as the monitor, just above the row: big enough to read, never off screen.
        <div
          aria-hidden
          data-testid="live-stepper-zoom"
          className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-[4px] bg-[var(--surface-1)] shadow-[0_0_0_1px_var(--hairline-strong),0_18px_40px_rgba(0,0,0,0.55)]"
        >
          <SceneView scene={zoomScene} mode="thumbnail" />
          <Typography
            size={11}
            weight="semibold"
            tone="secondary"
            truncate
            className="block px-2 py-1"
          >
            {t(zoom === 'next' ? 'monitor.upNext' : 'monitor.before', { label: zoomed.label })}
          </Typography>
        </div>
      )}
      <IconButton
        size="sm"
        aria-label={prevLabel}
        title={prevLabel}
        disabled={!prev}
        onClick={() => void step(-1)}
      >
        <ChevronLeft size={16} />
      </IconButton>
      <Neighbour
        scene={prevScene}
        label={t('monitor.showSlide', { label: prev?.label ?? '' })}
        onShow={() => void goLiveSlide(item, index - 1)}
        onZoom={(on) => setZoom(on ? 'previous' : null)}
      />
      <Typography
        size={11}
        tone="muted"
        tabular
        title={t('canvas.slideOf', { n: index + 1, total: slides.length })}
        className="min-w-0 flex-1 whitespace-nowrap text-center"
      >
        {t('monitor.position', { n: index + 1, total: slides.length })}
      </Typography>
      <Neighbour
        scene={nextScene}
        label={t('monitor.showSlide', { label: next?.label ?? '' })}
        onShow={() => void goLiveSlide(item, index + 1)}
        onZoom={(on) => setZoom(on ? 'next' : null)}
      />
      <IconButton
        size="sm"
        aria-label={nextLabel}
        title={nextLabel}
        disabled={!next}
        onClick={() => void step(1)}
      >
        <ChevronRight size={16} />
      </IconButton>
    </div>
  );
}
