import { describe, expect, it } from 'vitest';
import { textClass } from './Text';

describe('textClass', () => {
  it('builds the classes for a preset', () => {
    expect(textClass({ variant: 'overline' })).toBe(
      'text-ui-11 text-[var(--text-3)] font-semibold uppercase tracking-[0.06em]',
    );
    expect(textClass({ variant: 'caption' })).toBe('text-ui-12 text-[var(--text-3)]');
  });

  it('lets props override the preset', () => {
    expect(textClass({ variant: 'caption', tone: 'secondary', size: 13 })).toBe(
      'text-ui-13 text-[var(--text-2)]',
    );
  });

  it('adds leading, truncation and tabular numbers', () => {
    expect(textClass({ size: 12, leading: 'snug', truncate: true, tabular: true })).toBe(
      'text-ui-12 leading-snug truncate tnum',
    );
  });

  it('adds nothing for inherit or no props', () => {
    expect(textClass({ tone: 'inherit' })).toBe('');
    expect(textClass({})).toBe('');
  });
});
