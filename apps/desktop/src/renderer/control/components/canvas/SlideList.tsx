import { useRef, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Scene } from '@lampstand/core';
import { Button, IconButton, TallyTag, Typography } from '@lampstand/ui';
import { AddCard, REVEAL } from '../cards';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { SceneView } from '../SceneView';

const DRAG = 'application/x-lampstand-edit-slide';

/** One slide in the list, as the editor shows it. */
export interface ListSlide {
  key: string;
  scene: Scene;
  /** The slide's place in its item (null: a new slide, not made yet). */
  index: number | null;
  /** Under the picture, after the number. */
  caption?: string;
  /** A heading before it (a song's group). */
  header?: ReactNode;
  /** Over the picture's corner (e.g. "Long"). */
  badge?: ReactNode;
  /** Over the picture (a new slide's prompt). */
  overlay?: ReactNode;
  live?: boolean;
}

export interface SlideListProps {
  /** The slides in the order shown; `selected` is the shown position being edited. */
  slides: ListSlide[];
  selected: number;
  onSelect: (shown: number) => void;
  onMove?: (from: number, to: number) => void;
  onDelete?: (index: number) => void;
  /** A slide's menu (its ⋯, or a right-click): DropdownMenu items. */
  menu?: (index: number) => ReactNode;
  /** The list's "+" (vertical, by the title) and Add card (filmstrip). */
  addMenu?: ReactNode;
  onAdd?: () => void;
  title: string;
  readOnly?: boolean;
  /** Under the list (vertical): the slide's objects. */
  footer?: ReactNode;
}

/** One line of a slide's menu (or the list's "+"). */
export function MenuItem({
  icon,
  label,
  shortcut,
  danger,
  disabled,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      className={`${ITEM_CLASS} ${danger ? '!text-[var(--tally-program)]' : ''}`}
      disabled={disabled}
      onSelect={onSelect}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <Typography size={11} tone="muted">
          {shortcut}
        </Typography>
      )}
    </DropdownMenu.Item>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className={SEPARATOR_CLASS} />;

