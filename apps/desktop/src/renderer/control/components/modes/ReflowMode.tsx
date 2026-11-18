import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Heading,
  Lock,
  MousePointerClick,
  Rows3,
  Save,
  Scissors,
  SeparatorHorizontal,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { nowIso, type ServiceItem, type Song } from '@lampstand/core';
import { parseSongText, songSectionsToText } from '@lampstand/lyrics';
import { Button, Kbd, Typography, typographyClass } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { useInService, useSelectedItem, useSlideContext } from '../../lib/hooks';
import {
  blockAt,
  blockStarts,
  insertBlock,
  reflowToSlides,
  slidesToReflow,
  splitLongBlocks,
  tidyReflow,
} from '../../lib/reflow';
import { buildItemSlides, groupColor } from '../../lib/slides';
import { attempt, toast, updateItem, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { SceneView } from '../SceneView';
import { thumbScene } from '../SlideGrid';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { type PresentableSlide, type TextItem } from '../../types';

/** Unsaved reflow text per song or item, so switching away and back never loses it. */
const drafts = new Map<string, string>();

const mod = (e: KeyboardEvent): boolean => e.metaKey || e.ctrlKey;
const SONG_HEADINGS = [
  'Verse 1',
  'Verse 2',
  'Verse 3',
  'Pre-chorus',
  'Chorus',
  'Bridge',
  'Tag',
  'Intro',
  'Ending',
];

interface Built {
  slides: PresentableSlide[];
  /** The block of text (slide, or song section) each slide comes from. */
  blockOf: number[];
  /** Slides with more lines than fit (only for text slides; songs split themselves). */
  long: boolean[];
}

/**
 * One big text area for the whole song or presentation, with the real slides beside it (theme,
 * background and all). Click a slide to jump to its text; the slide you're typing in is
 * highlighted. Insert headings, split at the caret, tidy, or split slides that are too long.
 */
function ReflowEditor({
  draftKey,
  title,
  initial,
  build,
  onSave,
  readOnly,
  song,
  maxLines,
}: {
  draftKey: string;
  title: string;
  initial: string;
  build: (text: string) => Built;
  onSave: (text: string) => void | Promise<void>;
  /** Hymnal songs can't be changed here. */
  readOnly?: boolean;
  /** Song headings (Verse, Chorus…) rather than slide titles. */
  song?: boolean;
  maxLines: number;
}) {
  const { t } = useTranslation();
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? initial);
  const [caret, setCaret] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  // Previews follow the typing a beat behind, so a long song never makes keys feel slow.
  const deferred = useDeferredValue(text);
  const built = useMemo(() => build(deferred), [build, deferred]);
  const thumbs = useMemo(() => built.slides.map(thumbScene), [built.slides]);
  const dirty = text !== initial;
  const active = blockAt(text, caret);
  const anyLong = built.long.some(Boolean);

  const setText = (next: string): void => {
    setTextState(next);
    if (next === initial) drafts.delete(draftKey);
    else drafts.set(draftKey, next);
  };
  /** Replace the text and put the caret somewhere (after the browser has the new value). */
  const edit = (next: string, at: number): void => {
    setText(next);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
      setCaret(at);
    });
  };
  const save = async (): Promise<void> => {
    if (!dirty || readOnly) return;
    await onSave(text);
    drafts.delete(draftKey);
  };
  const jumpTo = (block: number): void => {
    const at = blockStarts(text)[block] ?? 0;
    edit(text, at);
  };

  // Keep the slide being typed in visible in the list.
  const firstActive = built.blockOf.indexOf(active);
  useEffect(() => {
    items.current[firstActive]?.scrollIntoView({ block: 'nearest' });
  }, [firstActive]);

  const tool = 'shrink-0';
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-4">
        <Rows3 size={16} className="text-[var(--text-3)]" />
        <Typography as="h2" variant="title" truncate className="min-w-0">
          {title}
        </Typography>
        {dirty && (
          <Typography
            size={11}
            weight="semibold"
            tone="inherit"
            className="flex shrink-0 items-center gap-1 text-[var(--accent)]"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            {t('reflow.unsaved')}
          </Typography>
        )}
        <span className="flex-1" />
        <Typography variant="caption" className="shrink-0">
          {t('slides.count', { count: built.slides.length })}
        </Typography>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setText(initial);
            drafts.delete(draftKey);
          }}
        >
          {t('reflow.revert')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<Save size={14} />}
          disabled={!dirty || readOnly}
          onClick={() => void save()}
          title={t('reflow.saveHint')}
        >
          {t('reflow.save')}
        </Button>
      </div>
      {readOnly && (
        <Typography
          as="p"
          size={12}
          tone="secondary"
          className="flex items-center gap-2 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-2"
        >
          <Lock size={13} />
          {t('reflow.readOnly')}
        </Typography>
      )}
      {/* Words beside their slides; in a narrow workspace, the slides go under the words. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(240px,340px)] @max-[640px]:grid-cols-1 @max-[640px]:grid-rows-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-h-0 flex-col gap-2 p-4">
          {/* Tools. */}
          <div
            role="toolbar"
            aria-label={t('reflow.tools')}
            className="flex flex-wrap items-center gap-1"
          >
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<Heading size={13} />}
                  disabled={readOnly}
                  className={tool}
                >
                  {song ? t('reflow.insertSection') : t('reflow.insertSlide')}
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
                  {(song ? SONG_HEADINGS : [t('reflow.newSlideTitle'), '']).map((h) => (
                    <DropdownMenu.Item
                      key={h || 'plain'}
                      className={ITEM_CLASS}
                      onSelect={() => {
                        const r = insertBlock(text, caret, h ? `[${h}]` : '');
                        edit(r.text, r.caret);
                      }}
                    >
                      {h ? `[${h}]` : t('reflow.untitledSlide')}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button
              size="xs"
              variant="ghost"
              icon={<SeparatorHorizontal size={13} />}
              disabled={readOnly}
              onClick={() => {
                const r = insertBlock(text, caret, '');
                edit(r.text, r.caret);
              }}
              className={tool}
            >
              {t('reflow.splitHere')}
              <Kbd>⌘↵</Kbd>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              icon={<Sparkles size={13} />}
              disabled={readOnly || tidyReflow(text) === text}
              onClick={() => edit(tidyReflow(text), 0)}
              className={tool}
            >
              {t('reflow.tidy')}
            </Button>
            {!song && (
              <Button
                size="xs"
                variant="ghost"
                icon={<Scissors size={13} />}
                disabled={readOnly || !anyLong}
                onClick={() => edit(splitLongBlocks(text, maxLines), 0)}
                className={tool}
              >
                {t('reflow.splitLong', { count: maxLines })}
              </Button>
            )}
          </div>
          <textarea
            ref={area}
            aria-label={t('reflow.label')}
            className={`field min-h-0 flex-1 resize-none !py-3 !font-sans ${typographyClass({ size: 14, leading: 'relaxed', important: true })}`}
            value={text}
            readOnly={readOnly}
            spellCheck
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (mod(e) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void save();
              } else if (mod(e) && e.key === 'Enter' && !readOnly) {
                e.preventDefault();
                const r = insertBlock(text, e.currentTarget.selectionStart, '');
                edit(r.text, r.caret);
              }
            }}
          />
          <Typography as="p" size={11} tone="muted">
            {t('reflow.help')}
          </Typography>
        </div>
        {/* The real slides. */}
        <ol
          aria-label={t('reflow.preview')}
          className="min-h-0 space-y-2 overflow-y-auto border-l border-[var(--hairline)] p-3 @max-[640px]:border-t @max-[640px]:border-l-0"
        >
          {built.slides.map((s, i) => {
            const block = built.blockOf[i] ?? 0;
            const on = block === active;
            const color = groupColor(s.group ?? s.label);
            return (
              <li
                key={s.key}
                ref={(el) => {
                  items.current[i] = el;
                }}
              >
                <Button
                  variant="bare"
                  aria-label={t('reflow.jumpTo', { n: i + 1, label: s.label })}
                  aria-current={on || undefined}
                  onClick={() => jumpTo(block)}
                  className={`block w-full overflow-hidden rounded-[5px] text-left transition-shadow ${
                    on
                      ? 'shadow-[0_0_0_2px_var(--accent)]'
                      : 'shadow-[0_0_0_1px_var(--hairline-strong)] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--text-1)_45%,transparent)]'
                  }`}
                >
                  <SceneView scene={thumbs[i] ?? thumbScene(s)} mode="thumbnail" />
                  <span
                    className="flex h-6 items-center gap-1.5 px-2"
                    style={{ background: color ?? 'var(--surface-3)' }}
                  >
                    <Typography
                      size={11}
                      weight="semibold"
                      tone="white"
                      truncate
                      className="min-w-0 flex-1"
                    >
                      {i + 1} · {s.label}
                    </Typography>
                    {built.long[i] && (
                      <Typography
                        size={10}
                        weight="bold"
                        tone="white"
                        caps
                        className="shrink-0 rounded-[3px] bg-[var(--tally-program)] px-1"
                        title={t('reflow.longHint', { count: maxLines })}
                      >
                        {t('reflow.long')}
                      </Typography>
                    )}
                  </span>
                </Button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** A song: its lyrics as text (sections in [brackets]), slides built with its arrangement. */
function SongReflow({ song, item }: { song: Song; item: ServiceItem }) {
  const { t } = useTranslation();
  const ctx = useSlideContext();
  const maxLines = ctx.settings?.lyrics.maxLinesPerSlide ?? 4;
  const initial = useMemo(() => songSectionsToText(song.sections), [song.sections]);
  const toSong = (text: string): Song => ({
    ...song,
    sections: parseSongText(text, song.sections).sections,
  });
  const build = useMemo(
    () =>
      (text: string): Built => {
        const draft = { ...song, sections: parseSongText(text, song.sections).sections };
        const { slides } = buildItemSlides(item, {
          ...ctx,
          songs: ctx.songs.map((s) => (s.id === song.id ? draft : s)),
        });
        // A song slide's key carries its section: map it back to that section's block.
        const index = new Map(draft.sections.map((s, i) => [s.id, i]));
        const blockOf = slides.map((sl) => index.get(sl.key.split(':')[1] ?? '') ?? 0);
        return { slides, blockOf, long: slides.map(() => false) };
      },
    [song, item, ctx],
  );
  return (
    <ReflowEditor
      key={song.id + song.updatedAt}
      draftKey={`song:${song.id}`}
      title={song.title}
      initial={initial}
      build={build}
      song
      maxLines={maxLines}
      readOnly={song.origin === 'hymnal'}
      onSave={async (text) => {
        const saved = await attempt(
          () => cmd('song.save', { entity: { ...toSong(text), updatedAt: nowIso() } }),
          'errors.save',
        );
        if (saved !== undefined) toast(t('song.saved', { title: song.title }));
      }}
    />
  );
}

/** Text slides or announcements: one block per slide, an optional [Title] first line. */
function TextReflow({ item }: { item: TextItem }) {
  const ctx = useSlideContext();
  const maxLines = ctx.settings?.lyrics.maxLinesPerSlide ?? 4;
  const initial = useMemo(() => slidesToReflow(item.slides), [item.slides]);
  const build = useMemo(
    () =>
      (text: string): Built => {
        const parsed = reflowToSlides(text, item.slides);
        const { slides } = buildItemSlides({ ...item, slides: parsed }, ctx);
        return {
          slides,
          blockOf: slides.map((_, i) => i),
          long: parsed.map((p) => p.body.split('\n').length > maxLines),
        };
      },
    [item, ctx, maxLines],
  );
  return (
    <ReflowEditor
      key={item.id + initial}
      draftKey={`item:${item.id}`}
      title={item.title}
      initial={initial}
      build={build}
      maxLines={maxLines}
      onSave={(text) =>
        updateItem<TextItem>(item.id, (x) => ({ ...x, slides: reflowToSlides(text, x.slides) }))
      }
    />
  );
}

/** Reflow workspace: edit all of an item's text at once; blank lines split slides. */
export function ReflowMode() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const songs = useStore((s) => s.songs);
  const inService = useInService(item);
  if (!item)
    return <EmptyState icon={<MousePointerClick size={28} />} title={t('modes.pickItem')} />;
  if (item.kind === 'song') {
    const song = songs.find((s) => s.id === item.songId);
    return song ? <SongReflow song={song} item={item} /> : null;
  }
  if ((item.kind === 'presentation' || item.kind === 'announcements') && inService)
    return <TextReflow item={item} />;
  return (
    <EmptyState
      icon={<Rows3 size={28} />}
      title={t('reflow.unavailable')}
      body={t('reflow.unavailableHelp')}
    />
  );
}
