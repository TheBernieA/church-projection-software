import { useEffect } from 'react';
import { installShortcuts } from './lib/shortcuts';
import { useStore } from './lib/store';
import { LibraryPanel } from './components/LibraryPanel';
import { MessagesDialog } from './components/MessagesDialog';
import { Monitors } from './components/Monitors';
import { OutputsDialog } from './components/OutputsDialog';
import { PerfHud } from './components/PerfHud';
import { QuickBar } from './components/QuickBar';
import { Rail } from './components/Rail';
import { ServicePanel } from './components/ServicePanel';
import { ServicesDialog } from './components/ServicesDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { SlideGrid } from './components/SlideGrid';
import { SongEditor } from './components/SongEditor';
import { SlideInspector } from './components/SlideInspector';
import { ThemeEditor } from './components/ThemeEditor';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';

/**
 * Control window — "Broadcast Pro" layout (§15.3, refined):
 * icon rail · optional library drawer · service plan · [monitors + transport / slides].
 */
export function App() {
  const uiTheme = useStore((s) => s.settings?.uiTheme ?? 'dark');
  const uiScale = useStore((s) => s.settings?.uiScale ?? 1);
  const libraryOpen = useStore((s) => s.libraryTab !== null);
  useEffect(() => installShortcuts(), []);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.documentElement.style.zoom = String(uiScale);
  }, [uiTheme, uiScale]);

  return (
    <div className="flex h-full bg-[var(--surface-0)]">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1 gap-2 pb-2 pr-2">
          {libraryOpen && (
            <aside className="panel flex w-[320px] shrink-0 flex-col overflow-hidden">
              <LibraryPanel />
            </aside>
          )}
          <aside className="panel flex w-[280px] shrink-0 flex-col overflow-hidden">
            <ServicePanel />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col gap-2">
            <section className="panel shrink-0">
              <Monitors />
            </section>
            <section className="panel flex min-h-0 flex-1 overflow-hidden">
              <SlideGrid />
              <SlideInspector />
            </section>
          </main>
        </div>
      </div>
      <QuickBar />
      <SongEditor />
      <ThemeEditor />
      <OutputsDialog />
      <SettingsDialog />
      <ShortcutsDialog />
      <ServicesDialog />
      <MessagesDialog />
      <PerfHud />
      <Toasts />
    </div>
  );
}
