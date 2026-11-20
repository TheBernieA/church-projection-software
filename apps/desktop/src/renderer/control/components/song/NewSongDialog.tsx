import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { createSong } from '../../lib/songs';
import { closeDialog, useStore } from '../../lib/store';
import { Dialog } from '../Dialog';
import { Field } from '../form';
import { Select } from '../Select';
import { ThemePicker } from './ThemePicker';

const NO_PLAYLIST = 'none';

/** New song: its name, how it looks, and which playlist it goes in. Create opens it in Edit. */
export function NewSongDialog() {
  const open = useStore((s) => s.dialog === 'newSong');
  // A fresh form each time it opens.
  return open ? <NewSongForm /> : null;
}

function NewSongForm() {
  const { t } = useTranslation();
  const services = useStore((s) => s.services);
  const [title, setTitle] = useState('');
  const [themeId, setThemeId] = useState<string | null>(null);
  // The open playlist when the sidebar shows it (that's where the operator is working), else none.
  const [playlist, setPlaylist] = useState(() => {
    const s = useStore.getState();
    return (s.sidebarView === 'playlist' && s.service?.id) || NO_PLAYLIST;
  });
  const [busy, setBusy] = useState(false);
  const playlists = services.filter((s) => !s.isTemplate);

  const create = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const ok = await createSong({
      title,
      themeId,
      playlistId: playlist === NO_PLAYLIST ? null : playlist,
    });
    if (ok) closeDialog();
    else setBusy(false);
  };

  return (
    <Dialog
      name="newSong"
      title={t('song.titleNew')}
      footer={
        <>
          <Button onClick={() => closeDialog()}>{t('song.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void create()}>
            {t('song.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('song.title')} htmlFor="new-song-title">
          <input
            id="new-song-title"
            className="field"
            value={title}
            maxLength={200}
            placeholder={t('song.untitled')}
            onChange={(e) => setTitle(e.target.value)}
            // Enter in the name creates the song.
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            autoFocus
          />
        </Field>
        <Field label={t('song.theme')} htmlFor="new-song-theme">
          <ThemePicker id="new-song-theme" value={themeId} onChange={setThemeId} />
        </Field>
        <Field label={t('song.playlist')} htmlFor="new-song-playlist">
          <Select
            id="new-song-playlist"
            value={playlist}
            onChange={setPlaylist}
            options={[
              { value: NO_PLAYLIST, label: t('song.noPlaylist') },
              ...playlists.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
        <Typography as="p" variant="caption" leading="snug">
          {t('song.newHelp')}
        </Typography>
      </div>
    </Dialog>
  );
}
