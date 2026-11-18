import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, parseBibleMarkup, type BookId, type ServiceItem } from '@lampstand/core';
import { BOOKS, bookName } from '@lampstand/scripture';
import { openAdhoc, openPick, saveSettings } from '../lib/actions';
import { libraryDragSource } from '../lib/libraryDrag';
import { Select } from './Select';
import { chapterKey, loadChapter, useStore } from '../lib/store';
import { Typography, Button, Switch, typographyClass } from '@lampstand/ui';

/** Chapter browser (§8.5): books → chapters → verses. Control UI only, never on output. */
export function BibleBrowser() {
  const { t } = useTranslation();
  const versions = useStore((s) => s.versions);
  const defaultVersion = useStore((s) => s.settings?.defaultBibleVersion ?? 'kjv');
  const [chosenVersion, setVersionId] = useState(defaultVersion);
  const versionId = versions.some((v) => v.id === chosenVersion)
    ? chosenVersion
    : (versions[0]?.id ?? chosenVersion);
  const [book, setBook] = useState<BookId | null>(null);
  const [chapter, setChapter] = useState(1);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  // The chapter numbers: shown when a book opens, folded away once one is picked (more room
  // for the verses); the Chapter button brings them back.
  const [chaptersOpen, setChaptersOpen] = useState(true);
  const counts = useStore((s) => s.verseCounts[versionId]);
  const verses = useStore((s) =>
    book ? s.chapters[chapterKey(versionId, book, chapter)] : undefined,
  );
  const adhoc = useStore((s) => s.adhoc);

  useEffect(() => {
    if (book) void loadChapter(versionId, book, chapter);
  }, [versionId, book, chapter]);

  const selected = useMemo(() => {
    if (adhoc?.kind !== 'scripture' || !book) return null;
    const p = adhoc.passage;
    if (p.start.book !== book || p.start.chapter !== chapter || p.end.chapter !== chapter)
      return null;
    return { from: p.start.verse, to: p.end.verse };
  }, [adhoc, book, chapter]);

  const showsNow = useStore((s) => !!s.settings?.pickShowsNow);
  const pick = (v: number, e: React.MouseEvent, live: boolean): void => {
    if (!book) return;
    let from = v;
    let to = v;
    if (e.shiftKey && anchor !== null) {
      from = Math.min(anchor, v);
      to = Math.max(anchor, v);
    } else setAnchor(v);
    const item: ServiceItem = {
      id: newId(),
      kind: 'scripture',
      passage: { start: { book, chapter, verse: from }, end: { book, chapter, verse: to } },
      versionIds: [versionId],
    };
    void (live ? openAdhoc(item, 'live') : openPick(item));
  };

  const chaptersIn = (b: BookId): number =>
    counts?.[b]?.length ?? BOOKS.find((x) => x.id === b)?.chapters ?? 0;
  const chapters = book ? chaptersIn(book) : 0;
  const f = filter.trim().toLowerCase();

  // Open a book at its first chapter, with its chapters showing to pick from.
  const openBook = (id: BookId): void => {
    setBook(id);
    setChapter(1);
    setAnchor(null);
    setChaptersOpen(true);
  };
  // The previous and next book (in this version's order).
  const order = BOOKS.filter((b) => !counts || chaptersIn(b.id) > 0);
  const at = book ? order.findIndex((b) => b.id === book) : -1;
  const prevBook = at > 0 ? order[at - 1] : undefined;
  const nextBook = at >= 0 ? order[at + 1] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3">
        {book ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft size={18} className="shrink-0 text-[var(--text-3)]" />}
            onClick={() => setBook(null)}
            className={`-ml-2 mr-auto min-w-0 !gap-1 !font-semibold !text-[var(--text-1)] ${typographyClass({ size: 15, important: true })}`}
          >
            <Typography truncate>{bookName(book)}</Typography>
          </Button>
        ) : (
          <input
            className="field h-8 min-w-0 flex-1"
            placeholder={t('library.filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t('library.filter')}
          />
        )}
        <div className="w-[92px] shrink-0">
          <Select
            size="sm"
            aria-label={t('bible.version')}
            value={versionId}
            onChange={setVersionId}
            options={versions.map((v) => ({
              value: v.id,
              label: v.abbreviation,
              description: v.name,
            }))}
          />
        </div>
      </div>
      {/* The book's own row: the previous book (by name), its chapters, the next book. */}
      {book && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-4 pb-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<ChevronLeft size={16} className="shrink-0" />}
            aria-label={
              prevBook ? t('bible.prevBook', { name: prevBook.name }) : t('bible.firstBook')
            }
            title={prevBook ? t('bible.prevBook', { name: prevBook.name }) : undefined}
            disabled={!prevBook}
            onClick={() => prevBook && openBook(prevBook.id)}
            className="min-w-0 justify-self-start"
          >
            {prevBook && <Typography truncate>{prevBook.name}</Typography>}
          </Button>
          <Button
            size="sm"
            variant={chaptersOpen ? 'subtle' : 'ghost'}
            aria-expanded={chaptersOpen}
            title={t('bible.chaptersHelp')}
            onClick={() => setChaptersOpen(!chaptersOpen)}
            className="tabular-nums"
          >
            {t('bible.chapterN', { n: chapter })}
            <ChevronDown
              size={13}
              className={`text-[var(--text-3)] transition-transform ${chaptersOpen ? 'rotate-180' : ''}`}
            />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={
              nextBook ? t('bible.nextBook', { name: nextBook.name }) : t('bible.lastBook')
            }
            title={nextBook ? t('bible.nextBook', { name: nextBook.name }) : undefined}
            disabled={!nextBook}
            onClick={() => nextBook && openBook(nextBook.id)}
            className="min-w-0 justify-self-end"
          >
            {nextBook && <Typography truncate>{nextBook.name}</Typography>}
            <ChevronRight size={16} className="shrink-0" />
          </Button>
        </div>
      )}
      {!book && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {(['OT', 'NT'] as const).map((tst) => {
            const list = BOOKS.filter(
              (b) => b.testament === tst && (!f || b.name.toLowerCase().includes(f)),
            );
            if (!list.length) return null;
            return (
              <div key={tst} className="mb-4">
                <Typography as="h3" variant="overline" className="px-2 pb-1.5">
                  {tst === 'OT' ? t('bible.ot') : t('bible.nt')}
                </Typography>
                <div className="grid grid-cols-2 gap-px">
                  {list.map((b) => (
                    <Button
                      variant="bare"
                      key={b.id}
                      onClick={() => {
                        openBook(b.id);
                        setFilter('');
                      }}
                      className={`rounded-[7px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-3)] ${typographyClass({ size: 13, tone: 'primary', truncate: true })}`}
                    >
                      {b.name}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {book && (
        <>
          <div className="px-4">
            {chaptersOpen && (
              <div className="grid max-h-28 grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-1 overflow-y-auto pb-1">
                {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
                  <Button
                    variant="bare"
                    key={c}
                    onClick={() => {
                      setChapter(c);
                      setAnchor(null);
                      setChaptersOpen(false);
                    }}
                    aria-current={c === chapter}
                    className={`h-8 rounded-[7px] transition-colors ${typographyClass({ size: 12, weight: 'medium', tabular: true })} ${c === chapter ? 'bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_2px_8px_rgba(232,176,75,0.3)]' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'}`}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex items-start gap-3 pb-2 pt-2">
              <Typography as="p" variant="caption" leading="snug" className="min-w-0 flex-1">
                {showsNow ? t('bible.hintNow') : t('bible.hint')}
              </Typography>
              <label className="flex shrink-0 items-center gap-2">
                <Typography size={11} tone="secondary">
                  {t('bible.showsNow')}
                </Typography>
                <Switch
                  label={t('bible.showsNowHelp')}
                  checked={showsNow}
                  onChange={(on) => void saveSettings({ pickShowsNow: on })}
                />
              </label>
            </div>
          </div>
          {/* A new chapter starts at its first verse. */}
          <ol
            key={`${book}:${chapter}`}
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
          >
            {(verses ?? []).map((text, i) => {
              const v = i + 1;
              const isSel = selected && v >= selected.from && v <= selected.to;
              return (
                <li key={v}>
                  <Button
                    variant="bare"

                    onClick={(e) => pick(v, e, false)}
                    onDoubleClick={(e) => pick(v, e, true)}
                    {...libraryDragSource(() => {
                      const range = isSel ? selected : { from: v, to: v };
                      return {
                        id: newId(),
                        kind: 'scripture',
                        passage: {
                          start: { book, chapter, verse: range.from },
                          end: { book, chapter, verse: range.to },
                        },
                        versionIds: [versionId],
                      };
                    })}
                    className={`flex w-full gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors ${typographyClass({ size: 13, leading: 'relaxed' })} ${isSel ? 'bg-[var(--accent-soft)] shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-[var(--surface-2)]'}`}
                  >
                    <Typography
                      size={11}
                      weight="semibold"
                      tabular
                      className="w-5 shrink-0 pt-px text-right text-[var(--accent)]"
                    >
                      {v}
                    </Typography>
                    <Typography tone="primary">
                      {parseBibleMarkup(text)
                        .map((s) => s.text)
                        .join('')}
                    </Typography>
                  </Button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
