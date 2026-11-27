import { describe, expect, it } from 'vitest';
import type { PassageRef } from '@lampstand/core';
import {
  DetectionQueue,
  routeDetection,
  unpunctuateSpeech,
  VerseDetector,
  type HeardReference,
} from './detector';
import { cleanTranscript } from './transcriber';

const v = (book: string, chapter: number, a: number, b = a): PassageRef =>
  ({
    start: { book, chapter, verse: a },
    end: { book, chapter, verse: b },
  }) as PassageRef;

const heard = (p: PassageRef, chapterOnly = false, confidence = 0.9): HeardReference => ({
  passages: [p],
  confidence,
  snippet: 'x',
  chapterOnly,
});

describe('VerseDetector', () => {
  it('hears a reference in a sentence', () => {
    const d = new VerseDetector();
    const [r] = d.feed('turn with me to John chapter three verse sixteen', 0);
    expect(r?.passages).toEqual([v('JHN', 3, 16)]);
    expect(r?.chapterOnly).toBe(false);
  });

  it('reads references the way speech-to-text punctuates them', () => {
    const d = new VerseDetector();
    const [r] = d.feed('This morning, turn with me to the Gospel of John, chapter 3, verse 16.', 0);
    expect(r?.passages).toEqual([v('JHN', 3, 16)]);
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(d.feed('Now look at verse 17.', 1000)[0]?.passages).toEqual([v('JHN', 3, 17)]);
    expect(unpunctuateSpeech('Romans 8:28, 31-39')).toBe('Romans 8:28, 31-39');
  });

  it('a reference split by a pause is read whole', () => {
    const d = new VerseDetector();
    const first = d.feed('this morning we are in first Corinthians', 0);
    expect(first).toEqual([]);
    const [r] = d.feed('chapter thirteen verse four', 3000);
    expect(r?.passages).toEqual([v('1CO', 13, 4)]);
  });

  it('a reference is not reported twice because of the carried words', () => {
    const d = new VerseDetector();
    expect(d.feed('read John 3:16 with me', 0)).toHaveLength(1);
    expect(d.feed('for God so loved the world', 2000)).toHaveLength(0);
  });

  it('"verse 17" follows the last chapter heard, until the context lapses', () => {
    const d = new VerseDetector({ contextTtlMs: 60_000 });
    d.feed('John 3:16', 0);
    expect(d.feed('and then in verse seventeen', 5000)[0]?.passages).toEqual([v('JHN', 3, 17)]);
    expect(d.feed('and then in verse eighteen', 200_000)).toEqual([]);
  });

  it('the operator can set the context', () => {
    const d = new VerseDetector();
    d.setContext({ book: 'PSA', chapter: 23 }, 0);
    expect(d.feed('look at verse four', 1000)[0]?.passages).toEqual([v('PSA', 23, 4)]);
  });

  it('a chapter alone is marked as such', () => {
    const d = new VerseDetector();
    expect(d.feed('open your Bibles to Romans chapter 8', 0)[0]?.chapterOnly).toBe(true);
  });

  it('everyday words are not references', () => {
    const d = new VerseDetector();
    expect(d.feed('Mark my words, it is a job worth doing', 0)).toEqual([]);
  });
});

describe('DetectionQueue', () => {
  it('suggests a passage once per cooldown', () => {
    const q = new DetectionQueue({ cooldownMs: 10_000 });
    expect(q.offer(heard(v('JHN', 3, 16)), 0).kind).toBe('added');
    q.mark(q.list()[0]!.id, 'shown');
    expect(q.offer(heard(v('JHN', 3, 16)), 5000).kind).toBe('suppressed');
    expect(q.offer(heard(v('JHN', 3, 16)), 20_000).kind).toBe('added');
  });

  it('verses read one after another become one range', () => {
    const q = new DetectionQueue();
    q.offer(heard(v('JHN', 3, 16)), 0);
    const r = q.offer(heard(v('JHN', 3, 17)), 4000);
    expect(r.kind).toBe('merged');
    expect(q.pending()).toHaveLength(1);
    expect(q.pending()[0]?.passages).toEqual([v('JHN', 3, 16, 17)]);
  });

  it('a verse far away is a new suggestion', () => {
    const q = new DetectionQueue();
    q.offer(heard(v('JHN', 3, 16)), 0);
    expect(q.offer(heard(v('JHN', 3, 30)), 4000).kind).toBe('added');
    expect(q.offer(heard(v('JHN', 4, 1)), 4000).kind).toBe('added');
  });

  it('a chapter then a verse in it becomes the verse', () => {
    const q = new DetectionQueue();
    q.offer(heard(v('ROM', 8, 1, 999), true, 0.75), 0);
    q.offer(heard(v('ROM', 8, 28)), 2000);
    expect(q.pending()).toHaveLength(1);
    expect(q.pending()[0]).toMatchObject({ chapterOnly: false, passages: [v('ROM', 8, 28)] });
  });

  it('does not merge after the merge window', () => {
    const q = new DetectionQueue({ mergeMs: 1000 });
    q.offer(heard(v('JHN', 3, 16)), 0);
    expect(q.offer(heard(v('JHN', 3, 17)), 5000).kind).toBe('added');
  });

  it('"not today" keeps a passage away', () => {
    const q = new DetectionQueue({ cooldownMs: 0 });
    const r = q.offer(heard(v('GEN', 1, 1)), 0);
    if (r.kind === 'suppressed') throw new Error('expected a candidate');
    q.block(r.candidate.id);
    expect(q.offer(heard(v('GEN', 1, 1)), 999_999).kind).toBe('suppressed');
  });

  it('pending suggestions expire', () => {
    const q = new DetectionQueue({ expireMs: 1000 });
    q.offer(heard(v('GEN', 1, 1)), 0);
    expect(q.expire(500)).toBe(false);
    expect(q.expire(1500)).toBe(true);
    expect(q.pending()).toHaveLength(0);
  });
});

describe('routeDetection', () => {
  const sure = { confidence: 0.95, chapterOnly: false };
  it('follows the mode', () => {
    expect(routeDetection(sure, 'off', 0.9)).toBe('ignore');
    expect(routeDetection(sure, 'suggest', 0.9)).toBe('list');
    expect(routeDetection(sure, 'approve', 0.9)).toBe('ask');
    expect(routeDetection(sure, 'auto', 0.9)).toBe('show');
  });
  it('Auto asks when unsure, and never shows a bare chapter', () => {
    expect(routeDetection({ confidence: 0.7, chapterOnly: false }, 'auto', 0.9)).toBe('ask');
    expect(routeDetection({ confidence: 0.99, chapterOnly: true }, 'auto', 0.9)).toBe('ask');
  });
});

describe('cleanTranscript', () => {
  it('drops Whisper noise and tags', () => {
    expect(cleanTranscript(' Thank you. ')).toBe('');
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript('(music) Turn to John 3 [applause]')).toBe('Turn to John 3');
  });
});
