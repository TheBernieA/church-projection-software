import { describe, expect, it } from 'vitest';
import {
  SCENE_GROUPS,
  STREAM_SCENES,
  streamLowerThirdOn,
  withStreamLowerThird,
} from './streamOptions';

describe('stream scenes', () => {
  it('are all different looks, each in a known group', () => {
    const keys = STREAM_SCENES.map(
      (s) => `${s.background}/${s.words}/${s.mirror ?? 'own'}/${s.layout ?? ''}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(STREAM_SCENES.every((s) => SCENE_GROUPS.includes(s.group))).toBe(true);
  });
});

describe('the stream’s own lower third', () => {
  const pic = (o: Record<string, unknown>) =>
    ({ mirror: 'own', background: 'program', words: 'full', ...o }) as never;
  it('is on only while the stream shows its own picture', () => {
    expect(streamLowerThirdOn(pic({ words: 'lowerThird' }))).toBe(true);
    expect(streamLowerThirdOn(pic({ words: 'lowerThird', mirror: 'program' }))).toBe(false);
  });
  it('turns off to the full slide on the main screen, and to no words over a camera', () => {
    expect(withStreamLowerThird(pic({}), true)).toMatchObject({ words: 'lowerThird' });
    expect(withStreamLowerThird(pic({ words: 'lowerThird' }), false)).toMatchObject({
      words: 'full',
    });
    expect(
      withStreamLowerThird(pic({ background: 'camera', words: 'lowerThird' }), false),
    ).toMatchObject({ words: 'none' });
  });
});
