import { useMemo, useState } from 'react';
import { MousePointerClick, Rows3, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { nowIso, type Song } from '@lampstand/core';
import { buildSongSlides, parseSongText, songSectionsToText } from '@lampstand/lyrics';
import { Button } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { useInService, useSelectedItem } from '../../lib/hooks';
import { reflowToSlides, slidesToReflow } from '../../lib/reflow';
import { groupColor } from '../../lib/slides';
import { attempt, toast, updateItem, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { type TextItem } from '../../types';

interface Preview {
  key: string;
  label: string;
  text: string;
}

/** One big text area for the whole song or presentation, with live slide breaks beside it. */
function ReflowEditor({
  title,
  initial,
  preview,
  onSave,
  readOnly,
}: {
  title: string;
  initial: string;
  preview: (text: string) => Preview[];
  onSave: (text: string) => void | Promise<void>;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const slides = useMemo(() => preview(text), [preview, text]);
  const dirty = text !== initial;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-4">
        <Rows3 size={16} className="text-[var(--text-3)]" />
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</h2>
        <span className="text-[12px] text-[var(--text-3)]">
          {t('slides.count', { count: slides.length })}
        </span>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setText(initial)}>
          {t('reflow.revert')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<Save size={14} />}
          disabled={!dirty || readOnly}
          onClick={() => void onSave(text)}
        >
          {t('reflow.save')}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
        <div className="flex min-h-0 flex-col p-4">
          <textarea
            aria-label={t('reflow.label')}
            className="field min-h-0 flex-1 resize-none font-mono !text-[13px] leading-relaxed"
            value={text}
            readOnly={readOnly}
            onChange={(e) => setText(e.target.value)}
            spellCheck
          />
          <p className="mt-2 text-[11px] text-[var(--text-3)]">{t('reflow.help')}</p>
        </div>
        <ol className="min-h-0 space-y-1.5 overflow-y-auto border-l border-[var(--hairline)] p-3">
          {slides.map((s, i) => {
            const color = groupColor(s.label);
            return (
              <li key={s.key} className="overflow-hidden rounded-[4px] bg-black">
                <div
                  className="flex h-5 items-center px-2 text-[10px] font-semibold text-white"
                  style={{ background: color ?? 'var(--surface-3)' }}
                >
                  {i + 1} · {s.label}
                </div>
                <p className="whitespace-pre-line p-2 text-center text-[11px] leading-snug text-white">
                  {s.text}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function SongReflow({ song }: { song: Song }) {
  const { t } = useTranslation();
  const maxLines = useStore((s) => s.settings?.lyrics.maxLinesPerSlide ?? 4);
  const initial = useMemo(() => songSectionsToText(song.sections), [song.sections]);
  const toSong = (text: string): Song => ({
    ...song,
    sections: parseSongText(text, song.sections).sections,
  });
  const preview = useMemo(
    () => (text: string) =>
      buildSongSlides(
        { ...song, sections: parseSongText(text, song.sections).sections },
        { maxLines },
      ).map((s) => ({ key: s.key, label: s.label, text: s.lines.join('\n') })),
    [song, maxLines],
  );
  return (
    <ReflowEditor
      key={song.id + song.updatedAt}
      title={song.title}
      initial={initial}
      preview={preview}
      readOnly={song.origin === 'hymnal'}
      onSave={async (text) => {
        const saved = await attempt(
          () => cmd('song.save', { entity: { ...toSong(text), updatedAt: nowIso() } }),
          'errors.save',
        );
        if (saved !== undefined) toast(t('song.saved', { title: song.title }));
      }}
    />
  );
}

function TextReflow({ item }: { item: TextItem }) {
  const initial = useMemo(() => slidesToReflow(item.slides), [item.slides]);
  const preview = useMemo(
    () => (text: string) =>
      reflowToSlides(text, item.slides).map((s, i) => ({
        key: `${s.id}-${i}`,
        label: s.title || `${i + 1}`,
        text: s.body,
      })),
    [item.slides],
  );
  return (
    <ReflowEditor
      key={item.id + initial}
      title={item.title}
      initial={initial}
      preview={preview}
      onSave={(text) =>
        updateItem<TextItem>(item.id, (x) => ({ ...x, slides: reflowToSlides(text, x.slides) }))
      }
    />
  );
}

/** Reflow workspace: edit all of an item's text at once; blank lines split slides. */
export function ReflowMode() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const songs = useStore((s) => s.songs);
  const inService = useInService(item);
  if (!item)
    return <EmptyState icon={<MousePointerClick size={28} />} title={t('modes.pickItem')} />;
  if (item.kind === 'song') {
    const song = songs.find((s) => s.id === item.songId);
    return song ? <SongReflow song={song} /> : null;
  }
  if ((item.kind === 'presentation' || item.kind === 'announcements') && inService)
    return <TextReflow item={item} />;
  return (
    <EmptyState
      icon={<Rows3 size={28} />}
      title={t('reflow.unavailable')}
      body={t('reflow.unavailableHelp')}
    />
  );
}
