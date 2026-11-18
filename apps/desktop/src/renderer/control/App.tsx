import { installSurfaces } from './lib/surfaces';
import { useSwitcherSources } from './lib/switcher';
import { migrateLocalCameras } from './lib/inputs';
import { saveSettings } from './lib/actions';
import { MixerPanel } from './components/mixer/MixerPanel';
import { LiveConsole } from './components/live/LiveConsole';
import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyNamed, preloadLazyViews } from './lib/lazy';
import { installShortcuts } from './lib/shortcuts';
import { installNumberWheelGuard } from './lib/utils';
import { useStore } from './lib/store';
import { CenterPane } from './components/modes/CenterPane';
import { QuickBar } from './components/QuickBar';
import { Bin } from './components/shell/Bin';
import { LeftSidebar } from './components/shell/LeftSidebar';
import { RightColumn } from './components/shell/RightColumn';
import { Splitter, usePaneSize } from './components/shell/Splitter';
import { TextBar } from './components/shell/TextBar';
import { Toolbar } from './components/shell/Toolbar';
import { Toasts } from './components/Toasts';
import { installMediaWatch } from './lib/actions';
import { installAudioWatch, installCueMix, installLocalAudio } from './lib/audio';

// Opened on demand: loaded the first time they're needed, not at startup.
const OutputsDialog = lazyNamed(() => import('./components/OutputsDialog'), 'OutputsDialog');
const PerfHud = lazyNamed(() => import('./components/PerfHud'), 'PerfHud');
const ServicesDialog = lazyNamed(() => import('./components/ServicesDialog'), 'ServicesDialog');
const PlaybackDialog = lazyNamed(() => import('./components/PlaybackDialog'), 'PlaybackDialog');
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
  const textScale = useStore((s) => s.settings?.textScale ?? 1);
  const binOpen = useStore((s) => s.binOpen);
  const textBarOpen = useStore((s) => s.textBarOpen);
  const dialog = useStore((s) => s.dialog);
  const left = usePaneSize('leftWidth', 290, 220, 460);
  const right = usePaneSize('rightWidth', 340, 280, 560);
  const bin = usePaneSize('binHeight', 236, 150, 520);
  const mixer = usePaneSize('mixerHeight', 300, 220, 560);
  const mixerOpen = useStore((s) => s.mixerOpen);
  const liveConsole = useStore((s) => s.liveConsole);
  const liveWidth = usePaneSize('liveWidth', 420, 340, 640);
  useEffect(() => installShortcuts(), []);
  useEffect(() => installSurfaces(), []);
  useEffect(() => installMediaWatch(), []);
  useEffect(() => installAudioWatch(), []);
  useEffect(() => installLocalAudio(), []);
  useEffect(() => installCueMix(), []);
  useSwitcherSources();
  // Camera settings used to live in this computer's local storage: move them into settings once.
  const settingsLoaded = useStore((s) => !!s.settings);
  useEffect(() => {
    const s = useStore.getState().settings;
    if (!s) return;
    const moved = migrateLocalCameras(s.cameras);
    if (moved) void saveSettings({ cameras: moved });
  }, [settingsLoaded]);
  useEffect(() => preloadLazyViews(), []);
  useEffect(() => installNumberWheelGuard(), []);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    // Scales the words only (every UI text size reads --text-scale); icons and panes stay put.
    document.documentElement.style.setProperty('--text-scale', String(textScale));
  }, [uiTheme, textScale]);

  return (
    <div className="flex h-full flex-col bg-[var(--surface-0)]">
      <Toolbar />
      {textBarOpen && <TextBar />}
      {/* Operator-console layout: flush panes separated by 1px dividers (the splitters). */}
      <div className="flex min-h-0 flex-1 border-t border-[var(--divider)]">
        <aside className="pane flex shrink-0 flex-col" style={{ width: left.size }}>
          <LeftSidebar binHeight={binOpen ? bin.size : null} />
        </aside>
        <Splitter axis="x" pane={left} label={t('layout.resizeLeft')} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="pane flex min-h-0 flex-1 flex-col">
            <CenterPane />
          </main>
          {/* The media bin opens under the slides from the toolbar's Media button. */}
          {binOpen && (
            <>
              <Splitter axis="y" pane={bin} invert label={t('layout.resizeBin')} />
              <div className="pane">
                <Bin height={bin.size} />
              </div>
            </>
          )}
        </div>
        <Splitter axis="x" pane={right} invert label={t('layout.resizeRight')} />
        <aside className="pane flex shrink-0 flex-col" style={{ width: right.size }}>
          <RightColumn />
        </aside>
        {/* The Live console, docked beside the output (or popped out into its own window). */}
        {liveConsole === 'docked' && (
          <>
            <Splitter axis="x" pane={liveWidth} invert label={t('layout.resizeLive')} />
            <aside className="pane flex shrink-0 flex-col" style={{ width: liveWidth.size }}>
              <LiveConsole mode="docked" />
            </aside>
          </>
        )}
      </div>
      {/* The Mixer docks along the bottom, under every pane, from the toolbar's Mixer button. */}
      {mixerOpen && (
        <>
          <Splitter axis="y" pane={mixer} invert label={t('layout.resizeMixer')} />
          <div className="pane shrink-0">
            <MixerPanel height={mixer.size} />
          </div>
        </>
      )}
      <QuickBar />
      <Suspense fallback={null}>
        {dialog === 'song' && <SongEditor />}
        {dialog === 'theme' && <ThemeEditor />}
        {dialog === 'outputs' && <OutputsDialog />}
        {dialog === 'settings' && <SettingsDialog />}
        {dialog === 'shortcuts' && <ShortcutsDialog />}
        {dialog === 'services' && <ServicesDialog />}
        {dialog === 'playback' && <PlaybackDialog />}
        {dialog === 'perf' && <PerfHud />}
      </Suspense>
      <Toasts />
    </div>
  );
}
