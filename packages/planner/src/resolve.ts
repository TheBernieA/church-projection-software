import type { PassageRef, ServiceItem } from '@lampstand/core';
import { formatPassage, parseReference } from '@lampstand/scripture';
import type { DraftItem, PlanDraft } from './draft';

export interface LibrarySong {
  readonly id: string;
  readonly title: string;
  readonly alternateTitles?: readonly string[];
}

export interface ResolveContext {
  readonly songs: readonly LibrarySong[];
  /** The Bible version readings use. */
  readonly versionId: string;
  readonly newId: () => string;
  /** Alias language for references. */
  readonly lang?: string;
}

/** How each step of the draft became plan items, for the review list. */
export type StepStatus =
  /** A library song was found for it. */
  | 'matched'
  /** The reference was understood. */
  | 'parsed'
  /** Made from the draft's own words (slides, countdown, heading). */
  | 'made'
  /** Kept as a labelled step: the song isn't in the library, or the reference wasn't clear. */
  | 'unmatched';

export interface ResolvedStep {
  readonly kind: DraftItem['kind'];
  readonly title: string;
  readonly status: StepStatus;
  /** What it became: the library song's title, the passage, "3 slides"… */
  readonly detail: string;
  /** The plan items it made (usually one). */
  readonly itemIds: readonly string[];
}

export interface ResolvedPlan {
  readonly name: string;
  readonly date: string | null;
  readonly items: ServiceItem[];
  readonly steps: ResolvedStep[];
  readonly questions: string[];
}

// The plan schema's limits (ServiceItemSchema / ServicePlanSchema).
const MAX_ITEMS = 1000;
const MAX_TITLE = 200;
const MAX_NOTES = 4000;
const MAX_BODY = 4000;
const MAX_SLIDES = 500;
const ANNOUNCE_SECONDS = 8;
const DEFAULT_COUNTDOWN_MIN = 5;
/** A reference read this sure is put in the plan; below it the step stays a note. */
const MIN_REFERENCE_CONFIDENCE = 0.75;
/** How alike two song titles must be to count as the same song. */
const MIN_TITLE_SCORE = 0.75;

const clip = (s: string | null | undefined, n: number): string => (s ?? '').trim().slice(0, n);

/** Lower case, accents and punctuation gone, "(Live)"-style endings dropped, a leading "The". */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

/** 0..1: how alike two titles are. */
export function titleScore(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // "Amazing Grace" ~ "Amazing Grace My Chains Are Gone".
  if (y.startsWith(`${x} `) || x.startsWith(`${y} `)) return 0.9;
  const xs = new Set(x.split(' '));
  const ys = new Set(y.split(' '));
  let common = 0;
  for (const w of xs) if (ys.has(w)) common += 1;
  return common / (xs.size + ys.size - common);
}

