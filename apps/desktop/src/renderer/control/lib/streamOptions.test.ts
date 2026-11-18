import { describe, expect, it } from 'vitest';
import { STREAM_SCENES } from './streamOptions';

describe('stream scenes', () => {
  it('are all different looks', () => {
    const keys = STREAM_SCENES.map((s) => `${s.background}/${s.words}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
