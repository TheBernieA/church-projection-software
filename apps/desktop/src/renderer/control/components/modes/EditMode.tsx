import { Globe, MousePointerClick, PencilOff, Shapes, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInService, useSelectedItem } from '../../lib/hooks';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditorInline } from '../SongEditor';
import { SoonFeature } from '../Soon';
import { EmptyState } from '../EmptyState';

/** Editing tools that are on the way, shown where they will live. */
function SoonTools() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--hairline)] px-3 py-1.5">
      <SoonFeature id="objects" icon={<Shapes size={14} />} />
      <SoonFeature id="effects" icon={<Wand2 size={14} />} />
      <SoonFeature id="web-content" icon={<Globe size={14} />} />
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
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SoonTools />
        <div className="flex min-h-0 flex-1">
          <SlideGrid purpose="edit" />
          <SlideInspector />
        </div>
      </div>
    );
  }
  return (
    <EmptyState
      icon={<PencilOff size={28} />}
      title={t('modes.nothingToEdit')}
      body={item.kind === 'scripture' ? t('modes.scriptureEditHint') : undefined}
    />
  );
}
