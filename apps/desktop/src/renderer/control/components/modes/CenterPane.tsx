import { Suspense } from 'react';
import { lazyNamed } from '../../lib/lazy';
import { useStore } from '../../lib/store';
import { SlideGrid } from '../SlideGrid';

// Show is the startup workspace; the others load the first time they're opened.
const BibleMode = lazyNamed(() => import('./BibleMode'), 'BibleMode');
const EditMode = lazyNamed(() => import('./EditMode'), 'EditMode');
const ReflowMode = lazyNamed(() => import('./ReflowMode'), 'ReflowMode');
const StageMode = lazyNamed(() => import('./StageMode'), 'StageMode');
const ThemesMode = lazyNamed(() => import('./ThemesMode'), 'ThemesMode');

/** The centre pane shows the workspace picked in the toolbar. */
export function CenterPane() {
  const mode = useStore((s) => s.mode);
  if (mode === 'show') return <SlideGrid />;
  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      {mode === 'edit' && <EditMode />}
      {mode === 'reflow' && <ReflowMode />}
      {mode === 'bible' && <BibleMode />}
      {mode === 'themes' && <ThemesMode />}
      {mode === 'stage' && <StageMode />}
    </Suspense>
  );
}
