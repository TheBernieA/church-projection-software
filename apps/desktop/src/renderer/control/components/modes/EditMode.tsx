import {
  Globe,
  Guitar,
  Languages,
  MousePointerClick,
  PencilOff,
  Shapes,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelectedItem } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { SlideGrid } from '../SlideGrid';
import { SlideInspector } from '../SlideInspector';
import { SongEditorInline } from '../SongEditor';
import { SoonFeature } from '../Soon';
import { EmptyState } from './EmptyState';

/** Editing tools that are on the way, shown where they will live. */
function SoonTools({ song }: { song: boolean }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--hairline)] px-3 py-1.5">
      {song ? (
        <>
          <SoonFeature id="chords" icon={<Guitar size={14} />} />
          <SoonFeature id="bilingual" icon={<Languages size={14} />} />
        </>
      ) : (
        <>
          <SoonFeature id="objects" icon={<Shapes size={14} />} />
          <SoonFeature id="effects" icon={<Wand2 size={14} />} />
          <SoonFeature id="web-content" icon={<Globe size={14} />} />
        </>
      )}
    </div>
  );
}

/** Edit workspace: the selected item's editor, in place. */
export function EditMode() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const inService = useStore((s) => !!item && !!s.service?.items.some((x) => x.id === item.id));
  if (!item)
    return <EmptyState icon={<MousePointerClick size={28} />} title={t('modes.pickItem')} />;
  if (item.kind === 'song')
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SoonTools song />
        <SongEditorInline songId={item.songId} />
      </div>
    );
  if (item.kind === 'presentation' || item.kind === 'announcements' || item.kind === 'countdown') {
    if (!inService)
      return <EmptyState icon={<PencilOff size={28} />} title={t('modes.addToEdit')} />;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SoonTools song={false} />
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
