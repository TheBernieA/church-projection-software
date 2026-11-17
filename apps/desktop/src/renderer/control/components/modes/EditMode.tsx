import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  PencilOff,
  Rows3,
} from 'lucide-react';
import { Button, IconButton, TallyTag, Typography } from '@lampstand/ui';
import { useTranslation } from 'react-i18next';
import { useInService, useSelectedItem } from '../../lib/hooks';
import { KindTile } from '../kindIcons';
import { useStore } from '../../lib/store';
import { selectSlide } from '../../lib/textSlides';
import type {} from '../../lib/objects';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import { Filmstrip } from '../canvas/Filmstrip';
import { SlideCanvas } from '../canvas/SlideCanvas';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditorInline } from '../SongEditor';
import { EmptyState } from '../EmptyState';
import { WebEditor } from './WebEditor';
import { usePaneSize } from '../shell/Splitter';
import { type TextItem } from '../../types';

/** Whether the Edit workspace's right-hand inspector is showing (remembered between sessions). */
function useInspector() {
  const pane = usePaneSize('editInspector', 1, 0, 1);
  const open = pane.size === 1;
  return { open, toggle: () => pane.commit(open ? 0 : 1) };
}

/** Show/hide button for the inspector. */
function InspectorToggle({ open, toggle }: { open: boolean; toggle: () => void }) {
  const { t } = useTranslation();
  const label = open ? t('canvas.hideInspector') : t('canvas.showInspector');
  return (
    <IconButton size="sm" aria-label={label} title={label} aria-expanded={open} onClick={toggle}>
      {open ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
    </IconButton>
  );
}

/**
 * The canvas at the largest 16:9 size that fits the stage, so the whole slide is always in view
 * (no scrolling to reach its bottom edge).
 */
function useFit(pad: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (): void =>
      setWidth(
        Math.max(240, Math.min(el.clientWidth - pad * 2, ((el.clientHeight - pad * 2) * 16) / 9)),
      );
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pad]);
  return [ref, width];
}

/**
 * What is being edited, and how it stands: the item, which slide of how many (with previous and
 * next), whether that slide is on screen, then the way to edit
 * all the words at once and the inspector.
 */
function EditorHeader({
  item,
  index,
  inspector,
}: {
  item: TextItem;
  index: number;
  inspector: ReturnType<typeof useInspector>;
}) {
  const { t } = useTranslation();
  const total = item.slides.length;
  const live = useStore((s) => s.liveCursor?.itemId === item.id && s.liveCursor.index === index);
  const title = item.kind === 'presentation' ? item.title : t('service.kind.announcements');
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-3">
      <KindTile kind={item.kind} size={24} />
      <div className="min-w-0">
        <Typography as="h2" size={14} weight="semibold" tone="primary" truncate>
          {title}
        </Typography>
      </div>
      <div className="flex items-center gap-0.5 rounded-[8px] bg-[var(--surface-2)] p-0.5 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <IconButton
          size="xs"
          aria-label={t('canvas.prevSlide')}
          title={t('canvas.prevSlide')}
          disabled={index <= 0}
          onClick={() => selectSlide(item, index - 1)}
        >
          <ChevronLeft size={15} />
        </IconButton>
        <Typography size={12} weight="semibold" tone="secondary" tabular className="px-1.5">
          {t('canvas.slideOf', { n: index + 1, total })}
        </Typography>
        <IconButton
          size="xs"
          aria-label={t('canvas.nextSlide')}
          title={t('canvas.nextSlide')}
          disabled={index >= total - 1}
          onClick={() => selectSlide(item, index + 1)}
        >
          <ChevronRight size={15} />
        </IconButton>
      </div>
      {live && (
        <TallyTag tone="program" className="!static">
          LIVE
        </TallyTag>
      )}
      <span className="flex-1" />
      <Button
        size="sm"
        variant="ghost"
        icon={<Rows3 size={14} />}
        title={t('canvas.reflowHint')}
        onClick={() => useStore.setState({ mode: 'reflow' })}
      >
        {t('canvas.reflow')}
      </Button>
      <InspectorToggle {...inspector} />
    </header>
  );
}

/**
 * Text slides: the slide on a stage, fitted to the space, with the tools floating above it;
 * the slides in a strip below; properties beside.
 */
function CanvasEditor({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  const inspector = useInspector();
  const cursor = useStore((s) => s.editCursor);
  const index = cursor?.itemId === item.id ? Math.min(cursor.index, item.slides.length - 1) : 0;
  const [stage, width] = useFit(28);
  // Page Up / Page Down step through the slides being edited (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || (e.key !== 'PageUp' && e.key !== 'PageDown')) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable
      )
        return;
      e.preventDefault();
      selectSlide(item, index + (e.key === 'PageDown' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, index]);
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <EditorHeader item={item} index={index} inspector={inspector} />
        <div className="flex shrink-0 justify-center bg-[var(--surface-0)] pt-3">
          <CanvasToolbar item={item} index={index} />
        </div>
        {/* The stage: a quiet dotted ground, the slide centred on it with a soft shadow. */}
        <div
          ref={stage}
          onPointerDown={(e) => {
            // A click on the stage around the slide lets go of the selected object.
            if (e.target === e.currentTarget) useStore.setState({ editObjectId: null });
          }}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--surface-0)] bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1px)] [background-size:18px_18px]"
        >
          <div
            style={{ width: width || undefined }}
            className="rounded-[6px] shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_0_1px_var(--hairline-strong)]"
          >
            <SlideCanvas item={item} index={index} />
          </div>
          <Typography
            size={11}
            tone="muted"
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap"
          >
            {t('canvas.hint')}
          </Typography>
        </div>
        <Filmstrip item={item} index={index} />
      </div>
      {inspector.open && <SlideInspector />}
    </div>
  );
}

/** Edit workspace: the selected item's editor, in place. */
export function EditMode() {
  const { t } = useTranslation();
  const inspector = useInspector();
  const item = useSelectedItem();
  const inService = useInService(item);
  if (!item)
    return <EmptyState icon={<MousePointerClick size={28} />} title={t('modes.pickItem')} />;
  if (item.kind === 'song') return <SongEditorInline songId={item.songId} />;
  if (item.kind === 'web')
    return inService ? (
      <WebEditor key={item.id} item={item} />
    ) : (
      <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />
    );
  if (item.kind === 'presentation' || item.kind === 'announcements' || item.kind === 'countdown') {
    if (!inService)
      return <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />;
    if (item.kind === 'countdown')
      return (
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <SlideGrid purpose="edit" />
            <div className="absolute right-2 top-2 z-10">
              <InspectorToggle {...inspector} />
            </div>
          </div>
          {inspector.open && <SlideInspector />}
        </div>
      );
    return <CanvasEditor item={item} />;
  }
  return (
    <EmptyState
      icon={<PencilOff size={28} />}
      title={t('modes.nothingToEdit')}
      body={item.kind === 'scripture' ? t('modes.scriptureEditHint') : undefined}
    />
  );
}
