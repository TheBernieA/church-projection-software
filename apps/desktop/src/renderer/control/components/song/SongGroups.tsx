import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Copy, FolderPlus, MoreHorizontal, Scissors, Tag, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GROUP_LABELS, type EditorSlide } from '@lampstand/lyrics';
import { IconButton, Typography } from '@lampstand/ui';
import { groupColor } from '../../lib/slides';
import { MenuItem, MenuSeparator, NewSlideMenuItem } from '../canvas/SlideList';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { type SongEditorState } from './useSongEditor';

/** A song's groups (Verse 1, Chorus…) in the slide list: their headings and menus. */

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
export function SongSlideMenu({ ed, index }: { ed: SongEditorState; index: number }) {
  const { t } = useTranslation();
  const long = (ed.slides[index]?.lines.length ?? 0) > ed.maxLines;
  return (
    <>
      <NewSlideMenuItem onSelect={() => ed.newSlide(index)} />
      <MenuItem
        icon={<Copy size={13} />}
        label={t('canvas.duplicate')}
        onSelect={() => ed.duplicate(index)}
      />
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
        <MenuItem
          icon={<Scissors size={13} />}
          label={t('songEditor.split')}
          onSelect={() => ed.splitLong(index)}
        />
      )}
      <MenuSeparator />
      <MenuItem
        icon={<Trash2 size={13} />}
        label={t('canvas.deleteSlide')}
        danger
        onSelect={() => ed.remove(index)}
      />
    </>
  );
}

/** The "+" by the song's name: a new slide (⇧⌘N) or a new group. */
export function SongAddMenu({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  return (
    <>
      <NewSlideMenuItem onSelect={() => ed.newSlide()} />
      <MenuItem
        icon={<FolderPlus size={13} />}
        label={t('songEditor.newGroup')}
        onSelect={ed.addGroup}
      />
    </>
  );
}

/** A group's heading: its colour and name (typed in place when renaming), and its menu. */
export function GroupHeader({
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
