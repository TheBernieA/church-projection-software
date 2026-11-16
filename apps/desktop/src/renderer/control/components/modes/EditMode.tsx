import { useEffect } from 'react';
import { MousePointerClick, PanelRightClose, PanelRightOpen, PencilOff, Rows3 } from 'lucide-react';
import { Button, IconButton } from '@lampstand/ui';
import { useTranslation } from 'react-i18next';
import { useInService, useSelectedItem } from '../../lib/hooks';
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

/** Text slides: canvas for the chosen slide, tools above, slides below, properties beside. */
function CanvasEditor({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  const inspector = useInspector();
  const cursor = useStore((s) => s.editCursor);
  const index = cursor?.itemId === item.id ? Math.min(cursor.index, item.slides.length - 1) : 0;
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
  const reflow = (
    <Button
      size="sm"
      variant="ghost"
      icon={<Rows3 size={14} />}
      title={t('canvas.reflowHint')}
      onClick={() => useStore.setState({ mode: 'reflow' })}
    >
      {t('canvas.reflow')}
    </Button>
  );
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <CanvasToolbar
          item={item}
          index={index}
          trailing={
            <>
              {reflow}
              <InspectorToggle {...inspector} />
            </>
          }
        />
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4">
          <div className="w-full max-w-[1100px]">
            <SlideCanvas item={item} index={index} />
          </div>
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
