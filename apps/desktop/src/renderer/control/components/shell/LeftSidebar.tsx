import { useTranslation } from 'react-i18next';
import { useStore } from '../../lib/store';
import { ServicePanel } from '../ServicePanel';
import { SongList } from '../SongList';
import { PaneHeader, PaneTab } from './PaneHeader';
import { Splitter, usePaneSize } from './Splitter';

/** Left sidebar: the song library on top, the service plan (playlist) below. */
export function LeftSidebar() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.libraryTab);
  const lib = usePaneSize('libraryHeight', 300, 120, 640);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        className="flex shrink-0 flex-col overflow-hidden"
        style={{ height: lib.size }}
        aria-label={t('library.title')}
      >
        <PaneHeader title={t('library.title')}>
          <PaneTab
            active={tab === 'songs'}
            onClick={() => useStore.setState({ libraryTab: 'songs' })}
          >
            {t('library.tabs.songs')}
          </PaneTab>
          <PaneTab
            active={tab === 'hymns'}
            onClick={() => useStore.setState({ libraryTab: 'hymns' })}
          >
            {t('library.tabs.hymns')}
          </PaneTab>
        </PaneHeader>
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <SongList hymns={tab === 'hymns'} />
        </div>
      </section>
      <div className="border-t border-[var(--hairline)]">
        <Splitter
          axis="y"
          size={lib.size}
          label={t('layout.resizeLibrary')}
          onPreview={lib.preview}
          onCommit={lib.commit}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ServicePanel />
      </div>
    </div>
  );
}
