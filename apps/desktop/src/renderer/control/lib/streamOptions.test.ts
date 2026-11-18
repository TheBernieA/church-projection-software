import { describe, expect, it } from 'vitest';
import { sceneOf, STREAM_SCENES } from './streamOptions';

describe('stream scenes', () => {
  it('are all different, and a picture finds its scene (or none: custom)', () => {
    const keys = STREAM_SCENES.map((s) => `${s.background}/${s.words}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of STREAM_SCENES) expect(sceneOf(s)).toBe(s.id);
    expect(sceneOf({ background: 'black', words: 'lowerThird' })).toBeNull();
  });
});
