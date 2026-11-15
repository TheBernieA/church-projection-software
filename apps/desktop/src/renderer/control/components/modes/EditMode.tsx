import { MousePointerClick, PencilOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelectedItem } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditorInline } from '../SongEditor';
import { EmptyState } from './EmptyState';

/** Edit workspace: the selected item's editor, in place. */
export function EditMode() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const inService = useStore((s) => !!item && !!s.service?.items.some((x) => x.id === item.id));
  if (!item)
    return <EmptyState icon={<MousePointerClick size={28} />} title={t('modes.pickItem')} />;
  if (item.kind === 'song') return <SongEditorInline songId={item.songId} />;
  if (item.kind === 'presentation' || item.kind === 'announcements' || item.kind === 'countdown') {
    if (!inService)
      return <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />;
    return (
      <div className="flex min-h-0 flex-1">
        <SlideGrid purpose="edit" />
        <SlideInspector />
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
