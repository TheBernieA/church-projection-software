import { describe, expect, it } from 'vitest';
import { ServicePlanSchema } from '@lampstand/core';
import type { DraftItem, LyricsDraft, PlanDraft } from './draft';
import { songFromLyricsDraft } from './lyrics';
import { planUserMessage } from './prompt';
import { matchSong, resolveDraft, titleScore } from './resolve';

const songs = [
  { id: 's1', title: 'Amazing Grace (My Chains Are Gone)' },
  { id: 's2', title: 'How Great Thou Art' },
  { id: 's3', title: '10,000 Reasons', alternateTitles: ['Bless The Lord'] },
];

const step = (d: Partial<DraftItem> & Pick<DraftItem, 'kind' | 'title'>): DraftItem => ({
  songTitle: null,
  reference: null,
  minutes: null,
  notes: null,
  slides: [],
  ...d,
});

let n = 0;
const ctx = { songs, versionId: 'kjv', newId: () => `id-${++n}` };

describe('song matching', () => {
  it('finds library songs despite small differences', () => {
    expect(matchSong('Amazing Grace', songs)?.id).toBe('s1');
    expect(matchSong('how great thou art!', songs)?.id).toBe('s2');
    expect(matchSong('Bless the Lord (10,000 Reasons)', songs)?.id).toBe('s3');
    expect(matchSong('Way Maker', songs)).toBeNull();
  });
  it('scores titles', () => {
    expect(titleScore('The Blessing', 'Blessing')).toBe(1);
    expect(titleScore('Great Are You Lord', 'Great Is Thy Faithfulness')).toBeLessThan(0.75);
  });
});

describe('resolveDraft', () => {
  const draft: PlanDraft = {
    name: 'Sunday Morning',
    date: '2026-11-29',
    questions: ['Which version for the reading?'],
    items: [
      step({ kind: 'countdown', title: 'Service starts in', minutes: 5 }),
      step({ kind: 'section', title: 'Worship' }),
      step({ kind: 'song', title: 'Opening song', songTitle: 'Amazing Grace', notes: 'Band' }),
      step({ kind: 'song', title: 'Way Maker', songTitle: 'Way Maker' }),
      step({ kind: 'scripture', title: 'Reading', reference: '1 Corinthians 13:4-7' }),
      step({ kind: 'scripture', title: 'Reading', reference: 'somewhere in the gospels' }),
      step({
        kind: 'announcement',
        title: 'Notices',
        slides: [
          { title: 'Youth', body: 'Friday 7pm' },
          { title: '', body: '' },
        ],
      }),
      step({
        kind: 'sermon',
        title: 'Sermon: Love never fails',
        minutes: 30,
        slides: [{ title: '1', body: 'Love is patient' }],
      }),
      step({ kind: 'prayer', title: 'Closing prayer', notes: 'Pastor James' }),
    ],
  };
  const r = resolveDraft(draft, ctx);

  it('makes a valid plan', () => {
    const plan = {
      id: 'p',
      schemaVersion: 1,
      createdAt: 'x',
      updatedAt: 'x',
      name: r.name,
      date: r.date ?? undefined,
      isTemplate: false,
      items: r.items,
    };
    expect(ServicePlanSchema.safeParse(plan).success).toBe(true);
  });

  it('matches songs and keeps the ones it cannot find as labelled steps', () => {
    expect(r.items.find((i) => i.kind === 'song')).toMatchObject({ songId: 's1', notes: 'Band' });
    const missing = r.steps.find((s) => s.title === 'Way Maker');
    expect(missing?.status).toBe('unmatched');
    const item = r.items.find((i) => i.id === missing?.itemIds[0]);
    expect(item).toMatchObject({ kind: 'header', notes: 'Not in the library: Way Maker' });
  });

  it('reads references, and keeps unclear ones as notes', () => {
    expect(r.items.find((i) => i.kind === 'scripture')).toMatchObject({
      passage: {
        start: { book: '1CO', chapter: 13, verse: 4 },
        end: { book: '1CO', chapter: 13, verse: 7 },
      },
      versionIds: ['kjv'],
    });
    expect(r.steps.filter((s) => s.kind === 'scripture').map((s) => s.status)).toEqual([
      'parsed',
      'unmatched',
    ]);
  });

  it('makes countdowns, announcements and slides from the draft words only', () => {
    expect(r.items[0]).toMatchObject({ kind: 'countdown', target: { durationSec: 300 } });
    const a = r.items.find((i) => i.kind === 'announcements');
    expect(a?.kind === 'announcements' && a.slides).toHaveLength(1);
    expect(r.items.find((i) => i.kind === 'presentation')).toMatchObject({
      title: 'Sermon: Love never fails',
      notes: '≈ 30 min',
    });
    expect(r.items.at(-1)).toMatchObject({ kind: 'header', label: 'Closing prayer' });
  });

  it('keeps questions and the date', () => {
    expect(r.questions).toEqual(['Which version for the reading?']);
    expect(r.date).toBe('2026-11-29');
    expect(resolveDraft({ ...draft, date: 'next Sunday' }, ctx).date).toBeNull();
  });

  it('never goes past the plan limit', () => {
    const many = {
      ...draft,
      items: Array.from({ length: 1200 }, () => step({ kind: 'section', title: 'x' })),
    };
    expect(resolveDraft(many, ctx).items).toHaveLength(1000);
  });
});

describe('planUserMessage', () => {
  it('puts the plan and the titles in their own tags', () => {
    const m = planUserMessage({ text: 'Usual Sunday', date: '2026-11-29', songTitles: ['A', 'B'] });
    expect(m).toContain('<plan>\nUsual Sunday\n</plan>');
    expect(m).toContain('<library_songs>\nA\nB\n</library_songs>');
    expect(planUserMessage({ text: 'x' })).toContain('No library song list');
  });
});

describe('songFromLyricsDraft', () => {
  const draft: LyricsDraft = {
    title: 'Example',
    authors: ['A Writer'],
    sections: [
      { kind: 'verse', label: 'Verse 1', lines: ['Line one', 'Line two', ''] },
      { kind: 'chorus', label: 'Chorus', lines: ['Sing it'] },
      { kind: 'bridge', label: 'Bridge', lines: [] },
    ],
    order: ['V1', 'C', 'Verse 1', 'Chorus', 'Ending'],
  };
  it('keeps the lines, drops empty parts and follows the sung order', () => {
    const s = songFromLyricsDraft(draft, ctx.newId);
    expect(s?.sections.map((x) => x.label)).toEqual(['Verse 1', 'Chorus']);
    expect(s?.sections[0]?.lines).toEqual(['Line one', 'Line two']);
    const [v, c] = s?.sections ?? [];
    expect(s?.order).toEqual([v?.id, c?.id, v?.id, c?.id]);
  });
  it('nothing to sing is nothing', () => {
    expect(songFromLyricsDraft({ ...draft, sections: [] }, ctx.newId)).toBeNull();
  });
});