/** A slide's menu, opened from its ⋯ or a right-click on it. */
function SlideMenu({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="3xs"
          variant="secondary"
          aria-label={label}
          className={`absolute right-1 top-1 !rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-black/80 data-[state=open]:opacity-100 ${REVEAL}`}
        >
          <MoreHorizontal size={12} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={`${MENU_CLASS} w-[220px]`}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The slides being edited: down the side (expanded, with the item's name and a "+") or along the
 * bottom (compact, with an Add card at the end). Click one to edit it, drag to reorder, arrow keys
 * to move through them, Delete to remove one; each slide's ⋯ (or a right-click) has the rest.
 */
export function SlideList({
  orientation,
  slides,
  selected,
  onSelect,
  onMove,
  onDelete,
  menu,
  addMenu,
  onAdd,
  title,
  readOnly,
  footer,
}: SlideListProps & { orientation: 'vertical' | 'horizontal' }) {
  const { t } = useTranslation();
  const list = useRef<HTMLOListElement>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const vertical = orientation === 'vertical';
  const grouped = slides.some((s) => s.header !== undefined);
  const focus = (shown: number): void => {
    const to = Math.max(0, Math.min(shown, slides.length - 1));
    onSelect(to);
    requestAnimationFrame(() =>
      list.current?.querySelectorAll<HTMLElement>('[data-slide]')[to]?.focus(),
    );
  };

  const items = slides.map((s, shown) => {
    const index = s.index;
    const on = shown === selected;
    const canDrag = !readOnly && index !== null && !!onMove;
    return (
      <li key={s.key} className={vertical ? '' : 'flex w-44 shrink-0 flex-col'}>
        {/* Along the bottom, every slide keeps a heading's height so the pictures line up. */}
        {vertical ? s.header : grouped && <div className="h-7">{s.header}</div>}
        <div
          className={`group relative ${vertical ? 'px-2 pb-2 pt-1' : 'pt-1'} ${dragFrom === index ? 'opacity-40' : ''}`}
          draggable={canDrag}
          onDragStart={(e) => {
            if (index === null) return;
            e.dataTransfer.setData(DRAG, String(index));
            e.dataTransfer.effectAllowed = 'move';
            setDragFrom(index);
          }}
          onDragEnd={() => {
            setDragFrom(null);
            setDropAt(null);
          }}
          onDragOver={(e) => {
            if (index === null || !e.dataTransfer.types.includes(DRAG)) return;
            e.preventDefault();
            setDropAt(index);
          }}
          onDrop={(e) => {
            const from = Number(e.dataTransfer.getData(DRAG));
            setDragFrom(null);
            setDropAt(null);
            if (index !== null && Number.isInteger(from) && from !== index) onMove?.(from, index);
          }}
          onContextMenu={(e) => {
            if (readOnly || index === null || !menu) return;
            e.preventDefault();
            setMenuAt(index);
          }}
        >
          {index !== null && dropAt === index && dragFrom !== null && dragFrom !== index && (
            <span
              aria-hidden
              className={`absolute z-[1] rounded-full bg-[var(--select)] ${
                vertical
                  ? `left-2 right-2 h-0.5 ${dragFrom < index ? 'bottom-0' : 'top-0'}`
                  : `bottom-5 top-1 w-0.5 ${dragFrom < index ? '-right-1.5' : '-left-1.5'}`
              }`}
            />
          )}
          <Button
            variant="bare"
            data-slide
            aria-current={on || undefined}
            aria-label={t('inspector.slideOf', { n: shown + 1, total: slides.length })}
            onClick={() => onSelect(shown)}
            onKeyDown={(e) => {
              const next = vertical ? 'ArrowDown' : 'ArrowRight';
              const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
              if (e.key === next || e.key === (vertical ? 'ArrowRight' : 'ArrowDown')) {
                e.preventDefault();
                focus(shown + 1);
              } else if (e.key === prev || e.key === (vertical ? 'ArrowLeft' : 'ArrowUp')) {
                e.preventDefault();
                focus(shown - 1);
              } else if (
                (e.key === 'Delete' || e.key === 'Backspace') &&
                index !== null &&
                !readOnly &&
                onDelete
              ) {
                e.preventDefault();
                onDelete(index);
              }
            }}
            className="relative block w-full overflow-hidden rounded-[3px] text-left focus-visible:outline-none"
            style={{
              boxShadow: on
                ? '0 0 0 3px var(--accent)'
                : s.live
                  ? 'var(--tally-program-glow)'
                  : '0 0 0 1px var(--hairline-strong)',
            }}
          >
            <SceneView scene={s.scene} mode="thumbnail" />
            {s.overlay}
            {s.live && (
              <TallyTag tone="program" className="!left-1.5 !right-auto">
                LIVE
              </TallyTag>
            )}
            {s.badge}
          </Button>
          <Typography
            size={11}
            weight={on ? 'semibold' : 'regular'}
            tone={on ? 'primary' : 'muted'}
            tabular
            truncate
            className="mt-1 block"
          >
            {shown + 1}.{s.caption ? ` ${s.caption}` : ''}
          </Typography>
          {!readOnly && index !== null && menu && (
            <SlideMenu
              label={t('canvas.slideMenu', { n: shown + 1 })}
              open={menuAt === index}
              onOpenChange={(o) => setMenuAt(o ? index : null)}
            >
              {menu(index)}
            </SlideMenu>
          )}
        </div>
      </li>
    );
  });

  if (!vertical)
    return (
      <ol
        ref={list}
        aria-label={t('canvas.slides')}
        className="flex shrink-0 items-start gap-3 overflow-x-auto border-t border-[var(--hairline)] bg-[var(--surface-1)] px-4 pb-3 pt-2"
      >
        {items}
        {!readOnly && onAdd && (
          <li className={grouped ? 'pt-8' : 'pt-1'}>
            <AddCard
              label={t('inspector.addSlide')}
              icon={<Plus size={16} />}
              className="aspect-video w-44 rounded-[6px]"
              onClick={onAdd}
            />
          </li>
        )}
      </ol>
    );
  return (
    <nav
      aria-label={t('canvas.slides')}
      className="flex w-[240px] shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--surface-1)] @max-[640px]:w-[160px]"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--hairline)] pl-3 pr-1.5">
        <Typography as="h2" size={13} weight="semibold" tone="primary" truncate className="flex-1">
          {title}
        </Typography>
        {!readOnly && addMenu && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <IconButton size="xs" variant="quiet" aria-label={t('canvas.add')}>
                <Plus size={15} />
              </IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className={`${MENU_CLASS} w-[220px]`}
              >
                {addMenu}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </header>
      <ol ref={list} className="min-h-0 flex-1 overflow-y-auto pb-2">
        {items}
      </ol>
      {footer}
    </nav>
  );
}

/** The slide's objects, under the list: click one to select it (or type, for the words). */
export function ObjectsPanel({
  rows,
}: {
  rows: { key: string; icon: ReactNode; label: string; selected: boolean; onClick: () => void }[];
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('canvas.objects')}
      className="max-h-[35%] shrink-0 overflow-y-auto border-t border-[var(--hairline)] bg-[var(--surface-1)] pb-2"
    >
      <Typography as="h3" variant="overline" className="flex h-8 items-center px-3">
        {t('canvas.objects')}
      </Typography>
      {rows.map((r) => (
        <Button
          key={r.key}
          variant="bare"
          aria-pressed={r.selected}
          onClick={r.onClick}
          className={`mx-2 flex h-8 w-[calc(100%-16px)] items-center gap-2 rounded-[5px] px-2 text-left ${
            r.selected ? 'bg-[var(--select)] text-white' : 'hover:bg-[var(--surface-2)]'
          }`}
        >
          <span className="flex shrink-0">{r.icon}</span>
          <Typography size={12} tone="inherit" truncate>
            {r.label}
          </Typography>
        </Button>
      ))}
    </section>
  );
}
