import { describe, expect, it } from 'vitest';
import { typographyClass } from './Typography';

describe('typographyClass', () => {
  it('builds the classes for a preset', () => {
    expect(typographyClass({ variant: 'overline' })).toBe(
      'text-ui-11 text-[var(--text-3)] font-semibold uppercase tracking-[0.06em]',
    );
    expect(typographyClass({ variant: 'caption' })).toBe('text-ui-12 text-[var(--text-3)]');
  });

  it('lets props override the preset', () => {
    expect(typographyClass({ variant: 'caption', tone: 'secondary', size: 13 })).toBe(
      'text-ui-13 text-[var(--text-2)]',
    );
  });

  it('adds leading, truncation and tabular numbers', () => {
    expect(typographyClass({ size: 12, leading: 'snug', truncate: true, tabular: true })).toBe(
      'text-ui-12 leading-snug truncate tnum',
    );
  });

  it('adds nothing for inherit or no props', () => {
    expect(typographyClass({ tone: 'inherit' })).toBe('');
    expect(typographyClass({})).toBe('');
  });
});
