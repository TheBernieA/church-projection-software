import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyNamed, preloadLazyViews } from './lib/lazy';
import { installShortcuts } from './lib/shortcuts';
import { useStore } from './lib/store';
import { CenterPane } from './components/modes/CenterPane';
import { QuickBar } from './components/QuickBar';
import { Bin } from './components/shell/Bin';
import { LeftSidebar } from './components/shell/LeftSidebar';
import { RightColumn } from './components/shell/RightColumn';
import { Splitter, usePaneSize } from './components/shell/Splitter';
import { StatusBar } from './components/shell/StatusBar';
import { Toolbar } from './components/shell/Toolbar';
import { Toasts } from './components/Toasts';

// Opened on demand: loaded the first time they're needed, not at startup.
const OutputsDialog = lazyNamed(() => import('./components/OutputsDialog'), 'OutputsDialog');
const PerfHud = lazyNamed(() => import('./components/PerfHud'), 'PerfHud');
const ServicesDialog = lazyNamed(() => import('./components/ServicesDialog'), 'ServicesDialog');
const SettingsDialog = lazyNamed(() => import('./components/SettingsDialog'), 'SettingsDialog');
const ShortcutsDialog = lazyNamed(() => import('./components/ShortcutsDialog'), 'ShortcutsDialog');
const SongEditor = lazyNamed(() => import('./components/SongEditor'), 'SongEditor');
const ThemeEditor = lazyNamed(() => import('./components/ThemeEditor'), 'ThemeEditor');

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
  const dialog = useStore((s) => s.dialog);
  const left = usePaneSize('leftWidth', 290, 220, 460);
  const right = usePaneSize('rightWidth', 340, 280, 560);
  const bin = usePaneSize('binHeight', 236, 150, 520);
  useEffect(() => installShortcuts(), []);
  useEffect(() => preloadLazyViews(), []);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.documentElement.style.zoom = String(uiScale);
  }, [uiTheme, uiScale]);

  return (
    <div className="flex h-full flex-col bg-[var(--surface-0)]">
      <Toolbar />
      {/* Panes float as rounded panels on the canvas; the splitters are the gutters. */}
      <div className="flex min-h-0 flex-1 px-1.5">
        <aside className="pane flex shrink-0 flex-col" style={{ width: left.size }}>
          <LeftSidebar />
        </aside>
        <Splitter axis="x" pane={left} label={t('layout.resizeLeft')} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="pane flex min-h-0 flex-1 flex-col">
            <CenterPane />
          </main>
          {binOpen && <Splitter axis="y" pane={bin} invert label={t('layout.resizeBin')} />}
          <div className={`pane ${binOpen ? '' : 'mt-1.5'}`}>
            <Bin height={bin.size} />
          </div>
        </div>
        <Splitter axis="x" pane={right} invert label={t('layout.resizeRight')} />
        <aside className="pane flex shrink-0 flex-col" style={{ width: right.size }}>
          <RightColumn />
        </aside>
      </div>
      <QuickBar />
      <Suspense fallback={null}>
        {dialog === 'song' && <SongEditor />}
        {dialog === 'theme' && <ThemeEditor />}
        {dialog === 'outputs' && <OutputsDialog />}
        {dialog === 'settings' && <SettingsDialog />}
        {dialog === 'shortcuts' && <ShortcutsDialog />}
        {dialog === 'services' && <ServicesDialog />}
        {dialog === 'perf' && <PerfHud />}
      </Suspense>
      <StatusBar />
      <Toasts />
    </div>
  );
}
