import * as RD from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Music, Search, TextQuote, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type ServiceItem } from '@lampstand/core';
import type { SearchHit } from '@lampstand/ipc-contract';
import { formatPassages, parseReference } from '@lampstand/scripture';
import { clearLayer, openAdhoc, toggleMask } from '../lib/actions';
import { q } from '../lib/api';
import { addItemToService, closeDialog, openDialog, useStore } from '../lib/store';
import { OVERLAY_CLASS } from './Dialog';
import { Typography, typographyClass } from '@lampstand/ui';

interface Row {
  id: string;
  group: 'references' | 'songs' | 'verses' | 'commands';
  title: string;
  subtitle?: string;
  item?: ServiceItem;
  run?: () => void;
}

/**
 * Quick bar (⌘K, §8.5): `jn 3 16` → instant preview; `#23` / `h 23` → hymn; anything else →
 * full-text search (songs, hymns, verses) in the SearchWorker; plus commands.
 */
export function QuickBar() {
  const open = useStore((s) => s.dialog === 'quick');
  // Mounting fresh on open resets the query without state-syncing effects.
  return open ? <QuickBarBody /> : null;
}

function QuickBarBody() {
  const { t } = useTranslation();
  const open = true;
  const songs = useStore((s) => s.songs);
  const versionId = useStore((s) => s.settings?.defaultBibleVersion ?? 'kjv');
  const [text, setText] = useState('');
  const [rawHits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const s = text.trim();
    if (s.length < 3) return;
    const id = ++seq.current;
    const timer = setTimeout(() => {
      void q('search.query', { text: s, limit: 20 }).then(
        (r) => id === seq.current && setHits(r),
        () => undefined,
      );
    }, 80);
    return () => clearTimeout(timer);
  }, [text]);

  const rows = useMemo<Row[]>(() => {
    const s = text.trim();
    const hits = s.length >= 3 ? rawHits : [];
    const out: Row[] = [];
    if (!s) return out;
    // 1. Scripture references parsed locally — no round trip, well under the 50 ms budget.
    for (const c of parseReference(s).slice(0, 3)) {
      const first = c.passages[0];
      if (!first) continue;
      const passage =
        c.passages.length > 1
          ? { start: first.start, end: c.passages[c.passages.length - 1]?.end ?? first.end }
          : first;
      out.push({
        id: `ref-${out.length}`,
        group: 'references',
        title: formatPassages(c.passages),
        subtitle: versionId.toUpperCase(),
        item: { id: newId(), kind: 'scripture', passage, versionIds: [versionId] },
      });
    }
    // 2. Hymn by number: "#23" or "h 23".
    const num = /^(?:#|h\s*)(\d{1,4})$/i.exec(s)?.[1];
    if (num) {
      for (const song of songs.filter((x) => x.hymnNumber?.some((h) => h.number === num))) {
        out.push({
          id: `hymn-${song.id}`,
          group: 'songs',
          title: song.title,
          subtitle: `#${num}`,
          item: { id: newId(), kind: 'song', songId: song.id },
        });
      }
    }
    // 3. Full-text hits.
    for (const h of hits) {
      if (h.kind === 'song' || h.kind === 'hymn') {
        if (out.some((r) => r.item?.kind === 'song' && r.item.songId === h.id)) continue;
        out.push({
          id: `song-${h.id}`,
          group: 'songs',
          title: h.title,
          subtitle: h.subtitle,
          item: { id: newId(), kind: 'song', songId: h.id },
        });
      } else if (h.kind === 'verse' && h.ref) {
        const v = { book: h.ref.book, chapter: h.ref.chapter, verse: h.ref.verse };
        out.push({
          id: `v-${h.id}`,
          group: 'verses',
          title: h.subtitle ?? '',
          subtitle: h.title,
          item: {
            id: newId(),
            kind: 'scripture',
            passage: { start: v, end: v },
            versionIds: [h.ref.versionId],
          },
        });
      }
    }
    // 4. Commands.
    const cmds: Row[] = [
      {
        id: 'c-clear',
        group: 'commands',
        title: t('monitor.clearAll'),
        run: () => void clearLayer('all'),
      },
      {
        id: 'c-black',
        group: 'commands',
        title: t('monitor.black'),
        run: () => void toggleMask('black'),
      },
      {
        id: 'c-logo',
        group: 'commands',
        title: t('monitor.logo'),
        run: () => void toggleMask('logo'),
      },
      {
        id: 'c-out',
        group: 'commands',
        title: t('top.outputs'),
        run: () => openDialog('outputs'),
      },
      {
        id: 'c-set',
        group: 'commands',
        title: t('top.settings'),
        run: () => openDialog('settings'),
      },
      {
        id: 'c-song',
        group: 'commands',
        title: t('library.newSong'),
        run: () => openDialog('song', { editingSongId: null }),
      },
    ];
    out.push(...cmds.filter((c) => c.title.toLowerCase().includes(s.toLowerCase())));
    return out;
  }, [text, rawHits, songs, versionId, t]);

  const choose = (row: Row | undefined, mode: 'preview' | 'live' | 'add'): void => {
    if (!row) return;
    closeDialog();
    if (row.run) return row.run();
    if (!row.item) return;
    if (mode === 'add') {
      addItemToService(row.item);
      return;
    }
    void openAdhoc(row.item, mode);
  };

  const groups: Row['group'][] = ['references', 'songs', 'verses', 'commands'];
  let index = -1;

  return (
    <RD.Root open={open} onOpenChange={(o) => !o && closeDialog()}>
      <RD.Portal>
        <RD.Overlay className={OVERLAY_CLASS} />
        <RD.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(720px,92vw)] -translate-x-1/2 overflow-hidden rounded-[16px] bg-[var(--surface-1)] shadow-[var(--shadow-3)]"
        >
          <RD.Title className="sr-only">Quick bar</RD.Title>
          <Search
            size={20}
            aria-hidden
            className="pointer-events-none absolute left-4 top-[22px] text-[var(--text-3)]"
          />
          <input
            autoFocus
            className={`h-16 w-full bg-transparent pl-12 pr-5 outline-none !shadow-[0_1px_0_var(--hairline)] placeholder:text-[var(--text-3)] ${typographyClass({ size: 18 })}`}
            placeholder={t('quick.placeholder')}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(rows[active], e.altKey ? 'add' : e.shiftKey ? 'live' : 'preview');
              }
            }}
            aria-label={t('quick.placeholder')}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="quick-results"
          />
          <div id="quick-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
            {groups.map((g) => {
              const inGroup = rows.filter((r) => r.group === g);
              if (!inGroup.length) return null;
              return (
                <div key={g}>
                  <Typography as="div" variant="overline" className="px-3 pb-1.5 pt-3">
                    {t(`quick.${g}`)}
                  </Typography>
                  {inGroup.map((r) => {
                    index += 1;
                    const i = index;
                    return (
                      <div
                        key={r.id}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={(e) => choose(r, e.shiftKey ? 'live' : 'preview')}
                        className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 ${i === active ? 'bg-[var(--surface-3)] shadow-[inset_2px_0_0_var(--accent)]' : ''}`}
                      >
                        <RowIcon group={r.group} />
                        <Typography size={14} weight="medium" className="shrink-0">
                          {r.title}
                        </Typography>
                        {r.subtitle && (
                          <Typography size={13} tone="muted" truncate>
                            {r.subtitle}
                          </Typography>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <Typography
            as="div"
            variant="caption"
            className="bg-[var(--surface-0)]/40 px-5 py-2.5 shadow-[0_-1px_0_var(--hairline)]"
          >
            {t('quick.hint')}
          </Typography>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

const ROW_ICONS = { references: BookOpen, songs: Music, verses: TextQuote, commands: Zap } as const;
function RowIcon({ group }: { group: Row['group'] }) {
  const Icon = ROW_ICONS[group];
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-2)] text-[var(--text-2)]"
    >
      <Icon size={15} />
    </span>
  );
}
