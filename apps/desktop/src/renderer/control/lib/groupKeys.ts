/**
 * Group hotkeys: a letter per song section (C for the Chorus, B for the Bridge), as in other
 * presentation software. Pressing it in the Show workspace takes the selected item to that
 * section. The letters are fixed by the section's name, so they're the same in every song.
 */

/** Verses take the home row, in order. */
const VERSE_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'];
const CHORUS_KEYS = ['C', 'X', 'Z'];
const BRIDGE_KEYS = ['B', 'N', 'M'];

/** "Verse 2" → its number (1 when there's none). */
const nth = (label: string): number => Number(/(\d+)/.exec(label)?.[1] ?? 1);

/** The letter for a section by its name ("Chorus 1" → C, "Verse 2" → S), or null for none. */
export function groupHotkey(group: string | undefined): string | null {
  const g = (group ?? '').trim().toLowerCase();
  if (!g) return null;
  if (/^pre-?chorus/.test(g)) return 'P';
  if (/^(verse|stanza)/.test(g)) return VERSE_KEYS[nth(g) - 1] ?? null;
  if (/^(chorus|refrain)/.test(g)) return CHORUS_KEYS[nth(g) - 1] ?? null;
  if (/^bridge/.test(g)) return BRIDGE_KEYS[nth(g) - 1] ?? null;
  if (/^tag/.test(g)) return 'T';
  if (/^intro/.test(g)) return 'I';
  if (/^outro/.test(g)) return 'O';
  if (/^(ending|coda)/.test(g)) return 'E';
  if (/^(interlude|instrumental)/.test(g)) return 'U';
  if (/^vamp/.test(g)) return 'V';
  return null;
}

/** Where each section starts (slide index → its letter): the slides that carry a badge. */
export function groupStarts(slides: readonly { group?: string }[]): Map<number, string> {
  const out = new Map<number, string>();
  slides.forEach((s, i) => {
    if (i > 0 && slides[i - 1]?.group === s.group) return;
    const key = groupHotkey(s.group);
    if (key) out.set(i, key);
  });
  return out;
}

/**
 * The slide a letter goes to: the next start of that section after `from` (a chorus sung
 * three times goes to the next one), else its first. -1 when the item has no such section.
 */
export function slideForHotkey(
  slides: readonly { group?: string }[],
  letter: string,
  from: number,
): number {
  const starts = [...groupStarts(slides)]
    .filter(([, k]) => k === letter.toUpperCase())
    .map(([i]) => i);
  return starts.find((i) => i > from) ?? starts[0] ?? -1;
}
