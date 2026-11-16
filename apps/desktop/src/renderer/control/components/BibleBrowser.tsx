import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, parseBibleMarkup, type BookId, type ServiceItem } from '@lampstand/core';
import { BOOKS, bookName } from '@lampstand/scripture';
import { openAdhoc } from '../lib/actions';
import { libraryDragSource } from '../lib/libraryDrag';
import { Select } from './Select';
import { chapterKey, loadChapter, useStore } from '../lib/store';
import { Typography, Button, typographyClass } from '@lampstand/ui';

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
    void openAdhoc(item, live ? 'live' : 'preview');
  };

  const chapters = book
    ? (counts?.[book]?.length ?? BOOKS.find((b) => b.id === book)?.chapters ?? 0)
    : 0;
  const f = filter.trim().toLowerCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3">
        {book ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft size={18} className="shrink-0 text-[var(--text-3)]" />}
            onClick={() => setBook(null)}
            className={`-ml-2 min-w-0 !gap-1 !font-semibold !text-[var(--text-1)] ${typographyClass({ size: 15, important: true })}`}
          >
            <span className="truncate">{bookName(book)}</span>
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
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setBook(b.id);
                        setChapter(1);
                        setFilter('');
                      }}
                      className={`rounded-[7px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-3)] ${typographyClass({ size: 13, tone: 'primary', truncate: true })}`}
                    >
                      {b.name}
                    </button>
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
            <div className="grid max-h-28 grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-1 overflow-y-auto pb-1">
              {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChapter(c)}
                  aria-current={c === chapter}
                  className={`h-8 rounded-[7px] transition-colors ${typographyClass({ size: 12, weight: 'medium', tabular: true })} ${c === chapter ? 'bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_2px_8px_rgba(232,176,75,0.3)]' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <Typography as="p" variant="caption" leading="snug" className="pb-2 pt-2">
              {t('bible.hint')}
            </Typography>
          </div>
          <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {(verses ?? []).map((text, i) => {
              const v = i + 1;
              const isSel = selected && v >= selected.from && v <= selected.to;
              return (
                <li key={v}>
                  <button
                    type="button"
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
                    <span className="text-[var(--text-1)]">
                      {parseBibleMarkup(text)
                        .map((s) => s.text)
                        .join('')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
