import {
  Archive,
  BookOpen,
  Map as MapIcon,
  Compass,
  MonitorPlay,
  Music,
  Package,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '@lampstand/core';
import { cmd } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import {
  AboutPage,
  GeneralPage,
  LibraryPage,
  PackagesPage,
  PresentingPage,
  ScripturePage,
  SongsPage,
} from './settings/pages';
import { ConnectionsPage, FeaturesPage } from './settings/features';
import { GuidePage, type SettingsPageId } from './settings/guide';

type PageId = SettingsPageId;

const NAV: { id: PageId; icon: LucideIcon }[] = [
  { id: 'general', icon: SlidersHorizontal },
  { id: 'scripture', icon: BookOpen },
  { id: 'songs', icon: Music },
  { id: 'presenting', icon: MonitorPlay },
  { id: 'packages', icon: Package },
  { id: 'library', icon: Archive },
  { id: 'connections', icon: Plug },
  { id: 'about', icon: ShieldCheck },
];

/** Help section, shown below a divider. */
const HELP_NAV: { id: PageId; icon: LucideIcon }[] = [
  { id: 'guide', icon: Compass },
  { id: 'features', icon: MapIcon },
];

/** Two-pane settings window: categories on the left, one focused page on the right. */
export function SettingsDialog() {
  const { t } = useTranslation();
  const s = useStore((x) => x.settings);
  const page = useStore((x) => x.settingsPage);
  const setPage = (settingsPage: PageId): void => useStore.setState({ settingsPage });
  if (!s) return null;
  const update = (patch: Partial<Settings>): void => {
    void attempt(() => cmd('settings.update', { patch }), 'errors.setting');
  };

  return (
    <Dialog name="settings" title={t('settings.title')} wide bare>
      <nav
        aria-label={t('settings.title')}
        className="flex w-[220px] shrink-0 flex-col gap-0.5 bg-[var(--surface-0)]/45 p-3 shadow-[1px_0_0_var(--hairline)]"
      >
        <p aria-hidden className="px-2.5 pb-3 pt-2 text-[16px] font-semibold tracking-[-0.01em]">
          {t('settings.title')}
        </p>
        {[...NAV, null, ...HELP_NAV].map((entry) => {
          if (!entry)
            return (
              <p
                key="help"
                className="section-label mt-4 border-t border-[var(--hairline)] px-2.5 pb-1.5 pt-4"
              >
                {t('settings.help')}
              </p>
            );
          const { id, icon: Icon } = entry;
          const on = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPage(id)}
              aria-current={on ? 'page' : undefined}
              className={`flex h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] ${
                on
                  ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-1)]'
                  : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon size={16} className={on ? 'text-[var(--accent)]' : ''} />
              {t(`settings.pages.${id}`)}
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {page === 'general' && <GeneralPage s={s} update={update} />}
        {page === 'scripture' && <ScripturePage s={s} update={update} />}
        {page === 'songs' && <SongsPage s={s} update={update} />}
        {page === 'presenting' && <PresentingPage s={s} update={update} />}
        {page === 'packages' && <PackagesPage />}
        {page === 'library' && <LibraryPage />}
        {page === 'about' && <AboutPage />}
        {page === 'guide' && <GuidePage goTo={setPage} />}
        {page === 'features' && <FeaturesPage />}
        {page === 'connections' && <ConnectionsPage />}
      </div>
    </Dialog>
  );
}
