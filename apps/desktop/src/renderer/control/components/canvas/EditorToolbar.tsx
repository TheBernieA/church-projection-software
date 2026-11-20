import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  FolderPlus,
  Image as ImageIcon,
  Minus,
  Plus,
  Scissors,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@lampstand/ui';
import { usePictures } from '../../lib/hooks';
import { importMedia } from '../../lib/mediaPlaylists';
import { editObjects, newObject } from '../../lib/objects';
import { displayCombo } from '../../lib/shortcuts';
import { useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS } from '../menu';
import { mediaUrl } from '../../../shared/mediaUrl';
import { Tool, ToolBar, ToolDivider } from './tools';
import { type ObjectKind, type TextItem } from '../../types';

const ADD: { kind: Exclude<ObjectKind, 'image'>; icon: typeof Type }[] = [
  { kind: 'text', icon: Type },
  { kind: 'rect', icon: Square },
  { kind: 'ellipse', icon: Circle },
  { kind: 'line', icon: Minus },
];

/** Pictures from the media library, to place on the slide (or import one). */
function PictureTool({ onPick }: { onPick: (mediaId: string) => void }) {
  const { t } = useTranslation();
  const pictures = usePictures();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Tool icon={<ImageIcon size={17} />} label={t('canvas.kinds.image')} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={6}
          className={`${MENU_CLASS} max-h-[360px] w-[280px] overflow-y-auto`}
        >
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t('canvas.addPicture')}
          </DropdownMenu.Label>
          {pictures.length === 0 && (
            <Typography as="p" size={12} tone="muted" leading="snug" className="px-2 py-1.5">
              {t('canvas.noPictures')}
            </Typography>
          )}
          {pictures.map((m) => (
            <DropdownMenu.Item key={m.id} className={ITEM_CLASS} onSelect={() => onPick(m.id)}>
              <img
                src={mediaUrl(m.id)}
                alt=""
                className="h-7 w-12 shrink-0 rounded-[3px] object-cover"
                draggable={false}
              />
              <Typography truncate className="min-w-0">
                {m.name}
              </Typography>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline)]" />
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void importMedia({})}>
            <Plus size={14} />
            {t('canvas.importPicture')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Shapes and pictures to add to a text slide, and the selected one's order (or delete it). */
function ObjectTools({ item, index }: { item: TextItem; index: number }) {
  const { t } = useTranslation();
  const selected = useStore((s) => s.editObjectId);
  const objects = item.slides[index]?.objects ?? [];
  const at = objects.findIndex((o) => o.id === selected);
  const add = (kind: ObjectKind, mediaId?: string): void => {
    const o = newObject(kind, mediaId);
    editObjects(item, index, (os) => [...os, o]);
    useStore.setState({ editObjectId: o.id });
  };
  const arrange = (to: number): void =>
    editObjects(item, index, (os) => {
      const next = [...os];
      const [o] = next.splice(at, 1);
      if (o) next.splice(Math.max(0, Math.min(next.length, to)), 0, o);
      return next;
    });
  return (
    <>
      <ToolDivider />
      {ADD.map(({ kind, icon: Icon }) => (
        <Tool
          key={kind}
          icon={<Icon size={17} />}
          label={t(`canvas.kinds.${kind}`)}
          onClick={() => add(kind)}
        />
      ))}
      <PictureTool onPick={(id) => add('image', id)} />
      <ToolDivider />
      <Tool
        icon={<ArrowUpToLine size={17} />}
        label={t('canvas.forward')}
        disabled={at < 0 || at === objects.length - 1}
        onClick={() => arrange(at + 1)}
      />
      <Tool
        icon={<ArrowDownToLine size={17} />}
        label={t('canvas.backward')}
        disabled={at <= 0}
        onClick={() => arrange(at - 1)}
      />
      <Tool
        icon={<Trash2 size={17} />}
        label={t('canvas.delete')}
        disabled={at < 0}
        danger
        onClick={() => {
          editObjects(item, index, (os) => os.filter((o) => o.id !== selected));
          useStore.setState({ editObjectId: null });
        }}
      />
    </>
  );
}

/**
 * The editor's one tool bar, the same for every item: type the slide's words, add a slide, then
 * what the item can hold. Songs add groups and split long slides; text slides add text boxes,
 * shapes and pictures. Tools an item can't use are left out.
 */
export function EditorToolbar({
  typing,
  onType,
  onNewSlide,
  onNewGroup,
  split,
  objects,
}: {
  /** Typing the slide's words now. */
  typing: boolean;
  onType: () => void;
  onNewSlide: () => void;
  onNewGroup?: () => void;
  /** Split a long slide (songs). */
  split?: { disabled: boolean; title: string; onClick: () => void };
  /** The slide whose shapes and pictures to edit (text slides). */
  objects?: { item: TextItem; index: number };
}) {
  const { t } = useTranslation();
  return (
    <ToolBar label={t('canvas.tools')}>
      <Tool
        icon={<Type size={17} />}
        label={t('canvas.toolText')}
        title={t('canvas.toolTextHint')}
        active={typing}
        onClick={onType}
      />
      <Tool
        icon={<Plus size={17} />}
        label={t('canvas.toolSlide')}
        title={`${t('canvas.newSlide')} (${displayCombo('Mod+Shift+N')})`}
        onClick={onNewSlide}
      />
      {onNewGroup && (
        <Tool
          icon={<FolderPlus size={17} />}
          label={t('canvas.toolGroup')}
          title={t('songEditor.newGroup')}
          onClick={onNewGroup}
        />
      )}
      {split && (
        <Tool
          icon={<Scissors size={17} />}
          label={t('songEditor.split')}
          title={split.title}
          disabled={split.disabled}
          onClick={split.onClick}
        />
      )}
      {objects && <ObjectTools {...objects} />}
    </ToolBar>
  );
}
