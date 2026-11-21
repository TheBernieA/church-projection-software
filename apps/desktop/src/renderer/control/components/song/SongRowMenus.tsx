import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight,
  Copy,
  Eye,
  ListMusic,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type Song } from '@lampstand/core';
import { IconButton, Typography } from '@lampstand/ui';
import { openAdhoc } from '../../lib/actions';
import { openEditor } from '../../lib/editing';
import { addToPlaylist, copySong, deleteSong } from '../../lib/songs';
import { useStore } from '../../lib/store';
import { REVEAL } from '../cards';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';
import { MenuItem } from '../canvas/SlideList';

/** The playlists to add to (menu items): the open one first, then the most recently changed. */
export function PlaylistItems({ onPick }: { onPick: (playlistId: string) => void }) {
  const { t } = useTranslation();
  const services = useStore((s) => s.services);
  const openId = useStore((s) => s.service?.id);
  const list = services
    .filter((p) => !p.isTemplate)
    .sort((a, b) => Number(b.id === openId) - Number(a.id === openId));
  if (!list.length)
    return (
      <DropdownMenu.Item className={ITEM_CLASS} disabled>
        {t('library.noPlaylists')}
      </DropdownMenu.Item>
    );
  return (
    <>
      {list.map((p) => (
        <DropdownMenu.Item key={p.id} className={ITEM_CLASS} onSelect={() => onPick(p.id)}>
          <ListMusic size={13} />
          <Typography truncate className="flex-1">
            {p.name}
          </Typography>
          {p.id === openId && (
            <Typography size={11} tone="muted">
              {t('library.openPlaylist')}
            </Typography>
          )}
        </DropdownMenu.Item>
      ))}
    </>
  );
}

const addSong = (song: Song, playlistId: string): void =>
  void addToPlaylist({ id: newId(), kind: 'song', songId: song.id }, song.title, playlistId);

export const CONTENT = `${MENU_CLASS} max-h-[60vh] max-w-[300px] overflow-y-auto`;

/** The row's "Add to playlist" button: a menu of playlists. */
export function AddToPlaylistMenu({ song }: { song: Song }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="xs"
          className={`${REVEAL} data-[state=open]:opacity-100`}
          aria-label={t('library.addToService')}
          title={t('library.addToService')}
        >
          <ListPlus size={15} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={8} className={CONTENT}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t('library.addToService')}
          </DropdownMenu.Label>
          <PlaylistItems onPick={(id) => addSong(song, id)} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The row's ⋯ menu (a right-click on the row opens it too). */
export function SongMenu({
  song,
  open,
  onOpenChange,
}: {
  song: Song;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const item = { id: `adhoc-${song.id}`, kind: 'song' as const, songId: song.id };
  const readOnly = song.origin === 'hymnal';
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="xs"
          className={`${REVEAL} data-[state=open]:opacity-100`}
          aria-label={t('library.songMenu')}
          title={t('library.songMenu')}
        >
          <MoreHorizontal size={15} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={8} className={CONTENT}>
          <MenuItem
            icon={<Eye size={13} />}
            label={t('library.open')}
            onSelect={() => void openAdhoc(item, 'select')}
          />
          {!readOnly && (
            <MenuItem
              icon={<Pencil size={13} />}
              label={t('library.edit')}
              onSelect={() => void openAdhoc(item, 'select').then(() => openEditor(false))}
            />
          )}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={ITEM_CLASS}>
              <ListPlus size={13} />
              <span className="flex-1">{t('library.addToService')}</span>
              <ChevronRight size={13} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={4} collisionPadding={8} className={CONTENT}>
                <PlaylistItems onPick={(id) => addSong(song, id)} />
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <MenuItem
            icon={<Copy size={13} />}
            label={t('library.duplicate')}
            onSelect={() => void copySong(song)}
          />
          {!readOnly && (
            <>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
              <MenuItem
                icon={<Trash2 size={13} />}
                label={t('library.delete')}
                danger
                onSelect={() => void deleteSong(song, false)}
              />
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
