import { PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, PanelHeader } from '@lampstand/ui';
import { useStore } from '../lib/store';
import { BibleBrowser } from './BibleBrowser';
import { BackgroundsPanel, MediaPanel } from './MediaPanel';
import { SongList } from './SongList';
import { ThemesPanel } from './ThemesPanel';

/** Library drawer — the section is chosen from the left rail. */
export function LibraryPanel() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.libraryTab);
  if (!tab) return null;
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t(`library.tabs.${tab}`)}>
      <PanelHeader
        title={t(`library.tabs.${tab}`)}
        actions={
          <IconButton
            size="xs"
            aria-label={t('library.close')}
            onClick={() => useStore.setState({ libraryTab: null })}
          >
            <PanelLeftClose size={16} />
          </IconButton>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'bible' && <BibleBrowser />}
        {tab === 'songs' && <SongList hymns={false} />}
        {tab === 'hymns' && <SongList hymns />}
        {tab === 'media' && <MediaPanel />}
        {tab === 'backgrounds' && <BackgroundsPanel />}
        {tab === 'themes' && <ThemesPanel />}
      </div>
    </section>
  );
}
