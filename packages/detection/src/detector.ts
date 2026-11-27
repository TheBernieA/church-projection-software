import { WHOLE_CHAPTER, type PassageRef } from '@lampstand/core';
import { findReferencesInText, type ReferenceContext } from '@lampstand/scripture';

/** A reference heard in the transcript. */
export interface HeardReference {
  readonly passages: PassageRef[];
  readonly confidence: number;
  /** The words it was heard in. */
  readonly snippet: string;
  /** "John chapter 3" with no verse: shown only by the operator, never automatically. */
  readonly chapterOnly: boolean;
}

export interface DetectorOptions {
  readonly lang?: string;
  /** How long "verse 18" keeps meaning the last book and chapter heard. */
  readonly contextTtlMs: number;
  /** Words of the previous piece kept in front of the next ("John chapter 3 | verse 16"). */
  readonly carryWords: number;
  /** Below this, a reference isn't reported at all. */
  readonly minConfidence: number;
}

export const DEFAULT_DETECTOR: DetectorOptions = {
  contextTtlMs: 5 * 60_000,
  carryWords: 8,
  minConfidence: 0.5,
};

/**
 * Speech-to-text punctuates pauses: "the Gospel of John, chapter 3, verse 16." A comma or full
 * stop right before "chapter" or "verse" is a breath, not a break between references, so it's
 * dropped before scanning (commas elsewhere, as in "8:28, 31-39", keep their meaning).
 */
export function unpunctuateSpeech(text: string): string {
  return text.replace(/\s*[,.;:\u2013\u2014-]+\s+(?=(?:chapters?|verses?)\b)/gi, ' ');
}

export const isChapterOnly = (p: PassageRef): boolean =>
  p.start.verse === 1 && p.end.verse === WHOLE_CHAPTER && p.start.chapter === p.end.chapter;

/**
 * Turns transcript pieces into scripture references (BUILD_SPEC §10.2 A). Each piece is read
 * with the end of the one before, so a reference split by a pause is still whole, and with the
 * book and chapter last heard, so "verse 17" after "John 3:16" is John 3:17.
 */
export class VerseDetector {
  private readonly o: DetectorOptions;
  private tail = '';
  private context: { ctx: ReferenceContext; at: number } | null = null;

  constructor(opts: Partial<DetectorOptions> = {}) {
    this.o = { ...DEFAULT_DETECTOR, ...opts };
  }

  /** The operator put a passage on screen: "verse 5" now means that chapter. */
  setContext(ctx: ReferenceContext | null, nowMs: number): void {
    this.context = ctx ? { ctx, at: nowMs } : null;
  }

  currentContext(nowMs: number): ReferenceContext | null {
    if (!this.context || nowMs - this.context.at > this.o.contextTtlMs) return null;
    return this.context.ctx;
  }

  reset(): void {
    this.tail = '';
    this.context = null;
  }

  feed(text: string, nowMs: number): HeardReference[] {
    const piece = unpunctuateSpeech(text.trim());
    if (!piece) return [];
    const prefix = this.tail ? `${this.tail} ` : '';
    const scanned = prefix + piece;
    const ctx = this.currentContext(nowMs);
    const found = findReferencesInText(scanned, {
      ...(this.o.lang !== undefined ? { lang: this.o.lang } : {}),
      ...(ctx ? { context: ctx } : {}),
    });
    const out: HeardReference[] = [];
    let consumedTo = 0;
    for (const r of found) {
      consumedTo = Math.max(consumedTo, r.end);
      // Wholly inside the carried words: already reported with the previous piece.
      if (r.end <= prefix.length) continue;
      const last = r.passages[r.passages.length - 1];
      if (last)
        this.context = { ctx: { book: last.end.book, chapter: last.end.chapter }, at: nowMs };
      if (r.confidence < this.o.minConfidence) continue;
      out.push({
        passages: r.passages,
        confidence: r.confidence,
        snippet: r.text,
        chapterOnly: r.passages.every(isChapterOnly),
      });
    }
    // Carry the words after the last reference (a reference is never read twice).
    const rest = scanned.slice(consumedTo).trim();
    this.tail = rest.split(/\s+/).filter(Boolean).slice(-this.o.carryWords).join(' ');
    return out;
  }
}

// ---------- The queue the operator sees ----------

export type CandidateStatus = 'pending' | 'shown' | 'dismissed' | 'expired';

export interface Candidate {
  readonly id: string;
  passages: PassageRef[];
  confidence: number;
  snippet: string;
  chapterOnly: boolean;
  /** When it was (last) heard. */
  at: number;
  status: CandidateStatus;
}

export interface QueueOptions {
  /** The same passage isn't suggested again within this time. */
  readonly cooldownMs: number;
  /** A suggestion nobody acted on goes after this. */
  readonly expireMs: number;
  /** The next verse heard within this time extends the suggestion instead of adding one. */
  readonly mergeMs: number;
  /** Candidates kept (oldest dropped). */
  readonly max: number;
}

export const DEFAULT_QUEUE: QueueOptions = {
  cooldownMs: 90_000,
  expireMs: 60_000,
  mergeMs: 45_000,
  max: 30,
};

/** A stable key for a passage list ("JHN.3.16-JHN.3.17"). */
export function passageKey(passages: readonly PassageRef[]): string {
  return passages
    .map(
      (p) =>
        `${p.start.book}.${p.start.chapter}.${p.start.verse}-${p.end.book}.${p.end.chapter}.${p.end.verse}`,
    )
    .join(',');
}

