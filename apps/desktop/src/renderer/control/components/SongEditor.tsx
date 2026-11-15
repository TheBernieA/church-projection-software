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

interface ArrangementDraft {
  id: string;
  name: string;
  order: string;
}

/** Fast plain-text song editor with live slide preview (§9.1). */
export function SongEditor() {
  const open = useStore((s) => s.dialog === 'song');
  const editingId = useStore((s) => s.editingSongId);
  // A fresh body per opened song: form state initialises from the song, no syncing effects.
  return open ? <SongEditorBody key={editingId ?? 'new'} editingId={editingId} /> : null;
}

/** The same editor, in place (Edit workspace) instead of a dialog. */
export function SongEditorInline({ songId }: { songId: string }) {
  return <SongEditorBody key={songId} editingId={songId} inline />;
}

function SongEditorBody({
  editingId,
  inline = false,
}: {
  editingId: string | null;
  inline?: boolean;
}) {
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
  // Arrangements are edited as typed orders ("V1 C V2 C B C"); an empty order = all sections.
  const [arrangements, setArrangements] = useState<ArrangementDraft[]>(() =>
    base.arrangements.map((a) => ({
      id: a.id,
      name: a.name,
      order: arrangementLabel(a.sectionOrder, base.sections),
    })),
  );
  const [defaultId, setDefaultId] = useState(base.defaultArrangementId);
  const firstLang = Object.keys(base.translations ?? {})[0] ?? '';
  const [transLang, setTransLang] = useState(firstLang);
  const [transText, setTransText] = useState(() =>
    firstLang ? songSectionsToText(base.translations?.[firstLang] ?? []) : '',
  );

  const draft: Song = useMemo(() => {
    const { sections } = parseSongText(text, base.sections);
    const song: Song = {
      ...base,
      title: title.trim() || 'Untitled song',
      authors: authors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      sections,
      arrangements: arrangements.map((a) => ({
        id: a.id,
        name: a.name.trim() || 'Arrangement',
        sectionOrder: a.order.trim() ? parseArrangementOrder(a.order, sections) : [],
      })),
      defaultArrangementId: arrangements.some((a) => a.id === defaultId)
        ? defaultId
        : (arrangements[0]?.id ?? base.defaultArrangementId),
    };
    if (copyright.trim()) song.copyright = copyright.trim();
    else delete song.copyright;
    if (ccli.trim()) song.ccliNumber = ccli.trim();
    else delete song.ccliNumber;
    // The translation's sections take the main sections' ids (matched by label), so each
    // translated chunk lands under the right slide.
    if (transLang.trim() && transText.trim())
      song.translations = { [transLang.trim()]: parseSongText(transText, sections).sections };
    else delete song.translations;
    return song;
  }, [base, text, arrangements, defaultId, title, authors, copyright, ccli, transLang, transText]);
  const editArrangement = (id: string, p: Partial<ArrangementDraft>): void =>
    setArrangements((xs) => xs.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const slides = useMemo(() => buildSongSlides(draft, { maxLines }), [draft, maxLines]);
  const readOnly = base.origin === 'hymnal';

  const save = async (): Promise<void> => {
    if ((await attempt(() => cmd('song.save', { entity: draft }), 'errors.save')) === undefined)
      return;
    if (inline) toast(t('song.saved', { title: draft.title }));
    else closeDialog();
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
    if (inline) useStore.setState({ mode: 'show' });
    else closeDialog();
    toast(
      `${base.title} deleted. Undo with ${window.lampstand.platform === 'darwin' ? '⌘Z' : 'Ctrl+Z'}.`,
    );
  };

  const actions = readOnly ? (
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
      {!inline && <Button onClick={() => closeDialog()}>{t('song.cancel')}</Button>}
      <Button variant="primary" onClick={() => void save()}>
        {t('song.save')}
      </Button>
    </>
  );
  const body = (
    <>
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
                autoFocus={!inline}
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
          <section aria-label={t('song.arrangements')}>
            <span className="label">{t('song.arrangements')}</span>
            <ul className="space-y-1.5">
              {arrangements.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="default-arrangement"
                    aria-label={t('song.defaultArrangement', { name: a.name })}
                    title={t('song.defaultArrangementHint')}
                    checked={defaultId === a.id}
                    onChange={() => setDefaultId(a.id)}
                  />
                  <input
                    className="field !h-8 !w-36"
                    aria-label={t('song.arrangementName')}
                    value={a.name}
                    maxLength={60}
                    onChange={(e) => editArrangement(a.id, { name: e.target.value })}
                  />
                  <input
                    className="field !h-8 min-w-0 flex-1"
                    aria-label={t('song.arrangementOrder', { name: a.name })}
                    value={a.order}
                    onChange={(e) => editArrangement(a.id, { order: e.target.value })}
                    placeholder="V1 C V2 C B C"
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    type="button"
                    disabled={arrangements.length <= 1}
                    aria-label={t('song.removeArrangement', { name: a.name })}
                    onClick={() => setArrangements((xs) => xs.filter((x) => x.id !== a.id))}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              size="xs"
              variant="ghost"
              type="button"
              className="mt-1.5"
              disabled={arrangements.length >= 20}
              onClick={() =>
                setArrangements((xs) => [
                  ...xs,
                  {
                    id: newId(),
                    name: t('song.newArrangementName', { n: xs.length + 1 }),
                    order: '',
                  },
                ])
              }
            >
              + {t('song.addArrangement')}
            </Button>
            <p className="mt-1 text-[11px] text-[var(--text-3)]">{t('song.arrangementHelp')}</p>
          </section>
          <section aria-label={t('song.translationSection')}>
            <div className="flex items-end gap-2">
              <div className="w-28">
                <label className="label" htmlFor="s-tlang">
                  {t('song.translationLang')}
                </label>
                <input
                  id="s-tlang"
                  className="field !h-8"
                  value={transLang}
                  maxLength={35}
                  placeholder="es"
                  onChange={(e) => setTransLang(e.target.value)}
                />
              </div>
              <p className="pb-1.5 text-[11px] text-[var(--text-3)]">{t('song.translationHelp')}</p>
            </div>
            <label className="label mt-2" htmlFor="s-trans">
              {t('song.translation')}
            </label>
            <textarea
              id="s-trans"
              className="field"
              rows={6}
              value={transText}
              onChange={(e) => setTransText(e.target.value)}
              placeholder={'[Verse 1]\n…'}
              spellCheck
            />
          </section>
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
    </>
  );
  if (inline)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-4">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{draft.title}</h2>
          {actions}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
      </div>
    );
  return (
    <Dialog
      name="song"
      wide
      title={editingId ? t('song.titleEdit') : t('song.titleNew')}
      footer={actions}
    >
      {body}
    </Dialog>
  );
}
