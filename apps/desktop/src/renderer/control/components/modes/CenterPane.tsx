import { useStore } from '../../lib/store';
import { SlideGrid } from '../SlideGrid';
import { BibleMode } from './BibleMode';
import { EditMode } from './EditMode';
import { ReflowMode } from './ReflowMode';
import { StageMode } from './StageMode';
import { ThemesMode } from './ThemesMode';

/** The centre pane shows the workspace picked in the toolbar. */
export function CenterPane() {
  const mode = useStore((s) => s.mode);
  if (mode === 'edit') return <EditMode />;
  if (mode === 'reflow') return <ReflowMode />;
  if (mode === 'bible') return <BibleMode />;
  if (mode === 'themes') return <ThemesMode />;
  if (mode === 'stage') return <StageMode />;
  return <SlideGrid />;
}
