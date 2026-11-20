import { FileQuestion, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Song } from '@lampstand/core';
import { Button, Typography } from '@lampstand/ui';
import { useSize } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { KindTile } from '../kindIcons';
import { SceneView } from '../SceneView';
import { EditorToolbar } from '../canvas/EditorToolbar';
import { SlideEditor } from '../canvas/SlideEditor';
import { ObjectsPanel, type ListSlide } from '../canvas/SlideList';
import { TextBox } from '../canvas/TextBox';
import { GroupHeader, SongAddMenu, SongSlideMenu } from './SongGroups';
import { SongInspector } from './SongInspector';
import { useSongEditor, type SongEditorState } from './useSongEditor';
import { type SongItem } from '../../types';

/**
 * The slide being edited, drawn as the room will see it, with its text box on top: double-click
 * the words (or press Enter) to type them in place; the arrow keys move between slides; a click
 * on the slide away from the words stops typing.
 */
function SongCanvas({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const [host, size] = useSize();
  const scale = size.width / ed.theme.canvas.width;
  const lines = ed.current?.lines ?? [];
  const refocus = (): void => host.current?.focus();
  return (
    <div
      ref={host}
      tabIndex={0}
      role="application"
      aria-label={t('songEditor.canvas')}
      data-testid="song-canvas"
      onDoubleClick={ed.startTyping}
      onPointerDown={() => {
        ed.finishTyping();
        refocus();
      }}
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
      className="relative aspect-video w-full overflow-hidden rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
    >
      {/* While typing, the words show in the text box only (not twice). */}
      <SceneView scene={ed.scene(lines, ed.at, !ed.typing)} instant />
      {scale > 0 && (
        <TextBox
          theme={ed.theme}
          scale={scale}
          editing={ed.typing}
          visit={ed.visit}
          onStart={ed.startTyping}
          onResize={
            ed.readOnly
              ? undefined
              : (box) => ed.patch((s) => ({ ...s, textFormat: { ...s.textFormat, box } }))
          }
          fields={[
            {
              key: 'words',
              label: t('songEditor.words'),
              placeholder: t('songEditor.wordsPlaceholder'),
              value: lines.join('\n'),
              onChange: (v) => {
                ed.draft(v);
                ed.type(v);
              },
            },
          ]}
          onDone={(v) => {
            ed.stopTyping(v.words ?? '');
            refocus();
          }}
          onBreak={ed.breakSlide}
          onNewSlide={(v) => ed.breakSlide(v.words ?? '', '')}
        />
      )}
    </div>
  );
}

/** A song's slides for the list: each group's heading first, a new slide's place held. */
function listSlides(ed: SongEditorState, prompt: string, long: string): ListSlide[] {
  const pending: ListSlide = {
    key: 'pending',
    scene: ed.scene([], ed.at),
    index: null,
    overlay: (
      <Typography
        size={11}
        tone="inherit"
        className="absolute inset-0 flex items-center justify-center px-2 text-center text-white/70"
      >
        {prompt}
      </Typography>
    ),
  };
  const out: ListSlide[] = [];
  ed.slides.forEach((s, i) => {
    if (ed.pending && i === ed.at) out.push(pending);
    out.push({
      key: `${s.sectionId}:${i}`,
      scene: ed.scene(s.lines, i),
      index: i,
      header:
        ed.slides[i - 1]?.sectionId !== s.sectionId ? (
          <GroupHeader ed={ed} index={i} slide={s} />
        ) : undefined,
      badge:
        s.lines.length > ed.maxLines ? (
          <Typography
            size={10}
            weight="bold"
            tone="inherit"
            className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-[#b7791f] px-1 text-black"
          >
            {long}
          </Typography>
        ) : undefined,
    });
  });
  if (ed.pending && ed.at >= ed.slides.length) out.push(pending);
  return out;
}

/**
 * A song in the Edit workspace: its slides under their groups (Verse 1, Chorus…), the slide on a
 * stage (type right on it), and the song's and the slide's details.
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
  return (
    <SlideEditor
      icon={<KindTile kind="song" size={24} />}
      title={song.title}
      list={{
        slides: listSlides(ed, t('songEditor.typeNew'), t('songEditor.long')),
        selected: ed.at,
        onSelect: ed.step,
        onMove: ed.move,
        onDelete: ed.remove,
        menu: (index) => <SongSlideMenu ed={ed} index={index} />,
        addMenu: <SongAddMenu ed={ed} />,
        onAdd: () => ed.newSlide(),
        readOnly: ed.readOnly,
        footer: (
          <ObjectsPanel
            rows={[
              {
                key: 'words',
                icon: <Type size={14} />,
                label: ed.current?.lines[0] ?? t('canvas.toolText'),
                selected: ed.typing,
                onClick: ed.startTyping,
              },
            ]}
          />
        ),
      }}
      tools={
        ed.readOnly ? undefined : (
          <EditorToolbar
            typing={ed.typing}
            onType={ed.startTyping}
            onNewSlide={() => ed.newSlide()}
            onNewGroup={ed.addGroup}
            split={{
              disabled: ed.pending || (ed.current?.lines.length ?? 0) <= ed.maxLines,
              title: t('songEditor.longHint', { max: ed.maxLines }),
              onClick: () => ed.splitLong(ed.at),
            }}
          />
        )
      }
      canvas={ed.slides.length ? <SongCanvas ed={ed} /> : null}
      empty={
        <EmptyState
          icon={<FileQuestion size={28} />}
          title={t('songEditor.empty')}
          action={
            <Button variant="primary" onClick={ed.addGroup}>
              {t('songEditor.newGroup')}
            </Button>
          }
        />
      }
      inspector={<SongInspector ed={ed} />}
      onStageBackground={ed.finishTyping}
      onNewSlide={() => ed.newSlide()}
      hint={ed.readOnly ? t('song.readOnly') : undefined}
    />
  );
}
