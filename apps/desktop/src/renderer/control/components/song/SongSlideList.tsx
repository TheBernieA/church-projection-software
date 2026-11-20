import { useState, type KeyboardEvent, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Copy, FolderPlus, MoreHorizontal, Plus, Scissors, Tag, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GROUP_LABELS, type EditorSlide } from '@lampstand/lyrics';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { groupColor } from '../../lib/slides';
import { displayCombo } from '../../lib/shortcuts';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { REVEAL } from '../cards';
import { SceneView } from '../SceneView';
import { type SongEditorState } from './useSongEditor';

const DRAG = 'application/x-lampstand-song-slide';

/** The names a slide can be grouped under: the usual ones, minus those other groups have. */
function GroupNames({
  ed,
  index,
  onPick,
}: {
  ed: SongEditorState;
  index: number;
  onPick: (label: string) => void;
}) {
  const { t } = useTranslation();
  const own = ed.slides[index]?.sectionId;
  const taken = new Set(
    ed.song.sections.filter((s) => s.id !== own).map((s) => s.label.toLowerCase()),
  );
  return (
    <>
      {GROUP_LABELS.map((label) => (
        <DropdownMenu.Item
          key={label}
          className={ITEM_CLASS}
          disabled={taken.has(label.toLowerCase())}
          onSelect={() => onPick(label)}
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: groupColor(label) }}
          />
          {label}
        </DropdownMenu.Item>
      ))}
      <DropdownMenu.Separator className={SEPARATOR_CLASS} />
      <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => ed.groupCustom(index)}>
        <Tag size={13} />
        {t('songEditor.customGroup')}
      </DropdownMenu.Item>
    </>
  );
}

