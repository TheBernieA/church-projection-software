import { useEffect, useRef, type ReactNode } from 'react';
import { FileQuestion, FolderPlus, Plus, Rows3, Scissors, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Song } from '@lampstand/core';
import { Button, Typography } from '@lampstand/ui';
import { useSize } from '../../lib/hooks';
import { displayCombo } from '../../lib/shortcuts';
import { useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { SceneView } from '../SceneView';
import {
  ExpandToggle,
  InspectorToggle,
  SlideStage,
  useFit,
  useInspector,
  usePageKeys,
} from '../canvas/editorParts';
import { SongInspector } from './SongInspector';
import { SongSlideList } from './SongSlideList';
import { isNewSlideKey, SongTextBox } from './SongTextBox';
import { useSongEditor, type SongEditorState } from './useSongEditor';
import { type SongItem } from '../../types';

/** One tool on the floating bar: an icon over its name. */
function Tool({
  icon,
  label,
  title,
  onClick,
  active,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="bare"
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-[58px] flex-col items-center gap-0.5 rounded-[7px] px-2 py-1 transition-colors disabled:opacity-35 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
      }`}
    >
      {icon}
      <Typography size={10} weight="medium" tone="inherit">
        {label}
      </Typography>
    </Button>
  );
}

/** The tools floating over the stage: type, new slide, new group, split, Reflow. */
function ToolBar({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const long = !ed.pending && (ed.current?.lines.length ?? 0) > ed.maxLines;
  if (ed.readOnly) return null;
  return (
    <div
      role="toolbar"
      aria-label={t('songEditor.tools')}
      className="flex items-center gap-0.5 rounded-[11px] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-2),inset_0_0_0_1px_var(--hairline)]"
    >
      <Tool
        icon={<Type size={17} />}
        label={t('songEditor.toolText')}
        title={t('songEditor.toolTextHint')}
        active={ed.typing}
        onClick={ed.startTyping}
      />
      <Tool
        icon={<Plus size={17} />}
        label={t('songEditor.toolSlide')}
        title={`${t('songEditor.newSlide')} (${displayCombo('Mod+Shift+N')})`}
        onClick={() => ed.newSlide()}
      />
      <Tool
        icon={<FolderPlus size={17} />}
        label={t('songEditor.toolGroup')}
        title={t('songEditor.newGroup')}
        onClick={ed.addGroup}
      />
      <Tool
        icon={<Scissors size={17} />}
        label={t('songEditor.split')}
        title={t('songEditor.longHint', { max: ed.maxLines })}
        disabled={!long}
        onClick={() => ed.splitLong(ed.at)}
      />
      <span aria-hidden className="mx-1 h-8 w-px bg-[var(--hairline-strong)]" />
      <Tool
        icon={<Rows3 size={17} />}
        label={t('canvas.reflow')}
        title={t('canvas.reflowHint')}
        onClick={() => useStore.setState({ mode: 'reflow' })}
      />
    </div>
  );
}

/**
 * The slide being edited, drawn as the room will see it, with its text box on top. Double-click
 * the words (or press Enter) to type them in place; the arrow keys move between slides; a click
 * on the slide away from the words stops typing.
 */
function SongCanvas({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const [host, size] = useSize();
  const scale = size.width / ed.theme.canvas.width;
  const done = (text: string): void => {
    ed.stopTyping(text);
    host.current?.focus();
  };
  return (
    <div
      ref={host}
      tabIndex={0}
      role="application"
      aria-label={t('songEditor.canvas')}
      data-testid="song-canvas"
      onDoubleClick={ed.startTyping}
      // A click on the slide away from the words stops typing.
      onPointerDown={() => {
        ed.finishTyping();
        host.current?.focus();
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
      <SceneView scene={ed.scene(ed.current?.lines ?? [], ed.at, !ed.typing)} />
      {scale > 0 && <SongTextBox ed={ed} scale={scale} onDone={done} />}
    </div>
  );
}

/**
 * A song in the Edit workspace, laid out like a presentation editor and given the whole window:
 * its slides under their groups on the left, the slide on a stage in the middle with the tools
 * floating above it (type right on the slide), and the song's and the slide's details on the
 * right.
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
  const [stage, width] = useFit(40);
  usePageKeys(ed.at, ed.step);
  // ⇧⌘N: a new slide after this one (while typing, the text box handles it).
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
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-0)]">
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-start justify-center px-3">
          <div className="pointer-events-auto">
            <ToolBar ed={ed} />
          </div>
          <div className="pointer-events-auto absolute right-3 top-0 flex gap-1">
            <ExpandToggle />
            <InspectorToggle {...inspector} />
          </div>
        </div>
        {ed.slides.length ? (
          <div className="flex min-h-0 flex-1 flex-col pt-16">
            <SlideStage
              stageRef={stage}
              width={width}
              hint={ed.readOnly ? t('song.readOnly') : undefined}
              onBackgroundPointerDown={ed.finishTyping}
            >
              <SongCanvas ed={ed} />
            </SlideStage>
          </div>
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
