import { useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileUp,
  Globe,
  GripVertical,
  Heading,
  Plus,
  Presentation,
  Timer,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type ServiceItem } from '@lampstand/core';
import { formatPassage } from '@lampstand/scripture';
import { IconButton, Typography, typographyClass, Button } from '@lampstand/ui';
import { importSlides } from '../lib/importSlides';
import { itemTitle, sectionColor } from '../lib/slides';
import { moveItem as move } from '../lib/array';
import { isLibraryDrag, readLibraryDrop } from '../lib/libraryDrag';
import { intoSection } from '../lib/sections';
import {
  moveSectionBy,
  moveSectionTo,
  sectionBounds,
  sectionCanMove,
  sectionDropBoundary,
} from '../lib/sections';
import { editItems, useStore } from '../lib/store';
import { KindTile } from './kindIcons';
import { urlHost } from '../lib/utils';

/** Secondary line under each item: what it is, at a glance. */
function useItemSubtitle(): (item: ServiceItem) => string {
  const { t } = useTranslation();
  const songs = useStore((s) => s.songs);
  return (item) => {
    switch (item.kind) {
      case 'song': {
        const s = songs.find((x) => x.id === item.songId);
        return [
          s?.hymnNumber?.[0] ? `#${s.hymnNumber[0].number}` : '',
          s?.authors[0] ?? t('service.kind.song'),
        ]
          .filter(Boolean)
          .join(' · ');
      }
      case 'scripture':
        return (
          item.versionIds.map((v) => v.toUpperCase()).join(' / ') || formatPassage(item.passage)
        );
      case 'announcements':
        return `${t('service.kind.announcements')} · ${item.slides.length}`;
      case 'presentation':
        return `${t('service.kind.presentation')} · ${item.slides.length}`;
      case 'countdown':
        return typeof item.target === 'string'
          ? t('service.kind.countdown')
          : `${Math.round(item.target.durationSec / 60)} min`;
      case 'media':
        return t('service.kind.media');
      case 'web':
        return urlHost(item.url) || t('service.kind.web');
      case 'header':
        return '';
    }
  };
}

/** Service plan (playlist) with drag-and-drop ordering (§16 P0). */
/**
 * Pick an item in the plan. From the Themes workspace this goes back to Show, where the
 * item's slides are (Themes has nothing to show for one item).
 */
const selectItem = (id: string): void =>
  useStore.setState((s) => ({
    selectedItemId: id,
    adhoc: null,
    ...(s.mode === 'themes' ? { mode: 'show' as const } : {}),
  }));