/** The library song a title means, if one is close enough. */
export function matchSong(title: string, songs: readonly LibrarySong[]): LibrarySong | null {
  let best: LibrarySong | null = null;
  let bestScore = 0;
  for (const s of songs) {
    const score = Math.max(
      titleScore(title, s.title),
      ...(s.alternateTitles ?? []).map((t) => titleScore(title, t)),
    );
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return bestScore >= MIN_TITLE_SCORE ? best : null;
}

function notesOf(d: DraftItem, extra?: string): string | undefined {
  const parts = [
    d.minutes && d.minutes > 0 ? `≈ ${Math.round(d.minutes)} min` : '',
    clip(d.notes, MAX_NOTES),
    extra ?? '',
  ].filter(Boolean);
  const notes = parts.join(' · ').slice(0, MAX_NOTES);
  return notes || undefined;
}

/**
 * The model's draft as real plan items, checked here: songs from the library, references read
 * by the scripture parser, slides only from words the draft gives. Nothing that isn't
 * understood is dropped: it stays in the plan as a labelled step with a note.
 */
export function resolveDraft(draft: PlanDraft, ctx: ResolveContext): ResolvedPlan {
  const items: ServiceItem[] = [];
  const steps: ResolvedStep[] = [];
  const add = (d: DraftItem, status: StepStatus, detail: string, made: ServiceItem[]): void => {
    const room = MAX_ITEMS - items.length;
    const kept = made.slice(0, Math.max(0, room));
    items.push(...kept);
    steps.push({
      kind: d.kind,
      title: clip(d.title, MAX_TITLE),
      status,
      detail,
      itemIds: kept.map((i) => i.id),
    });
  };
  const heading = (d: DraftItem, extra?: string): ServiceItem => {
    const notes = notesOf(d, extra);
    return {
      id: ctx.newId(),
      kind: 'header',
      label: clip(d.title, MAX_TITLE) || d.kind,
      ...(notes ? { notes } : {}),
    };
  };
  const slidesOf = (d: DraftItem) =>
    d.slides
      .filter((s) => s.body.trim() || s.title.trim())
      .slice(0, MAX_SLIDES)
      .map((s) => ({
        id: ctx.newId(),
        ...(s.title.trim() ? { title: clip(s.title, MAX_TITLE) } : {}),
        body: clip(s.body, MAX_BODY),
      }));

  for (const d of draft.items) {
    if (items.length >= MAX_ITEMS) break;
    const title = clip(d.title, MAX_TITLE) || d.kind;
    switch (d.kind) {
      case 'song': {
        const wanted = clip(d.songTitle, MAX_TITLE) || title;
        const song = matchSong(wanted, ctx.songs);
        const notes = notesOf(d);
        if (song)
          add(d, 'matched', song.title, [
            { id: ctx.newId(), kind: 'song', songId: song.id, ...(notes ? { notes } : {}) },
          ]);
        else add(d, 'unmatched', wanted, [heading(d, `Not in the library: ${wanted}`)]);
        break;
      }
      case 'scripture': {
        const text = clip(d.reference, 200) || title;
        const best = parseReference(text, ctx.lang !== undefined ? { lang: ctx.lang } : {})[0];
        if (best && best.confidence >= MIN_REFERENCE_CONFIDENCE && best.passages.length) {
          const notes = notesOf(d);
          const made = best.passages.map((passage: PassageRef): ServiceItem => ({
            id: ctx.newId(),
            kind: 'scripture',
            passage,
            versionIds: [ctx.versionId],
            ...(notes ? { notes } : {}),
          }));
          add(d, 'parsed', best.passages.map((p) => formatPassage(p)).join('; '), made);
        } else add(d, 'unmatched', text, [heading(d, `Reading: ${text}`)]);
        break;
      }
      case 'countdown': {
        const minutes = d.minutes && d.minutes > 0 ? d.minutes : DEFAULT_COUNTDOWN_MIN;
        const durationSec = Math.min(86400, Math.max(1, Math.round(minutes * 60)));
        const notes = notesOf(d);
        add(d, 'made', `${Math.round(durationSec / 60)} min`, [
          {
            id: ctx.newId(),
            kind: 'countdown',
            title,
            target: { durationSec },
            ...(notes ? { notes } : {}),
          },
        ]);
        break;
      }
      case 'announcement': {
        const slides = slidesOf(d);
        const notes = notesOf(d);
        add(d, 'made', `${slides.length || 1} slides`, [
          {
            id: ctx.newId(),
            kind: 'announcements',
            title,
            loopIntervalSec: ANNOUNCE_SECONDS,
            autoAdvance: true,
            slides: slides.length
              ? slides
              : [{ id: ctx.newId(), title, body: clip(d.notes, MAX_BODY) }],
            ...(notes ? { notes } : {}),
          },
        ]);
        break;
      }
      case 'section':
        add(d, 'made', '', [heading(d)]);
        break;
      case 'sermon':
      case 'prayer':
      case 'offering':
      case 'media':
      case 'note': {
        // Slides if the draft gave words, else a step.
        const slides = slidesOf(d);
        const notes = notesOf(d);
        if (slides.length)
          add(d, 'made', `${slides.length} slides`, [
            {
              id: ctx.newId(),
              kind: 'presentation',
              title,
              slides,
              ...(notes ? { notes } : {}),
            },
          ]);
        else add(d, 'made', '', [heading(d)]);
      }
    }
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(draft.date ?? '') ? draft.date : null;
  return {
    name: clip(draft.name, MAX_TITLE) || 'New service',
    date,
    items,
    steps,
    questions: draft.questions
      .map((q) => clip(q, 300))
      .filter(Boolean)
      .slice(0, 20),
  };
}
