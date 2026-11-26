import { Suspense } from 'react';
import { lazyNamed } from '../../lib/lazy';
import { useStore } from '../../lib/store';
import { SlideGrid } from '../SlideGrid';
import { PlaylistView } from '../show/PlaylistView';

// Show is the startup workspace; the others load the first time they're opened.
const BibleMode = lazyNamed(() => import('./BibleMode'), 'BibleMode');
const CameraMode = lazyNamed(() => import('../cameras/CameraMode'), 'CameraMode');
const EditMode = lazyNamed(() => import('./EditMode'), 'EditMode');
const ReflowMode = lazyNamed(() => import('./ReflowMode'), 'ReflowMode');
const StageMode = lazyNamed(() => import('./StageMode'), 'StageMode');
const ThemesMode = lazyNamed(() => import('./ThemesMode'), 'ThemesMode');

/** The centre pane shows the workspace picked in the toolbar. */
export function CenterPane() {
  const mode = useStore((s) => s.mode);
  // A library pick (ad hoc) shows on its own; otherwise Show is the whole playlist on one page.
  const adhoc = useStore((s) => !!s.adhoc && s.adhoc.id === s.selectedItemId);
  const hasService = useStore((s) => !!s.service);
  if (mode === 'show') return adhoc || !hasService ? <SlideGrid /> : <PlaylistView />;
  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      {mode === 'edit' && <EditMode />}
      {mode === 'reflow' && <ReflowMode />}
      {mode === 'bible' && <BibleMode />}
      {mode === 'cameras' && <CameraMode />}
      {mode === 'themes' && <ThemesMode />}
      {mode === 'stage' && <StageMode />}
    </Suspense>
  );
}
