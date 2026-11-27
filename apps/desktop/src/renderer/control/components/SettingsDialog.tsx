import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '@lampstand/core';
import { IconButton, NavItem, Typography } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { useStore } from '../lib/store';
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
import { ScreensPage } from './settings/screens';
import { VideoPage } from './settings/video';
import { AudioPage } from './settings/audio';
import { StreamingPage } from './settings/streaming';
import { NdiPage } from './settings/ndi';
import { AssistantPage } from './settings/assistant';
import { SurfacesPage } from './settings/surfaces';
import { PageFrameContext, Tag, type PageFrame } from './settings/parts';
import {
  PAGE_ICONS,
  PAGE_ORDER,
  resetPatch,
  searchSettings,
  SETTINGS_SECTIONS,
  type SearchHit,
} from './settings/registry';

type PageId = SettingsPageId;

/** Scroll a found setting into view and flash it, once its page has rendered. */
function reveal(scroller: HTMLElement | null, label: string): void {
  const sel = `[data-row="${CSS.escape(label)}"], [data-section="${CSS.escape(label)}"]`;
  let tries = 0;
  const find = (): void => {
    const el = scroller?.querySelector<HTMLElement>(sel);
    if (!el) {
      if (++tries < 20) requestAnimationFrame(find);
      return;
    }
    el.scrollIntoView({ block: 'center' });
    const target = el.matches('[data-section]')
      ? (el.querySelector<HTMLElement>(':scope > div:last-of-type') ?? el)
      : el;
    target.classList.remove('ls-flash');
    target.getBoundingClientRect(); // restart the animation
    target.classList.add('ls-flash');
  };
  requestAnimationFrame(find);
}

/**
 * The Settings window: a sidebar of grouped pages with search at the top, and one focused page
 * on the right (its header stays in view; long pages list their sections beside them).
 * ↑/↓ in the sidebar moves between pages; ⌘F searches; ⌘, opens Settings from anywhere.
 */
