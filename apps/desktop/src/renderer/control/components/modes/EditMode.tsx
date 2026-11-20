import { MousePointerClick, PencilOff } from 'lucide-react';
import { TallyTag } from '@lampstand/ui';
import { useTranslation } from 'react-i18next';
import { useInService, useSelectedItem, useSize } from '../../lib/hooks';
import { KindTile } from '../kindIcons';
import { LoopToggle } from '../LoopToggle';
import { useStore } from '../../lib/store';
import { selectSlide } from '../../lib/textSlides';
import type {} from '../../lib/objects';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import { Filmstrip } from '../canvas/Filmstrip';
import { SlideCanvas } from '../canvas/SlideCanvas';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditor } from '../song/SongEditor';
import { EmptyState } from '../EmptyState';
import { WebEditor } from './WebEditor';
import {
  EditorBar,
  InspectorToggle,
  SlideStage,
  useFit,
  useInspector,
  usePageKeys,
} from '../canvas/editorParts';
import { type TextItem } from '../../types';

/** A text item's header: the slide stepper, whether the slide is on screen, and looping. */
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
  const live = useStore((s) => s.liveCursor?.itemId === item.id && s.liveCursor.index === index);
  return (
    <EditorBar
      icon={<KindTile kind={item.kind} size={24} />}
      title={item.kind === 'presentation' ? item.title : t('service.kind.announcements')}
      index={index}
      total={item.slides.length}
      onStep={(i) => selectSlide(item, i)}
      inspector={inspector}
    >
      {live && (
        <TallyTag tone="program" className="!static">
          LIVE
        </TallyTag>
      )}
      <LoopToggle item={item} />
    </EditorBar>
  );
}

/**
 * Text slides: the slide on a stage, fitted to the space, with the tools floating above it;
 * the slides in a strip below; properties beside.
 */
function CanvasEditor({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  const [root, size] = useSize();
  const inspector = useInspector(size.width);
  const cursor = useStore((s) => s.editCursor);
  const index = cursor?.itemId === item.id ? Math.min(cursor.index, item.slides.length - 1) : 0;
  const [stage, width] = useFit(28);
  usePageKeys(index, (i) => selectSlide(item, i));
  return (
    <div ref={root} className="@container relative flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <EditorHeader item={item} index={index} inspector={inspector} />
        <div className="flex shrink-0 justify-center-safe overflow-x-auto bg-[var(--surface-0)] px-2 pt-3">
          <CanvasToolbar item={item} index={index} />
        </div>
        <SlideStage
          stageRef={stage}
          width={width}
          // A click on the stage around the slide lets go of the selected object.
          onBackgroundPointerDown={() => useStore.setState({ editObjectId: null })}
          hint={t('canvas.hint')}
        >
          <SlideCanvas item={item} index={index} />
        </SlideStage>
        <Filmstrip item={item} index={index} />
      </div>
      {inspector.open && <SlideInspector />}
    </div>
  );
}

/** A countdown: its slides, with the inspector beside (or over them, when narrow). */
function CountdownEditor() {
  const [root, size] = useSize();
  const inspector = useInspector(size.width);
  return (
    <div ref={root} className="@container relative flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <SlideGrid purpose="edit" />
        <div className="absolute right-2 top-2 z-10">
          <InspectorToggle {...inspector} />
        </div>
      </div>
      {inspector.open && <SlideInspector />}
    </div>
  );
}

/** Edit workspace: the selected item's editor, in place. */
export function EditMode() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const inService = useInService(item);
  if (!item)
    return <EmptyState icon={<MousePointerClick size={28} />} title={t('modes.pickItem')} />;
  if (item.kind === 'song') return <SongEditor key={item.id} item={item} />;
  if (item.kind === 'web')
    return inService ? (
      <WebEditor key={item.id} item={item} />
    ) : (
      <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />
    );
  if (item.kind === 'presentation' || item.kind === 'announcements' || item.kind === 'countdown') {
    if (!inService)
      return <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />;
    if (item.kind === 'countdown') return <CountdownEditor />;
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