export function ServicePanel() {
  const { t } = useTranslation();
  const service = useStore((s) => s.service);
  const selected = useStore((s) => s.selectedItemId);
  const liveItem = useStore((s) => s.liveCursor?.itemId);
  const previewItem = useStore((s) => s.previewCursor?.itemId);
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
  const bookNames = useStore((s) => s.bookNames);
  const subtitle = useItemSubtitle();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  /** A drag coming in from the library (songs, media, verses) rather than a reorder. */
  const [incoming, setIncoming] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  if (!service) return null;
  const items = service.items;
  const update = editItems;
  const draggingSection = drag !== null && items[drag]?.kind === 'header';
  const [dragStart, dragEnd] =
    drag === null ? [-1, -1] : draggingSection ? sectionBounds(items, drag) : [drag, drag + 1];
  // Where the drop indicator sits: a section snaps to the nearest section boundary.
  const dropAt =
    over === null
      ? null
      : incoming
        ? over
        : drag === null
          ? null
          : draggingSection
            ? sectionDropBoundary(items, over)
            : over;
  const showDropAt = dropAt !== null && !(dropAt >= dragStart && dropAt <= dragEnd);
  const endDrag = (): void => {
    setDrag(null);
    setOver(null);
    setIncoming(false);
  };
  const trackOver = (e: React.DragEvent, i: number): void => {
    e.preventDefault();
    if (isLibraryDrag(e)) {
      e.dataTransfer.dropEffect = 'copy';
      setIncoming(true);
    }
    setOver(i);
  };
  const drop = (e: React.DragEvent): void => {
    e.preventDefault();
    if (isLibraryDrag(e)) {
      const item = readLibraryDrop(e);
      const at = over ?? items.length;
      if (item) {
        update((xs) => [...xs.slice(0, at), item, ...xs.slice(at)]);
        selectItem(item.id);
      }
    } else if (drag !== null && over !== null) {
      const from = drag;
      const to = over;
      update((xs) =>
        xs[from]?.kind === 'header'
          ? moveSectionTo(xs, from, sectionDropBoundary(xs, to))
          : // `to` is the insertion line (before row `to`); removing the item first shifts rows below it up.
            move(xs, from, to > from ? to - 1 : to),
      );
    }
    endDrag();
  };
  const dnd = (i: number) => ({
    draggable: true,
    onDragStart: () => setDrag(i),
    onDragOver: (e: React.DragEvent) => trackOver(e, i),
    onDrop: drop,
    onDragEnd: endDrag,
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t('service.title')}>
      {/* "11 ITEMS  +": the playlist's contents, with the add menu on the right. */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--hairline)] pb-1 pl-3 pr-1.5">
        <Typography as="h2" variant="overline">
          <span className="sr-only">{t('service.title')} · </span>
          {t('sidebar.items', { count: items.filter((i) => i.kind !== 'header').length })}
        </Typography>
        <AddMenu
          update={update}
          trigger={
            <IconButton size="3xs" variant="quiet" aria-label={t('service.add')}>
              <Plus size={14} />
            </IconButton>
          }
        />
      </div>
      <ol
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        onDragOver={(e) => {
          if (e.target === e.currentTarget) trackOver(e, items.length);
        }}
        onDrop={(e) => {
          if (e.target === e.currentTarget) drop(e);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setOver(null);
            setIncoming(false);
          }
        }}
      >
        {items.length === 0 && (
          <Typography
            as="li"
            size={13}
            tone="muted"
            onDragOver={(e) => trackOver(e, 0)}
            onDrop={drop}
            className={`mx-2 rounded-[var(--radius-card)] border border-dashed p-5 text-center ${incoming ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--hairline-strong)]'}`}
          >
            {t('service.empty')}
          </Typography>
        )}
        {items.map((item, i) => {
          const dropLine =
            showDropAt && dropAt === i
              ? 'before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-[var(--accent)]'
              : '';
          const dimmed = i >= dragStart && i < dragEnd ? 'opacity-40' : '';
          if (item.kind === 'header') {
            return (
              <li
                key={item.id}
                {...dnd(i)}
                className={`group relative mt-2 flex h-7 items-center rounded-[3px] px-2 first:mt-1 ${dropLine} ${dimmed}`}
                style={{ background: sectionColor(item.label) }}
              >
                {editing === item.id ? (
                  <input
                    autoFocus
                    className="field h-8"
                    defaultValue={item.label}
                    onBlur={(e) => {
                      const label = e.target.value.trim() || item.label;
                      update((xs) => xs.map((x) => (x.id === item.id ? { ...item, label } : x)));
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <Button
                    variant="bare"

                    onDoubleClick={() => setEditing(item.id)}
                    title={t('service.renameHint')}
                    className={`min-w-0 flex-1 text-left ${typographyClass({ size: 12, tone: 'white', weight: 'semibold', truncate: true })}`}
                  >
                    {item.label}
                  </Button>
                )}
                <ItemMenu index={i} items={items} update={update} item={item} bg="band" />
              </li>
            );
          }
          const isSel = selected === item.id;
          const isLive = liveItem === item.id;
          const isPrev = previewItem === item.id && !isLive;
          return (
            <li key={item.id} {...dnd(i)} className={`group relative ${dropLine} ${dimmed}`}>
              <div
                className={`relative flex items-center gap-1 rounded-[var(--radius-card)] pr-1 transition-colors duration-100 ${
                  isSel
                    ? 'bg-[var(--select)] text-white [&_.ls-sub]:!text-white/75'
                    : 'hover:bg-[var(--surface-2)]'
                }`}
              >
                {/* Edge bar: red while live (selection is the blue fill). */}
                {isLive && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
                    style={{
                      background: 'var(--tally-program)',
                    }}
                  />
                )}
                <GripVertical
                  size={14}
                  aria-hidden
                  className="ml-0.5 shrink-0 text-[var(--text-3)] opacity-0 transition-opacity group-hover:opacity-100"
                />
                <Button
                  variant="bare"

                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                  onClick={() => selectItem(item.id)}
                  aria-current={isSel}
                >
                  <KindTile kind={item.kind} size={20} />
                  {/* One line: the title, and its source (song, version…) in muted text on the right. */}
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <Typography variant="body" truncate className="min-w-0 flex-1">
                      {itemTitle(item, { songs, media, bookNames })}
                    </Typography>
                    <Typography variant="caption" truncate className="ls-sub max-w-[45%] shrink-0">
                      {subtitle(item)}
                    </Typography>
                  </span>
                </Button>
                {isLive && (
                  <Typography
                    size={10}
                    tone="white"
                    weight="bold"
                    className="shrink-0 rounded-[5px] bg-[var(--tally-program)] px-1.5 py-0.5 tracking-wide"
                  >
                    LIVE
                  </Typography>
                )}
                {isPrev && (
                  <span
                    aria-label={t('monitor.preview')}
                    className="mr-1 h-2 w-2 shrink-0 rounded-full bg-[var(--tally-preview)] shadow-[0_0_6px_var(--tally-preview)]"
                  />
                )}
                <ItemMenu
                  index={i}
                  items={items}
                  update={update}
                  item={item}
                  bg={isSel ? 'selected' : 'hover'}
                />
              </div>
            </li>
          );
        })}
        {(drag !== null || incoming) && (
          <li
            aria-hidden
            onDragOver={(e) => trackOver(e, items.length)}
            onDrop={drop}
            className={`relative h-10 ${showDropAt && dropAt === items.length ? 'before:absolute before:inset-x-2 before:top-1 before:h-0.5 before:rounded before:bg-[var(--accent)]' : ''}`}
          />
        )}
      </ol>
    </section>
  );
}