export function SettingsDialog() {
  const { t } = useTranslation();
  const s = useStore((x) => x.settings);
  const page = useStore((x) => x.settingsPage);
  const onAir = useStore((x) => !!x.stream?.streaming || !!x.stream?.recording);
  const ndiFeeds = useStore((x) => x.settings?.ndi.feeds.filter((f) => f.enabled).length ?? 0);
  const ndiReady = useStore((x) => !!x.ndi?.available);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchSettings(query, t), [query, t]);

  const setPage = (settingsPage: PageId): void => useStore.setState({ settingsPage });

  // A new page starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);

  if (!s) return null;
  const update = (patch: Partial<Settings>): void => void saveSettings(patch);

  const open = (hit: SearchHit): void => {
    setPage(hit.page);
    setQuery('');
    if (hit.label !== t(`settings.pages.${hit.page}`)) reveal(scroller.current, hit.label);
  };

  const navKeys = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-nav-item]')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next?.focus();
    const id = next?.dataset.navItem as PageId | undefined;
    if (id && PAGE_ORDER.includes(id)) setPage(id);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && hits[0]) {
      e.preventDefault();
      open(hits[0]);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.currentTarget.closest('nav')?.querySelector<HTMLButtonElement>('[data-nav-item]')?.focus();
    }
  };

  const reset = resetPatch(page, s);
  const frame: PageFrame = {
    icon: PAGE_ICONS[page],
    scroller,
    ...(reset ? { onReset: () => update(reset) } : {}),
  };

  const trailing = (id: PageId) =>
    id === 'streaming' && onAir ? (
      <Tag tone="live">{t('live.badgeLive')}</Tag>
    ) : id === 'ndi' && ndiFeeds > 0 ? (
      <Tag tone={ndiReady ? 'ok' : 'neutral'}>{ndiFeeds}</Tag>
    ) : undefined;

  return (
    <Dialog name="settings" title={t('settings.title')} wide bare>
      <nav
        aria-label={t('settings.title')}
        onKeyDown={navKeys}
        onKeyDownCapture={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            search.current?.focus();
          }
        }}
        className="flex w-[248px] shrink-0 flex-col bg-[var(--surface-0)]/55 shadow-[1px_0_0_var(--hairline)]"
      >
        <div className="px-3 pb-2 pt-4">
          <Typography
            as="p"
            variant="heading"
            aria-hidden
            className="px-1.5 pb-3 tracking-[-0.01em]"
          >
            {t('settings.title')}
          </Typography>
          <div className="relative">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              aria-label={t('settings.search')}
              placeholder={t('settings.searchPlaceholder')}
              className="field !h-8 w-full !pl-8 !pr-7"
            />
            {query && (
              <IconButton
                size="xs"
                aria-label={t('settings.searchClear')}
                onClick={() => setQuery('')}
                className="absolute right-0.5 top-1/2 -translate-y-1/2"
              >
                <X size={13} />
              </IconButton>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {query ? (
            <div role="group" aria-label={t('settings.searchResults')} className="pt-1">
              {hits.length === 0 ? (
                <Typography as="p" size={12} tone="muted" className="px-2.5 py-3">
                  {t('settings.searchNone', { query })}
                </Typography>
              ) : (
                hits.map((hit) => {
                  const Icon = PAGE_ICONS[hit.page];
                  const isPage = hit.label === t(`settings.pages.${hit.page}`);
                  return (
                    <NavItem
                      key={`${hit.page}:${hit.label}`}
                      data-nav-item={`hit:${hit.page}`}
                      onClick={() => open(hit)}
                      tone="accent"
                      density="comfortable"
                      icon={<Icon size={15} />}
                      label={hit.label}
                      trailing={
                        isPage ? undefined : (
                          <Typography size={11} tone="muted" truncate className="max-w-[84px]">
                            {t(`settings.pages.${hit.page}`)}
                          </Typography>
                        )
                      }
                    />
                  );
                })
              )}
            </div>
          ) : (
            SETTINGS_SECTIONS.map((section) => (
              <div key={section.id} className="pt-3 first:pt-1">
                <Typography as="p" variant="overline" className="px-2.5 pb-1.5">
                  {t(`settings.sections.${section.id}`)}
                </Typography>
                <div className="flex flex-col gap-0.5">
                  {section.pages.map((id) => {
                    const Icon = PAGE_ICONS[id];
                    const on = page === id;
                    return (
                      <NavItem
                        key={id}
                        data-nav-item={id}
                        onClick={() => setPage(id)}
                        aria-current={on ? 'page' : undefined}
                        selected={on}
                        tone="accent"
                        density="comfortable"
                        icon={<Icon size={16} />}
                        label={t(`settings.pages.${id}`)}
                        trailing={trailing(id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </nav>
      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
        <PageFrameContext.Provider value={frame}>
          {page === 'general' && <GeneralPage s={s} update={update} />}
          {page === 'scripture' && <ScripturePage s={s} update={update} />}
          {page === 'songs' && <SongsPage s={s} update={update} />}
          {page === 'assistant' && <AssistantPage s={s} update={update} />}
          {page === 'presenting' && <PresentingPage s={s} update={update} />}
          {page === 'screens' && <ScreensPage s={s} update={update} />}
          {page === 'video' && <VideoPage s={s} update={update} />}
          {page === 'audio' && <AudioPage s={s} update={update} />}
          {page === 'streaming' && <StreamingPage s={s} update={update} />}
          {page === 'ndi' && <NdiPage s={s} update={update} />}
          {page === 'surfaces' && <SurfacesPage s={s} update={update} />}
          {page === 'packages' && <PackagesPage />}
          {page === 'library' && <LibraryPage />}
          {page === 'about' && <AboutPage />}
          {page === 'guide' && <GuidePage goTo={setPage} />}
          {page === 'features' && <FeaturesPage />}
          {page === 'connections' && <ConnectionsPage />}
        </PageFrameContext.Provider>
      </div>
    </Dialog>
  );
}
