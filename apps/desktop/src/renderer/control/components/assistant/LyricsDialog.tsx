import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { newId } from '@lampstand/core';
import type { ImportedSong } from '@lampstand/lyrics';
import { songFromLyricsDraft } from '@lampstand/planner';
import { q } from '../../lib/api';
import { refreshAssistant, useAssistant } from '../../lib/assistant';
import { saveImportedSong } from '../../lib/songImport';
import { closeDialog, useStore } from '../../lib/store';
import { Dialog } from '../Dialog';
import { Field } from '../form';
import { KeyNeeded } from './KeyNeeded';

/**
 * A song from pasted lyrics: the assistant splits them into verses, choruses and bridges (the
 * words as given), the operator checks the parts, and the song is saved like an imported file.
 */
export function LyricsDialog() {
  const open = useStore((s) => s.dialog === 'lyrics');
  return open ? <LyricsForm /> : null;
}

function LyricsForm() {
  const { t } = useTranslation();
  const hasKey = useAssistant((s) => s.hasKey);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [song, setSong] = useState<ImportedSong | null>(null);

  useEffect(() => void refreshAssistant(), []);

  const run = async (): Promise<void> => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const draft = await q('assistant.lyrics', { text });
      const s = songFromLyricsDraft(draft, newId);
      if (s) setSong(s);
      else setError(t('lyricsAi.empty'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('planner.failed'));
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!song || busy) return;
    setBusy(true);
    if (await saveImportedSong(song)) closeDialog();
    else setBusy(false);
  };

  const footer = song ? (
    <>
      <Button
        variant="ghost"
        className="mr-auto"
        icon={<ArrowLeft size={14} />}
        onClick={() => setSong(null)}
      >
        {t('planner.back')}
      </Button>
      <Button variant="primary" disabled={busy} onClick={() => void save()}>
        {t('lyricsAi.save')}
      </Button>
    </>
  ) : (
    <>
      <Button onClick={() => closeDialog()}>{t('song.cancel')}</Button>
      <Button
        variant="primary"
        disabled={busy || !text.trim() || !hasKey}
        icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        onClick={() => void run()}
      >
        {busy ? t('lyricsAi.working') : t('lyricsAi.structure')}
      </Button>
    </>
  );

  const order = song
    ? (song.order.length ? song.order : song.sections.map((s) => s.id))
        .map((id) => song.sections.find((s) => s.id === id)?.label)
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Dialog name="lyrics" title={t('lyricsAi.title')} footer={footer}>
      {hasKey === false ? (
        <KeyNeeded />
      ) : song ? (
        <div className="space-y-3">
          <Typography as="p" size={15} weight="semibold" tone="primary">
            {song.title}
          </Typography>
          {song.authors.length > 0 && (
            <Typography as="p" size={12} tone="muted">
              {song.authors.join(', ')}
            </Typography>
          )}
          <Typography as="p" variant="caption">
            {t('lyricsAi.order', { order })}
          </Typography>
          <div className="max-h-[46vh] space-y-3 overflow-y-auto rounded-[8px] bg-[var(--surface-2)] p-3 shadow-[0_0_0_1px_var(--hairline)]">
            {song.sections.map((s) => (
              <section key={s.id}>
                <Typography as="h4" variant="overline">
                  {s.label}
                </Typography>
                {s.lines.map((l, i) => (
                  <Typography as="p" key={i} size={13} tone="primary">
                    {l}
                  </Typography>
                ))}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Typography as="p" variant="caption" leading="snug">
            {t('lyricsAi.intro')}
          </Typography>
          <Field label={t('lyricsAi.text')} htmlFor="lyrics-text">
            <textarea
              id="lyrics-text"
              className="field min-h-[260px] w-full resize-y font-[inherit] leading-relaxed"
              value={text}
              maxLength={20000}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </Field>
          <Typography as="p" variant="caption" tone="muted">
            {t('lyricsAi.privacy')}
          </Typography>
          {error && (
            <Typography as="p" role="alert" size={12} className="text-[var(--tally-program)]">
              {error}
            </Typography>
          )}
        </div>
      )}
    </Dialog>
  );
}
