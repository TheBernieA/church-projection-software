import { Globe, MousePointerClick, PencilOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInService, useSelectedItem } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import type { TextItem } from '../../lib/objects';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import { Filmstrip } from '../canvas/Filmstrip';
import { SlideCanvas } from '../canvas/SlideCanvas';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditorInline } from '../SongEditor';
import { SoonFeature } from '../Soon';
import { EmptyState } from '../EmptyState';

/** Editing tools that are on the way, shown where they will live. */
function SoonTools() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--hairline)] px-3 py-1.5">
      <SoonFeature id="web-content" icon={<Globe size={14} />} />
    </div>
  );
}

/** Text slides: canvas for the chosen slide, tools above, slides below, properties beside. */
function CanvasEditor({ item }: { item: TextItem }) {
  const cursor = useStore((s) => s.editCursor);
  const index = cursor?.itemId === item.id ? Math.min(cursor.index, item.slides.length - 1) : 0;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <CanvasToolbar item={item} index={index} />
        <SoonTools />
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4">
          <div className="w-full max-w-[1100px]">
            <SlideCanvas item={item} index={index} />
          </div>
        </div>
        <Filmstrip item={item} index={index} />
      </div>
      <SlideInspector />
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
  if (item.kind === 'song') return <SongEditorInline songId={item.songId} />;
  if (item.kind === 'presentation' || item.kind === 'announcements' || item.kind === 'countdown') {
    if (!inService)
      return <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />;
    if (item.kind === 'countdown')
      return (
        <div className="flex min-h-0 flex-1">
          <SlideGrid purpose="edit" />
          <SlideInspector />
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
