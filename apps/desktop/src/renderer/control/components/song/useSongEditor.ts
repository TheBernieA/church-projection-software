import { useMemo, useRef, useState } from 'react';
import { makeScene, type Scene, type Song } from '@lampstand/core';
import {
  addGroup,
  duplicateSlide,
  editorSlides,
  groupFrom,
  insertSlide,
  moveSlide,
  nextGroupLabel,
  removeGroup,
  removeSlide,
  renameGroup,
  setSlideLines,
  slideLines,
  splitSlide,
  startsGroup,
  stripChords,
  ungroup,
  type EditorSlide,
} from '@lampstand/lyrics';
import { songCredit, songLook } from '../../lib/slides';
import { editorStart } from '../../lib/songs';
import { editSong, useStore } from '../../lib/store';
import { clamp } from '../../lib/utils';
import { type SongItem } from '../../types';

/**
 * Which slide the editor is on. `pending`: a new slide, not typed yet, at position `at` (it
 * only joins the song once it has words).
 */
interface Cursor {
  at: number;
  pending: boolean;
}

/**
 * The song editor's state and every change it makes, shared by the slide list, the canvas and
 * the inspector. Changes go through {@link editSong} (shown at once, autosaved, undoable), built
 * from the pure functions in `@lampstand/lyrics`.
 */
