import { describe, expect, it } from 'vitest';
import { SCENE_GROUPS, STREAM_SCENES } from './streamOptions';

describe('stream scenes', () => {
  it('are all different looks, each in a known group', () => {
    const keys = STREAM_SCENES.map(
      (s) => `${s.background}/${s.words}/${s.mirror ?? 'own'}/${s.layout ?? ''}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(STREAM_SCENES.every((s) => SCENE_GROUPS.includes(s.group))).toBe(true);
  });
});
