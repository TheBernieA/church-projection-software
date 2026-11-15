import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { installShortcuts } from './lib/shortcuts';
import { useStore } from './lib/store';
import { CenterPane } from './components/modes/CenterPane';
import { OutputsDialog } from './components/OutputsDialog';
import { PerfHud } from './components/PerfHud';
import { QuickBar } from './components/QuickBar';
import { ServicesDialog } from './components/ServicesDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Bin } from './components/shell/Bin';
import { LeftSidebar } from './components/shell/LeftSidebar';
import { RightColumn } from './components/shell/RightColumn';
import { Splitter, usePaneSize } from './components/shell/Splitter';
import { Toolbar } from './components/shell/Toolbar';
import { SongEditor } from './components/SongEditor';
import { ThemeEditor } from './components/ThemeEditor';
import { Toasts } from './components/Toasts';

/**
 * Control window, "Show workspace" layout:
 *   toolbar
 *   library + service plan │ workspace (Show/Edit/Reflow/Bible/Themes/Stage) │ live output,
 *                          │ bin (media, props, messages, timers…)          │ clear stack, masks
 * Pane sizes are draggable and remembered.
 */
export function App() {
  const { t } = useTranslation();
  const uiTheme = useStore((s) => s.settings?.uiTheme ?? 'dark');
  const uiScale = useStore((s) => s.settings?.uiScale ?? 1);
  const binOpen = useStore((s) => s.binOpen);
  const left = usePaneSize('leftWidth', 290, 220, 460);
  const right = usePaneSize('rightWidth', 340, 280, 560);
  const bin = usePaneSize('binHeight', 236, 150, 520);
  useEffect(() => installShortcuts(), []);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.documentElement.style.zoom = String(uiScale);
  }, [uiTheme, uiScale]);

  return (
    <div className="flex h-full flex-col bg-[var(--surface-0)]">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex shrink-0 flex-col overflow-hidden bg-[var(--surface-1)]"
          style={{ width: left.size }}
        >
          <LeftSidebar />
        </aside>
        <Splitter axis="x" pane={left} label={t('layout.resizeLeft')} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-1)]">
            <CenterPane />
          </main>
          {binOpen && <Splitter axis="y" pane={bin} invert label={t('layout.resizeBin')} />}
          <div className="bg-[var(--surface-1)]">
            <Bin height={bin.size} />
          </div>
        </div>
        <Splitter axis="x" pane={right} invert label={t('layout.resizeRight')} />
        <aside
          className="flex shrink-0 flex-col overflow-hidden bg-[var(--surface-1)]"
          style={{ width: right.size }}
        >
          <RightColumn />
        </aside>
      </div>
      <QuickBar />
      <SongEditor />
      <ThemeEditor />
      <OutputsDialog />
      <SettingsDialog />
      <ShortcutsDialog />
      <ServicesDialog />
      <PerfHud />
      <Toasts />
    </div>
  );
}