export function useSongEditor(song: Song, item: SongItem) {
  const maxLines = useStore((s) => s.settings?.lyrics.maxLinesPerSlide ?? 4);
  const themes = useStore((s) => s.themes);
  const settings = useStore((s) => s.settings);
  const readOnly = song.origin === 'hymnal';
  const slides = useMemo(() => editorSlides(song), [song]);
  const [cursor, setCursor] = useState<Cursor>(() => ({
    at: editorStart(song, item, maxLines),
    pending: false,
  }));
  // A new song opens ready to type its first slide.
  const [typing, setTyping] = useState(() => !readOnly && !slides[cursor.at]?.lines.length);
  /**
   * Counts moves to another slide, so the typing panel starts afresh on each (and only then: a
   * new slide joining the song as you type is the same slide, mid-word).
   */
  const [visit, setVisit] = useState(0);
  const go = (next: Cursor): void => {
    setCursor(next);
    setVisit((n) => n + 1);
  };
  /** What the text box holds right now (it can differ from the slide: emptied, not yet saved). */
  const draft = useRef('');
  /** The group whose name is being typed in the slide list. */
  const [renaming, setRenaming] = useState<string | null>(null);

  // Slides can go from under the cursor (a delete, an undo): it stays on a slide that exists.
  const at = cursor.pending
    ? clamp(cursor.at, 0, slides.length)
    : clamp(cursor.at, 0, slides.length - 1);
  const pending = cursor.pending;
  const current: EditorSlide | undefined = pending
    ? { sectionId: (slides[at - 1] ?? slides[at])?.sectionId ?? '', lines: [] }
    : slides[at];

  const look = useMemo(
    () => songLook(song, item, { themes, settings }),
    [song, item, themes, settings],
  );
  const credit = songCredit(song, { settings });
  const sceneOf = useMemo(
    () =>
      (lines: string[], i: number, words = true): Scene =>
        // Without words: just the background (the text box draws them while typing).
        !words
          ? makeScene({ background: look.background })
          : makeScene({
              background: look.background,
              content: {
                key: `${song.id}:edit:${i}`,
                kind: 'lyrics',
                theme: look.theme,
                blocks: [{ spans: [{ text: lines.map(stripChords).join('\n') }] }],
                // The credits show on the first slide, as they will on screen.
                ...(i === 0 && credit ? { copyright: credit } : {}),
              },
            }),
    [look, credit, song.id],
  );

  /** Change the song; returns it as changed (for what a change made, like a new group's id). */
  const change = (fn: (s: Song) => Song, typingEdit = false): Song => {
    let next = song;
    editSong(song.id, (s) => (next = fn(s)), { typing: typingEdit });
    return next;
  };
  /** Typing stopped: a new slide left empty is dropped, an emptied slide removed. */
  const stopTyping = (text: string): void => {
    setTyping(false);
    if (pending) setCursor({ at: Math.max(0, at - 1), pending: false });
    else if (!slideLines(text).length) change((s) => setSlideLines(s, at, []));
  };
  const select = (i: number): void => {
    const to = clamp(i, 0, slides.length - 1);
    go({ at: to, pending: false });
    // An empty slide opens ready to type.
    setTyping(!readOnly && !slides[to]?.lines.length);
  };

  return {
    song,
    item,
    slides,
    readOnly,
    maxLines,
    at,
    pending,
    current,
    /** Slides shown, counting a new one not typed yet. */
    total: slides.length + (pending ? 1 : 0),
    typing: typing && !readOnly,
    /** Changes when the editor moves to another slide (keys the typing panel). */
    visit,
    renaming,
    scene: sceneOf,
    /** The theme the slides are drawn with (the text box types in its font). */
    theme: look.theme,
    select,
    /** Step by position as shown (the pending slide counts). */
    step: (shown: number) => select(pending && shown > at ? shown - 1 : shown),
    startTyping: () => !readOnly && setTyping(true),
    startRenaming: setRenaming,
    stopRenaming: () => setRenaming(null),

    /** A new slide after slide `after` (the current one: ⇧⌘N), ready to type. */
    newSlide: (after?: number) => {
      if (readOnly || (after === undefined && pending)) return;
      go({ at: (after ?? at) + 1, pending: true });
      setTyping(true);
    },
    /** The words typed on the current slide. A new slide joins the song with its first words. */
    type: (text: string) => {
      const lines = slideLines(text);
      if (!lines.length) return; // an emptied slide is dealt with when typing stops
      if (pending) {
        change((s) => insertSlide(s, at, lines));
        setCursor({ at, pending: false });
      } else change((s) => setSlideLines(s, at, lines), true);
    },
    /** Break the slide at the caret (⌥↩): what follows goes on a new slide after it. */
    breakSlide: (before: string, after: string) => {
      const head = slideLines(before);
      // The break usually falls at a space: the new slide doesn't start with it.
      const tail = slideLines(after.trimStart());
      if (!head.length) return;
      change((s) => {
        const next = pending ? insertSlide(s, at, head) : setSlideLines(s, at, head);
        return tail.length ? insertSlide(next, at + 1, tail) : next;
      });
      go({ at: at + 1, pending: !tail.length });
    },
    /** The text box's words as they are typed. */
    draft: (text: string) => {
      draft.current = text;
    },
    /** Stop typing with what the text box holds (a click away from it). */
    finishTyping: () => {
      if (typing) stopTyping(draft.current);
    },
    stopTyping,

    duplicate: (i: number) => {
      change((s) => duplicateSlide(s, i));
      select(i + 1);
    },
    remove: (i: number) => {
      change((s) => removeSlide(s, i));
      setCursor({ at: i < at ? at - 1 : at, pending: false });
      setTyping(false);
    },
    move: (from: number, to: number) => {
      change((s) => moveSlide(s, from, to));
      setCursor({ at: to, pending: false });
    },
    splitLong: (i: number) => change((s) => splitSlide(s, i, maxLines)),
    startsGroup: (i: number) => startsGroup(song, i),

    /** Group from slide `i` on with this name (at a group's start, renames it). */
    group: (i: number, label: string) => {
      change((s) => groupFrom(s, i, label));
      setCursor({ at: i, pending: false });
    },
    /** Group from slide `i` on with a name to type. */
    groupCustom: (i: number) => {
      const next = startsGroup(song, i) ? song : change((s) => groupFrom(s, i, nextGroupLabel(s)));
      setCursor({ at: i, pending: false });
      setRenaming(editorSlides(next)[i]?.sectionId ?? null);
    },
    rename: (sectionId: string, label: string) => {
      change((s) => renameGroup(s, sectionId, label));
      setRenaming(null);
    },
    ungroup: (sectionId: string) => change((s) => ungroup(s, sectionId)),
    removeGroup: (sectionId: string) => {
      change((s) => removeGroup(s, sectionId));
      setCursor({ at: Math.min(at, slides.length - 1), pending: false });
      setTyping(false);
    },
    /** A new, empty group after the current one, ready to type. */
    addGroup: () => {
      if (readOnly) return;
      let index = 0;
      change((s) => {
        const r = addGroup(s, pending ? Math.max(0, at - 1) : at, nextGroupLabel(s));
        index = r.index;
        return r.song;
      });
      go({ at: index, pending: false });
      setTyping(true);
    },
    /** A song detail (title, credits, theme…), typed or picked. */
    patch: (p: Partial<Song> | ((s: Song) => Song), typingEdit = false) =>
      change((s) => (typeof p === 'function' ? p(s) : { ...s, ...p }), typingEdit),
  };
}

export type SongEditorState = ReturnType<typeof useSongEditor>;
