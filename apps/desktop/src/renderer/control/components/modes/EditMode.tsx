import { MousePointerClick, PencilOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInService, useSelectedItem, useSize } from '../../lib/hooks';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditor } from '../song/SongEditor';
import { EmptyState } from '../EmptyState';
import { WebEditor } from './WebEditor';
import { ExpandToggle, InspectorToggle, useInspector } from '../canvas/editorParts';
import { TextSlideEditor } from '../canvas/TextSlideEditor';

/** A countdown: its slides, with the inspector beside (or over them, when narrow). */
function CountdownEditor() {
  const [root, size] = useSize();
  const inspector = useInspector(size.width);
  return (
    <div ref={root} className="@container relative flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <SlideGrid purpose="edit" />
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <ExpandToggle />
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
    return <TextSlideEditor key={item.id} item={item} />;
  }
  return (
    <EmptyState
      icon={<PencilOff size={28} />}
      title={t('modes.nothingToEdit')}
      body={item.kind === 'scripture' ? t('modes.scriptureEditHint') : undefined}
    />
  );
}
