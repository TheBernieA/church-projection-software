import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newId, nowIso, type Song } from '@lampstand/core';
import {
  arrangementLabel,
  buildSongSlides,
  createEmptySong,
  parseArrangementOrder,
  parseSongText,
  songSectionsToText,
} from '@lampstand/lyrics';
import { Button } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { attempt, closeDialog, toast, useStore } from '../lib/store';
import { Dialog } from './Dialog';

/** Fast plain-text song editor with live slide preview (§9.1). */
export function SongEditor() {
  const open = useStore((s) => s.dialog === 'song');
  const editingId = useStore((s) => s.editingSongId);
  // A fresh body per opened song: form state initialises from the song, no syncing effects.
  return open ? <SongEditorBody key={editingId ?? 'new'} editingId={editingId} /> : null;
}

function SongEditorBody({ editingId }: { editingId: string | null }) {
  const { t } = useTranslation();
  const maxLines = useStore((s) => s.settings?.lyrics.maxLinesPerSlide ?? 4);
  const [base] = useState<Song>(() => {
    const existing = editingId
      ? useStore.getState().songs.find((s) => s.id === editingId)
      : undefined;
    return existing ?? createEmptySong('', nowIso());
  });
  const isNew = !editingId;
  const [title, setTitle] = useState(base.title);
  const [authors, setAuthors] = useState(base.authors.join(', '));
  const [copyright, setCopyright] = useState(base.copyright ?? '');
  const [ccli, setCcli] = useState(base.ccliNumber ?? '');
  const [text, setText] = useState(
    isNew ? '[Verse 1]\n\n[Chorus]\n' : songSectionsToText(base.sections),
  );
  const [order, setOrder] = useState(() => {
    const arr = base.arrangements.find((a) => a.id === base.defaultArrangementId);
    return arr ? arrangementLabel(arr.sectionOrder, base.sections) : '';
  });

  const draft: Song = useMemo(() => {
    const { sections } = parseSongText(text, base.sections);
    const arrangementId = base.defaultArrangementId;
    const sectionOrder = order.trim() ? parseArrangementOrder(order, sections) : [];
    const song: Song = {
      ...base,
      title: title.trim() || 'Untitled song',
      authors: authors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      sections,
      arrangements: base.arrangements.map((a) =>
        a.id === arrangementId ? { ...a, sectionOrder } : a,
      ),
    };
    if (copyright.trim()) song.copyright = copyright.trim();
    else delete song.copyright;
    if (ccli.trim()) song.ccliNumber = ccli.trim();
    else delete song.ccliNumber;
    return song;
  }, [base, text, order, title, authors, copyright, ccli]);

  const slides = useMemo(() => buildSongSlides(draft, { maxLines }), [draft, maxLines]);
  const readOnly = base.origin === 'hymnal';

  const save = async (): Promise<void> => {
    if ((await attempt(() => cmd('song.save', { entity: draft }), 'errors.save')) !== undefined)
      closeDialog();
  };
  const duplicate = async (): Promise<void> => {
    const now = nowIso();
    const copy: Song = {
      ...draft,
      id: newId(),
      origin: 'user',
      createdAt: now,
      updatedAt: now,
      title: draft.title,
    };
    await cmd('song.save', { entity: copy });
    useStore.setState({ editingSongId: copy.id });
  };
  const remove = async (): Promise<void> => {
    if (!editingId) return;
    await cmd('song.delete', { id: base.id });
    closeDialog();
    toast(
      `${base.title} deleted. Undo with ${window.lampstand.platform === 'darwin' ? '⌘Z' : 'Ctrl+Z'}.`,
    );
  };

  return (
    <Dialog
      name="song"
      wide
      title={editingId ? t('song.titleEdit') : t('song.titleNew')}
      footer={
        readOnly ? (
          <Button variant="primary" onClick={() => void duplicate()}>
            {t('song.duplicate')}
          </Button>
        ) : (
          <>
            {editingId && (
              <Button variant="danger" className="mr-auto" onClick={() => void remove()}>
                {t('song.delete')}
              </Button>
            )}
            <Button onClick={() => closeDialog()}>{t('song.cancel')}</Button>
            <Button variant="primary" onClick={() => void save()}>
              {t('song.save')}
            </Button>
          </>
        )
      }
    >
      {readOnly && (
        <p className="mb-3 rounded bg-[var(--accent-soft)] p-2 text-[12px]">{t('song.readOnly')}</p>
      )}
      <fieldset disabled={readOnly} className="grid grid-cols-[1fr_320px] gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="s-title">
                {t('song.title')}
              </label>
              <input
                id="s-title"
                className="field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="s-auth">
                {t('song.authors')}
              </label>
              <input
                id="s-auth"
                className="field"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="s-copy">
                {t('song.copyright')}
              </label>
              <input
                id="s-copy"
                className="field"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="s-ccli">
                {t('song.ccli')}
              </label>
              <input
                id="s-ccli"
                className="field"
                value={ccli}
                onChange={(e) => setCcli(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="s-lyrics">
              {t('song.lyrics')}
            </label>
            <textarea
              id="s-lyrics"
              className="field"
              rows={18}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck
            />
            <p className="mt-1 text-[11px] text-[var(--text-3)]">{t('song.lyricsHelp')}</p>
          </div>
          <div>
            <label className="label" htmlFor="s-arr">
              {t('song.arrangement')}
            </label>
            <input
              id="s-arr"
              className="field"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              placeholder="V1 C V2 C B C"
            />
            <p className="mt-1 text-[11px] text-[var(--text-3)]">{t('song.arrangementHelp')}</p>
          </div>
        </div>
        <div className="min-h-0">
          <span className="label">
            {t('song.preview')} · {slides.length}
          </span>
          <ol className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {slides.map((s, i) => (
              <li
                key={s.key}
                className="rounded bg-black p-2 text-center text-[12px] leading-snug text-white"
              >
                <div className="mb-1 text-left text-[10px] text-[var(--text-3)]">
                  {i + 1} · {s.label}
                </div>
                {s.lines.map((l, j) => (
                  <div key={j}>{l}</div>
                ))}
              </li>
            ))}
          </ol>
        </div>
      </fieldset>
    </Dialog>
  );
}