/** A slide's menu (its ⋯, or a right-click): new slide, duplicate, group, split, delete. */
function SlideMenu({
  ed,
  index,
  open,
  onOpenChange,
}: {
  ed: SongEditorState;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const slide = ed.slides[index];
  const long = (slide?.lines.length ?? 0) > ed.maxLines;
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="3xs"
          variant="secondary"
          aria-label={t('songEditor.slideMenu', { n: index + 1 })}
          className={`absolute right-1 top-1 !rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-black/80 data-[state=open]:opacity-100 ${REVEAL}`}
        >
          <MoreHorizontal size={12} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={`${MENU_CLASS} w-[220px]`}>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => ed.newSlide(index)}>
            <Plus size={13} />
            <span className="flex-1">{t('songEditor.newSlide')}</span>
            <Typography size={11} tone="muted">
              {displayCombo('Mod+Shift+N')}
            </Typography>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => ed.duplicate(index)}>
            <Copy size={13} />
            {t('songEditor.duplicate')}
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={ITEM_CLASS}>
              <Tag size={13} />
              {t('songEditor.group')}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={4} className={`${MENU_CLASS} w-[190px]`}>
                <GroupNames ed={ed} index={index} onPick={(label) => ed.group(index, label)} />
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          {long && (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => ed.splitLong(index)}>
              <Scissors size={13} />
              {t('songEditor.split')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Item
            className={`${ITEM_CLASS} !text-[var(--tally-program)]`}
            onSelect={() => ed.remove(index)}
          >
            <Trash2 size={13} />
            {t('songEditor.delete')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A group's heading: its colour and name (typed in place when renaming), and its menu. */
function GroupHeader({
  ed,
  index,
  slide,
}: {
  ed: SongEditorState;
  index: number;
  slide: EditorSlide;
}) {
  const { t } = useTranslation();
  const section = ed.song.sections.find((s) => s.id === slide.sectionId);
  if (!section) return null;
  const first = ed.song.sections[0]?.id === section.id;
  return (
    <div className="sticky top-0 z-[1] flex h-7 items-center gap-1.5 bg-[var(--surface-1)] px-2">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: groupColor(section.label) }}
      />
      {ed.renaming === section.id ? (
        <input
          className="field !h-6 min-w-0 flex-1 !px-1.5"
          aria-label={t('songEditor.groupName')}
          defaultValue={section.label}
          maxLength={60}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => ed.rename(section.id, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              e.preventDefault();
              ed.stopRenaming();
            }
            e.stopPropagation();
          }}
        />
      ) : (
        <Typography
          size={11}
          weight="bold"
          caps
          truncate
          tone="secondary"
          className="min-w-0 flex-1"
          onDoubleClick={() => !ed.readOnly && ed.startRenaming(section.id)}
        >
          {section.label}
        </Typography>
      )}
      {!ed.readOnly && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <IconButton
              size="3xs"
              variant="quiet"
              aria-label={t('songEditor.groupMenu', { name: section.label })}
            >
              <MoreHorizontal size={13} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className={`${MENU_CLASS} w-[200px]`}>
              <DropdownMenu.Item
                className={ITEM_CLASS}
                onSelect={() => ed.startRenaming(section.id)}
              >
                <Tag size={13} />
                {t('songEditor.rename')}
              </DropdownMenu.Item>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={ITEM_CLASS}>
                  <Tag size={13} />
                  {t('songEditor.groupAs')}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent sideOffset={4} className={`${MENU_CLASS} w-[190px]`}>
                    <GroupNames
                      ed={ed}
                      index={index}
                      onPick={(label) => ed.rename(section.id, label)}
                    />
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Item
                className={ITEM_CLASS}
                disabled={first}
                onSelect={() => ed.ungroup(section.id)}
              >
                <FolderPlus size={13} />
                {t('songEditor.ungroup')}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
              <DropdownMenu.Item
                className={`${ITEM_CLASS} !text-[var(--tally-program)]`}
                onSelect={() => ed.removeGroup(section.id)}
              >
                <Trash2 size={13} />
                {t('songEditor.deleteGroup')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}

/** One slide's picture, numbered, outlined when it's the one being edited. */
function Thumb({
  ed,
  lines,
  n,
  selected,
  label,
  onClick,
  onKeyDown,
  children,
}: {
  ed: SongEditorState;
  lines: string[];
  n: number;
  selected: boolean;
  label: string;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
}) {
  return (
    <Button
      variant="bare"
      data-slide
      aria-current={selected || undefined}
      aria-label={label}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="relative block w-full overflow-hidden rounded-[6px] text-left focus-visible:outline-none"
      style={{
        boxShadow: selected
          ? '0 0 0 2px var(--accent), 0 8px 22px rgba(0,0,0,0.4)'
          : '0 0 0 1px var(--hairline-strong)',
      }}
    >
      <SceneView scene={ed.scene(lines, n - 1)} mode="thumbnail" />
      <Typography
        size={11}
        weight="bold"
        tone="white"
        tabular
        className="absolute bottom-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/65 px-1.5 backdrop-blur-sm"
      >
        {n}
      </Typography>
      {children}
    </Button>
  );
}

/**
 * The song's slides down the side, under their groups (Verse 1, Chorus…): click one to edit it,
 * drag to reorder (a slide dropped among another group's joins it), and each slide's ⋯ (or a
 * right-click) for the rest. New slide and New group at the end.
 */
export function SongSlideList({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const focus = (i: number): void => {
    ed.select(i);
    requestAnimationFrame(() =>
      document.querySelectorAll<HTMLElement>('[data-song-slides] [data-slide]')[i]?.focus(),
    );
  };
  const placeholder = (
    <li key="pending" className="px-2 pb-2">
      <Thumb ed={ed} lines={[]} n={ed.at + 1} selected label={t('songEditor.newSlide')}>
        <Typography
          size={11}
          tone="inherit"
          className="absolute inset-0 flex items-center justify-center text-white/70"
        >
          {t('songEditor.typeNew')}
        </Typography>
      </Thumb>
    </li>
  );
  return (
    <nav
      aria-label={t('songEditor.slides')}
      className="flex w-[220px] shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--surface-1)] @max-[640px]:w-[150px]"
    >
      <ol data-song-slides className="min-h-0 flex-1 overflow-y-auto pb-2">
        {ed.slides.map((slide, i) => {
          const shown = ed.pending && i >= ed.at ? i + 2 : i + 1;
          const startsGroup = ed.slides[i - 1]?.sectionId !== slide.sectionId;
          return [
            ed.pending && i === ed.at ? placeholder : null,
            startsGroup ? (
              <li key={`g-${slide.sectionId}`}>
                <GroupHeader ed={ed} index={i} slide={slide} />
              </li>
            ) : null,
            <li
              key={`${slide.sectionId}:${i}`}
              className={`group relative px-2 pb-2 ${dragFrom === i ? 'opacity-40' : ''}`}
              draggable={!ed.readOnly}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG, String(i));
                e.dataTransfer.effectAllowed = 'move';
                setDragFrom(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG)) return;
                e.preventDefault();
                setDropAt(i);
              }}
              onDrop={(e) => {
                const from = Number(e.dataTransfer.getData(DRAG));
                setDragFrom(null);
                setDropAt(null);
                if (Number.isInteger(from) && from !== i) ed.move(from, i);
              }}
              onContextMenu={(e) => {
                if (ed.readOnly) return;
                e.preventDefault();
                setMenuAt(i);
              }}
            >
              {dropAt === i && dragFrom !== null && dragFrom !== i && (
                <span
                  aria-hidden
                  className={`absolute left-2 right-2 z-[1] h-0.5 rounded-full bg-[var(--select)] ${
                    dragFrom < i ? '-bottom-0' : '-top-1'
                  }`}
                />
              )}
              <Thumb
                ed={ed}
                lines={slide.lines}
                n={shown}
                selected={!ed.pending && i === ed.at}
                label={t('inspector.slideOf', { n: shown, total: ed.total })}
                onClick={() => ed.select(i)}
                // Arrow keys move through the slides; Delete removes the focused one.
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    focus(i + 1);
                  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    focus(i - 1);
                  } else if ((e.key === 'Delete' || e.key === 'Backspace') && !ed.readOnly) {
                    e.preventDefault();
                    ed.remove(i);
                  }
                }}
              >
                {slide.lines.length > ed.maxLines && (
                  <Typography
                    size={10}
                    weight="bold"
                    tone="inherit"
                    title={t('songEditor.longHint', { max: ed.maxLines })}
                    className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-[var(--warning,#b7791f)] px-1 text-black"
                  >
                    {t('songEditor.long')}
                  </Typography>
                )}
              </Thumb>
              {!ed.readOnly && (
                <SlideMenu
                  ed={ed}
                  index={i}
                  open={menuAt === i}
                  onOpenChange={(o) => setMenuAt(o ? i : null)}
                />
              )}
            </li>,
          ];
        })}
        {ed.pending && ed.at >= ed.slides.length && placeholder}
      </ol>
      {!ed.readOnly && (
        <div className="flex shrink-0 gap-1 border-t border-[var(--hairline)] p-2">
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus size={13} />}
            className="flex-1"
            title={displayCombo('Mod+Shift+N')}
            onClick={() => ed.newSlide()}
          >
            {t('songEditor.newSlide')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={<FolderPlus size={13} />}
            className="flex-1"
            onClick={ed.addGroup}
          >
            {t('songEditor.newGroup')}
          </Button>
        </div>
      )}
    </nav>
  );
}
