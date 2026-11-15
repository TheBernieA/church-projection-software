import { describe, expect, it } from 'vitest';
import { fillMessage, messageTokens } from './messages';
import { reflowToSlides, slidesToReflow } from './reflow';

describe('reflow (text presentations)', () => {
  const slides = [
    { id: 'a', title: 'Welcome', body: 'Grace Church\nSunday 10am', notes: 'smile' },
    { id: 'b', body: 'Coffee after the service' },
  ];
  it('round-trips titles, bodies, ids and notes', () => {
    const text = slidesToReflow(slides);
    expect(text).toBe('[Welcome]\nGrace Church\nSunday 10am\n\nCoffee after the service');
    expect(reflowToSlides(text, slides)).toEqual(slides);
  });
  it('a blank line splits a slide; new slides get new ids', () => {
    const out = reflowToSlides('[Welcome]\nGrace Church\n\nSunday 10am\n\n\n[Next]\n', slides);
    expect(out.map((s) => [s.title, s.body])).toEqual([
      ['Welcome', 'Grace Church'],
      [undefined, 'Sunday 10am'],
      ['Next', ''],
    ]);
    expect(out[0]?.id).toBe('a');
    expect(out[2]?.id).not.toBe('b');
    expect(out[2]?.id).toBeTruthy();
  });
  it('ignores empty input and stray whitespace', () => {
    expect(reflowToSlides('\n\n  \n')).toEqual([]);
  });
});

describe('message templates', () => {
  it('finds each field once, in order', () => {
    expect(messageTokens('Parent of {number}, room {room}, {number}')).toEqual(['number', 'room']);
    expect(messageTokens('No fields')).toEqual([]);
  });
  it('fills fields and keeps unfilled ones visible', () => {
    expect(fillMessage('Parent of {number}', { number: ' 12 ' })).toBe('Parent of 12');
    expect(fillMessage('Car {plate} in {lot}', { plate: 'AB12' })).toBe('Car AB12 in {lot}');
  });
});

describe('feature catalogue', () => {
  it('has unique ids, a known category for each, and both statuses', async () => {
    const { FEATURES, FEATURE_CATEGORIES } = await import('./features');
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(FEATURE_CATEGORIES.map((c) => c.id));
    expect(FEATURES.every((f) => cats.has(f.category))).toBe(true);
    expect(FEATURES.some((f) => f.status === 'soon')).toBe(true);
  });
});
