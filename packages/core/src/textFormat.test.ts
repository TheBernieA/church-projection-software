import { describe, expect, it } from 'vitest';
import { STARTER_THEMES, withTextFormat } from './themes';

const theme = STARTER_THEMES[0]!;

describe('withTextFormat', () => {
  it('returns the theme untouched when the item has no formatting', () => {
    expect(withTextFormat(theme, undefined)).toBe(theme);
    expect(withTextFormat(theme, {})).toBe(theme);
  });

  it('layers font, colour, alignment and style over the theme', () => {
    const t = withTextFormat(theme, {
      fontFamily: 'Inter',
      color: '#ff0000',
      align: 'left',
      bold: true,
      italic: true,
    });
    expect(t.text).toMatchObject({
      fontFamily: 'Inter',
      color: '#ff0000',
      align: 'left',
      fontWeight: 700,
      italic: true,
    });
    // The reference line follows the font and colour.
    expect(t.reference).toMatchObject({ fontFamily: 'Inter', color: '#ff0000' });
    // Everything else is the theme's, and the theme itself is not changed.
    expect(t.text.lineHeight).toBe(theme.text.lineHeight);
    expect(theme.text.color).not.toBe('#ff0000');
  });

  it('sets capitals, the words up or down, and a stroke and shadow (or none)', () => {
    const t = withTextFormat(theme, {
      uppercase: true,
      valign: 'top',
      stroke: { width: 3, color: '#000000' },
      shadow: { x: 2, y: 2, blur: 6, color: '#000000' },
    });
    expect(t.text.textTransform).toBe('uppercase');
    expect(t.layout).toBe('top');
    expect(t.text.outline).toEqual({ width: 3, color: '#000000' });
    expect(t.text.shadow).toMatchObject({ blur: 6 });
    const none = withTextFormat(
      { ...theme, text: { ...theme.text, shadow: { x: 1, y: 1, blur: 4, color: '#000000' } } },
      { shadow: null, stroke: null },
    );
    expect(none.text.shadow).toBeUndefined();
    expect(none.text.outline).toBeUndefined();
    // A split or custom layout keeps its own placement.
    expect(withTextFormat({ ...theme, layout: 'split' }, { valign: 'bottom' }).layout).toBe(
      'split',
    );
  });

  it('makes the size the auto-fit ceiling so long slides still shrink', () => {
    const t = withTextFormat(theme, { fontSize: 40 });
    expect(t.text.fontSize).toBe(40);
    expect(t.autoFit.maxSize).toBe(40);
    expect(t.autoFit.minSize).toBeLessThanOrEqual(40);
  });
});