const single = (c: { passages: readonly PassageRef[] }): PassageRef | null =>
  c.passages.length === 1 ? (c.passages[0] ?? null) : null;

const sameChapter = (a: PassageRef, b: PassageRef): boolean =>
  a.start.book === b.start.book &&
  a.end.book === b.end.book &&
  a.start.chapter === b.start.chapter &&
  a.end.chapter === b.end.chapter &&
  a.start.book === a.end.book &&
  a.start.chapter === a.end.chapter;

export type OfferResult =
  | { readonly kind: 'added'; readonly candidate: Candidate }
  | { readonly kind: 'merged'; readonly candidate: Candidate }
  | { readonly kind: 'suppressed' };

/**
 * Suggestions waiting for the operator (BUILD_SPEC §10.2–10.3): the same passage isn't
 * suggested twice in a row, verses read one after another become one range, "John 3" followed
 * by "verse 16" becomes John 3:16, and a passage the operator said "not today" to stays away.
 */
export class DetectionQueue {
  private readonly o: QueueOptions;
  private items: Candidate[] = [];
  private recent = new Map<string, number>();
  private blocked = new Set<string>();
  private seq = 0;

  constructor(
    opts: Partial<QueueOptions> = {},
    private readonly newId: () => string = () => `c${++this.seq}`,
  ) {
    this.o = { ...DEFAULT_QUEUE, ...opts };
  }

  /** Newest first. */
  list(): readonly Candidate[] {
    return this.items;
  }

  get(id: string): Candidate | undefined {
    return this.items.find((c) => c.id === id);
  }

  pending(): Candidate[] {
    return this.items.filter((c) => c.status === 'pending');
  }

  offer(h: HeardReference, now: number): OfferResult {
    const key = passageKey(h.passages);
    if (this.blocked.has(key)) return { kind: 'suppressed' };
    const seen = this.recent.get(key);
    if (seen !== undefined && now - seen < this.o.cooldownMs) return { kind: 'suppressed' };

    const merged = this.mergeInto(h, now);
    this.recent.set(key, now);
    if (merged) return { kind: 'merged', candidate: merged };

    const candidate: Candidate = {
      id: this.newId(),
      passages: h.passages,
      confidence: h.confidence,
      snippet: h.snippet,
      chapterOnly: h.chapterOnly,
      at: now,
      status: 'pending',
    };
    this.items = [candidate, ...this.items].slice(0, this.o.max);
    return { kind: 'added', candidate };
  }

  /** A verse right after (or inside) the newest pending suggestion of the same chapter. */
  private mergeInto(h: HeardReference, now: number): Candidate | null {
    const heard = single(h);
    const top = this.items.find((c) => c.status === 'pending');
    const was = top && single(top);
    if (!heard || !top || !was || now - top.at > this.o.mergeMs || !sameChapter(was, heard))
      return null;
    if (top.chapterOnly && !h.chapterOnly) {
      // "John 3" then "verse 16": the verse is what's meant.
      top.passages = [heard];
      top.chapterOnly = false;
    } else if (!top.chapterOnly && !h.chapterOnly) {
      const contiguous =
        heard.start.verse <= was.end.verse + 1 && heard.end.verse >= was.start.verse - 1;
      if (!contiguous) return null;
      top.passages = [
        {
          start: heard.start.verse < was.start.verse ? heard.start : was.start,
          end: heard.end.verse > was.end.verse ? heard.end : was.end,
        },
      ];
    } else return null;
    top.confidence = Math.max(top.confidence, h.confidence);
    top.snippet = `${top.snippet} … ${h.snippet}`.slice(-240);
    top.at = now;
    this.recent.set(passageKey(top.passages), now);
    return top;
  }

  mark(id: string, status: CandidateStatus): Candidate | undefined {
    const c = this.get(id);
    if (c) c.status = status;
    return c;
  }

  /** "Don't suggest this again today." */
  block(id: string): void {
    const c = this.mark(id, 'dismissed');
    if (c) this.blocked.add(passageKey(c.passages));
  }

  /** Pending suggestions older than `expireMs` expire. Returns whether anything changed. */
  expire(now: number): boolean {
    let changed = false;
    for (const c of this.items) {
      if (c.status === 'pending' && now - c.at > this.o.expireMs) {
        c.status = 'expired';
        changed = true;
      }
    }
    return changed;
  }

  clear(): void {
    this.items = [];
    this.recent.clear();
  }
}

// ---------- What each mode does with a suggestion ----------

export type DetectionMode = 'off' | 'suggest' | 'approve' | 'auto';

/**
 * - `show`: put it on screen now (Auto, sure enough, a verse not just a chapter);
 * - `ask`: queue it and draw the operator's eye (Approve, or Auto below the threshold);
 * - `list`: just list it (Suggest);
 * - `ignore`: listening is off.
 */
export type Route = 'show' | 'ask' | 'list' | 'ignore';

export function routeDetection(
  c: { readonly confidence: number; readonly chapterOnly: boolean },
  mode: DetectionMode,
  autoThreshold: number,
): Route {
  switch (mode) {
    case 'off':
      return 'ignore';
    case 'suggest':
      return 'list';
    case 'approve':
      return 'ask';
    case 'auto':
      return !c.chapterOnly && c.confidence >= autoThreshold ? 'show' : 'ask';
  }
}
