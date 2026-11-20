import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, typographyClass } from '@lampstand/ui';
import { useSize } from '../../lib/hooks';
import { displayCombo } from '../../lib/shortcuts';
import { useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { KindTile } from '../kindIcons';
import { SceneView } from '../SceneView';
import {
  EditorBar,
  INLINE_FIELD,
  InlinePanel,
  SlideStage,
  useFit,
  useInspector,
  usePageKeys,
} from '../canvas/editorParts';
import { SongInspector } from './SongInspector';
import { SongSlideList } from './SongSlideList';
import { useSongEditor, type SongEditorState } from './useSongEditor';
import { type Song } from '@lampstand/core';
import { type SongItem } from '../../types';

const isNewSlideKey = (e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
  e.shiftKey &&
  e.key.toLowerCase() === 'n' &&
  (window.lampstand.platform === 'darwin' ? e.metaKey : e.ctrlKey);

/**
 * The words of the slide being edited, typed on it. They go into the song as you type (a new
 * slide joins it with its first words). ⌥↩ breaks the slide at the caret, ⇧⌘N starts a new
 * slide after it; a slide left empty is removed when typing stops.
 */
function SongWords({ ed, onDone }: { ed: SongEditorState; onDone: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => ed.current?.lines.join('\n') ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget;
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      ed.breakSlide(text.slice(0, el.selectionStart), text.slice(el.selectionEnd));
    } else if (isNewSlideKey(e)) {
      e.preventDefault();
      ed.breakSlide(text, '');
    }
  };
  return (
    <InlinePanel
      hint={t('songEditor.typingHint', {
        split: displayCombo('Alt+Enter'),
        next: displayCombo('Mod+Shift+N'),
      })}
      onClose={() => onDone(text)}
    >
      <textarea
        ref={area}
        aria-label={t('songEditor.words')}
        placeholder={t('songEditor.wordsPlaceholder')}
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          ed.type(e.target.value);
        }}
        onKeyDown={onKeyDown}
        spellCheck
        className={`${INLINE_FIELD} ${typographyClass({ size: 18, weight: 'semibold', important: true })}`}
      />
    </InlinePanel>
  );
}

/**
 * The slide being edited, drawn as the room will see it. Double-click (or Enter) to type its
 * words; the arrow keys move between slides.
 */
function SongCanvas({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const lines = ed.current?.lines ?? [];
  return (
    <div
      ref={host}
      tabIndex={0}
      role="application"
      aria-label={t('songEditor.canvas')}
      data-testid="song-canvas"
      onDoubleClick={ed.startTyping}
      onKeyDown={(e) => {
        const steps: Record<string, number> = {
          ArrowLeft: -1,
          ArrowUp: -1,
          ArrowRight: 1,
          ArrowDown: 1,
        };
        const by = steps[e.key];
        if (e.key === 'Enter') ed.startTyping();
        else if (by) ed.step(ed.at + by);
        else return;
        // These keys edit here; they never reach the show (Enter shows, arrows change slides).
        e.preventDefault();
      }}
      className="relative aspect-video w-full overflow-hidden rounded-[4px] shadow-[0_0_0_1px_var(--hairline-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <SceneView scene={ed.scene(lines, ed.at)} />
      {ed.typing && (
        // A fresh panel for each slide: its words start as that slide's.
        <SongWords
          key={ed.visit}
          ed={ed}
          onDone={(text) => {
            ed.stopTyping(text);
            host.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/**
 * A song in the Edit workspace, laid out like a presentation editor: its slides under their
 * groups on the left, the slide on a stage in the middle (type right on it), and the song's and
 * the slide's details on the right.
 */
export function SongEditor({ item }: { item: SongItem }) {
  const { t } = useTranslation();
  const song = useStore((s) => s.songs.find((x) => x.id === item.songId));
  if (!song)
    return <EmptyState icon={<FileQuestion size={28} />} title={t('songEditor.missing')} />;
  return <SongEditorBody key={song.id} song={song} item={item} />;
}

function SongEditorBody({ song, item }: { song: Song; item: SongItem }) {
  const { t } = useTranslation();
  const ed = useSongEditor(song, item);
  const [root, size] = useSize();
  const inspector = useInspector(size.width);
  const [stage, width] = useFit(28);
  usePageKeys(ed.at, ed.step);
  // ⇧⌘N: a new slide after this one (while typing, the words panel handles it).
  const newSlide = useRef(ed.newSlide);
  useEffect(() => {
    newSlide.current = ed.newSlide;
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.defaultPrevented || !isNewSlideKey(e) || useStore.getState().dialog) return;
      e.preventDefault();
      newSlide.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={root} className="@container relative flex min-h-0 flex-1">
      <SongSlideList ed={ed} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <EditorBar
          icon={<KindTile kind="song" size={24} />}
          title={song.title}
          index={ed.at}
          total={ed.total}
          onStep={ed.step}
          inspector={inspector}
        />
        {ed.slides.length ? (
          <SlideStage
            stageRef={stage}
            width={width}
            hint={ed.readOnly ? t('song.readOnly') : t('songEditor.hint')}
          >
            <SongCanvas ed={ed} />
          </SlideStage>
        ) : (
          <EmptyState
            icon={<FileQuestion size={28} />}
            title={t('songEditor.empty')}
            action={
              <Button variant="primary" onClick={ed.addGroup}>
                {t('songEditor.newGroup')}
              </Button>
            }
          />
        )}
      </div>
      {inspector.open && <SongInspector ed={ed} />}
    </div>
  );
}