/**
 * The add menu for the playlist: what can be added (section,
 * text slides, countdown, web page, import), each with a line saying what it is.
 */
/** A section's "+": slides, a countdown and the rest go straight into it. */
export function SectionAdd({
  header,
  update,
}: {
  header: Extract<ServiceItem, { kind: 'header' }>;
  update: (fn: (xs: ServiceItem[]) => ServiceItem[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <AddMenu
      update={(fn) => update(intoSection(header.id, fn))}
      trigger={
        <IconButton
          size="3xs"
          variant="bare"
          aria-label={t('service.addToSection', { name: header.label })}
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-black/20 text-white hover:bg-black/35"
        >
          <Plus size={12} />
        </IconButton>
      }
    />
  );
}

export function AddMenu({
  update,
  trigger,
}: {
  update: (fn: (xs: ServiceItem[]) => ServiceItem[]) => void;
  /** The button that opens the menu (a "+" in the sidebar, "+ Add" elsewhere). */
  trigger: ReactNode;
}) {
  const { t } = useTranslation();
  const add = (item: ServiceItem): void => update((xs) => [...xs, item]);
  const entries: { key: string; icon: ReactNode; label: string; help: string; run: () => void }[] =
    [
      {
        key: 'header',
        icon: <Heading size={15} />,
        label: t('service.kind.header'),
        help: t('service.addHelp.header'),
        run: () => add({ id: newId(), kind: 'header', label: t('service.newHeader') }),
      },
      {
        key: 'presentation',
        icon: <Presentation size={15} />,
        label: t('service.kind.presentation'),
        help: t('service.addHelp.presentation'),
        run: () =>
          add({
            id: newId(),
            kind: 'presentation',
            title: t('service.textSlideTitle'),
            slides: [{ id: newId(), title: '', body: 'Type your text here' }],
          }),
      },
      {
        key: 'countdown',
        icon: <Timer size={15} />,
        label: t('service.kind.countdown'),
        help: t('service.addHelp.countdown'),
        run: () =>
          add({
            id: newId(),
            kind: 'countdown',
            title: t('service.countdownTitle'),
            target: { durationSec: 300 },
          }),
      },
      {
        key: 'web',
        icon: <Globe size={15} />,
        label: t('service.kind.web'),
        help: t('service.addHelp.web'),
        run: () => {
          const id = newId();
          add({ id, kind: 'web', title: t('service.webTitle'), url: 'https://example.com' });
          useStore.setState({ selectedItemId: id, adhoc: null, mode: 'edit' });
        },
      },
      {
        key: 'import',
        icon: <FileUp size={15} />,
        label: t('import.button'),
        help: t('import.hint'),
        run: () => void importSlides(),
      },
    ];
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-[60] w-[min(320px,var(--radix-dropdown-menu-trigger-width))] min-w-[260px] rounded-[12px] bg-[var(--surface-2)] p-1.5 shadow-[var(--shadow-3)] outline-none focus-visible:!shadow-[var(--shadow-3)] data-[state=open]:animate-[ls-pop_120ms_ease-out]"
          >
            {entries.map((e) => (
              <DropdownMenu.Item
                key={e.key}
                aria-label={e.label}
                onSelect={e.run}
                className="flex cursor-pointer items-start gap-2.5 rounded-[8px] px-2.5 py-2 outline-none data-[highlighted]:bg-[var(--surface-3)]"
              >
                <Typography
                  tone="secondary"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-3)]"
                >
                  {e.icon}
                </Typography>
                <span className="min-w-0">
                  <Typography size={13} tone="primary" weight="medium" className="block">
                    {e.label}
                  </Typography>
                  <Typography size={11} tone="muted" leading="snug" className="block">
                    {e.help}
                  </Typography>
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

function ItemMenu({
  index,
  items,
  update,
  item,
  bg = 'panel',
}: {
  index: number;
  items: readonly ServiceItem[];
  item: ServiceItem;
  update: (fn: (xs: ServiceItem[]) => ServiceItem[]) => void;
  /** Background the overlay sits on, so its fade blends in. */
  bg?: 'panel' | 'hover' | 'selected' | 'band';
}) {
  const { t } = useTranslation();
  const isSection = item.kind === 'header';
  const can = isSection
    ? sectionCanMove(items, index)
    : { up: index > 0, down: index < items.length - 1 };
  const shift = (dir: -1 | 1): void =>
    update((xs) => (isSection ? moveSectionBy(xs, index, dir) : move(xs, index, index + dir)));
  const duplicate = (): void =>
    update((xs) => {
      // A heading duplicates its whole section, placed right after the original.
      const [start, end] = isSection ? sectionBounds(xs, index) : [index, index + 1];
      const copy = xs.slice(start, end).map((x) => ({ ...x, id: newId() }));
      return [...xs.slice(0, end), ...copy, ...xs.slice(end)];
    });
  // A step lighter than the row's own hover/selected fill, so the hovered button stands out.
  const cls = 'hover:!bg-[var(--surface-4)]';
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 right-1 flex items-center bg-gradient-to-l pl-8 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 [&>button]:pointer-events-auto ${
        bg === 'selected'
          ? 'from-[var(--select)] via-[var(--select)] [&>button]:!text-white'
          : bg === 'band'
            ? 'from-transparent via-transparent [&>button]:!text-white'
            : bg === 'hover'
              ? 'from-[var(--surface-2)] via-[var(--surface-2)]'
              : 'from-[var(--surface-1)] via-[var(--surface-1)]'
      } to-transparent`}
    >
      <IconButton
        size="xs"
        className={cls}
        disabled={!can.up}
        aria-label={isSection ? t('service.moveSectionUp') : t('service.moveUp')}
        onClick={() => shift(-1)}
      >
        <ChevronUp size={15} />
      </IconButton>
      <IconButton
        size="xs"
        className={cls}
        disabled={!can.down}
        aria-label={isSection ? t('service.moveSectionDown') : t('service.moveDown')}
        onClick={() => shift(1)}
      >
        <ChevronDown size={15} />
      </IconButton>
      <IconButton
        size="xs"
        className={cls}
        aria-label={isSection ? t('service.duplicateSection') : t('service.duplicate')}
        onClick={duplicate}
      >
        <Copy size={14} />
      </IconButton>
      <IconButton
        size="xs"
        variant="danger"
        aria-label={isSection ? t('service.removeSection') : t('service.remove')}
        onClick={() => {
          // A heading takes its whole section with it (Undo brings it all back).
          const [start, end] = isSection ? sectionBounds(items, index) : [index, index + 1];
          const gone = items.slice(start, end);
          const inside = gone.length - 1;
          if (
            isSection &&
            inside > 0 &&
            !window.confirm(
              t('service.confirmRemoveSection', {
                name: item.label,
                count: inside,
              }),
            )
          )
            return;
          const ids = new Set(gone.map((x) => x.id));
          update((xs) => xs.filter((x) => !ids.has(x.id)));
          const sel = useStore.getState().selectedItemId;
          if (sel && ids.has(sel)) useStore.setState({ selectedItemId: null });
        }}
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}
