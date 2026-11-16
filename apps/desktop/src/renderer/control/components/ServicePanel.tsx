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
import { Button, IconButton, PanelHeader } from '@lampstand/ui';
import { importSlides } from '../lib/importSlides';
import { itemTitle } from '../lib/slides';
import { moveItem as move } from '../lib/array';
import { isLibraryDrag, readLibraryDrop } from '../lib/libraryDrag';
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
export function ServicePanel() {
  const { t } = useTranslation();
  const service = useStore((s) => s.service);
  const selected = useStore((s) => s.selectedItemId);
  const liveItem = useStore((s) => s.liveCursor?.itemId);
  const previewItem = useStore((s) => s.previewCursor?.itemId);
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
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
        useStore.setState({ selectedItemId: item.id, adhoc: null });
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
      <PanelHeader
        title={t('service.title')}
        subtitle={`${items.filter((i) => i.kind !== 'header').length}`}
      />
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
          <li
            onDragOver={(e) => trackOver(e, 0)}
            onDrop={drop}
            className={`mx-2 rounded-[var(--radius-card)] border border-dashed p-5 text-center text-[13px] text-[var(--text-3)] ${incoming ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--hairline-strong)]'}`}
          >
            {t('service.empty')}
          </li>
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
                className={`group relative mt-3 flex h-8 items-center px-2 first:mt-1 ${dropLine} ${dimmed}`}
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
                  <button
                    type="button"
                    onDoubleClick={() => setEditing(item.id)}
                    title={t('service.renameHint')}
                    className="section-label max-w-[70%] shrink-0 truncate text-left !text-[var(--accent)]"
                  >
                    {item.label}
                  </button>
                )}
                {/* A hairline runs from the section name to the edge. */}
                {editing !== item.id && (
                  <span aria-hidden className="ml-2 h-px flex-1 bg-[var(--hairline-strong)]" />
                )}
                <ItemMenu index={i} items={items} update={update} item={item} />
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
                    ? 'bg-[var(--surface-3)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
                    : 'hover:bg-[var(--surface-2)]'
                }`}
              >
                {/* Edge bar: red while live, accent while selected. */}
                {(isLive || isSel) && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
                    style={{
                      background: isLive ? 'var(--tally-program)' : 'var(--accent)',
                    }}
                  />
                )}
                <GripVertical
                  size={14}
                  aria-hidden
                  className="ml-0.5 shrink-0 text-[var(--text-3)] opacity-0 transition-opacity group-hover:opacity-100"
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
                  onClick={() => useStore.setState({ selectedItemId: item.id, adhoc: null })}
                  aria-current={isSel}
                >
                  <KindTile kind={item.kind} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span
                      className={`truncate text-[13px] ${isSel ? 'font-semibold text-[var(--text-1)]' : 'font-medium text-[var(--text-1)]'}`}
                    >
                      {itemTitle(item, { songs, media })}
                    </span>
                    <span className="truncate text-[12px] text-[var(--text-3)]">
                      {subtitle(item)}
                    </span>
                  </span>
                </button>
                {isLive && (
                  <span className="shrink-0 rounded-[5px] bg-[var(--tally-program)] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                    LIVE
                  </span>
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
      <AddBar update={update} />
    </section>
  );
}

/**
 * "+ Add" at the foot of the service plan: one button, a menu of what can be added (section,
 * text slides, countdown, web page, import), each with a line saying what it is.
 */
function AddBar({ update }: { update: (fn: (xs: ServiceItem[]) => ServiceItem[]) => void }) {
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
    <div className="px-2.5 py-2.5 shadow-[0_-1px_0_var(--hairline)]">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button size="sm" variant="subtle" className="w-full" icon={<Plus size={15} />}>
            {t('service.add')}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-[60] w-[min(320px,var(--radix-dropdown-menu-trigger-width))] min-w-[260px] rounded-[12px] bg-[var(--surface-2)] p-1.5 shadow-[var(--shadow-3)] data-[state=open]:animate-[ls-pop_120ms_ease-out]"
          >
            {entries.map((e) => (
              <DropdownMenu.Item
                key={e.key}
                aria-label={e.label}
                onSelect={e.run}
                className="flex cursor-pointer items-start gap-2.5 rounded-[8px] px-2.5 py-2 outline-none data-[highlighted]:bg-[var(--surface-3)]"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-3)] text-[var(--text-2)]">
                  {e.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[var(--text-1)]">
                    {e.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-[var(--text-3)]">
                    {e.help}
                  </span>
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
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
  bg?: 'panel' | 'hover' | 'selected';
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
          ? 'from-[var(--surface-3)] via-[var(--surface-3)]'
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
        aria-label={isSection ? t('service.removeHeading') : t('service.remove')}
        onClick={() => {
          update((xs) => xs.filter((x) => x.id !== item.id));
          if (useStore.getState().selectedItemId === item.id)
            useStore.setState({ selectedItemId: null });
        }}
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}
