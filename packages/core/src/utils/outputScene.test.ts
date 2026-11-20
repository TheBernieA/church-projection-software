import { describe, expect, it } from 'vitest';
import { STARTER_THEMES } from '../themes';
import { keyFeedScene, KEY_COLORS, makeScene, withKindThemes, withWordsTheme } from './scene';

const [first, second] = STARTER_THEMES;
if (!first || !second) throw new Error('needs two starter themes');
const scene = makeScene({
  background: { ref: { kind: 'color', color: '#123456' } },
  content: { key: 'k', kind: 'scripture', theme: first, blocks: [{ spans: [{ text: 'Words' }] }] },
});

describe('an output with its own themes', () => {
  it('draws a kind of slide in that output’s theme', () => {
    expect(withKindThemes(scene, { scripture: second }).content?.theme.id).toBe(second.id);
  });

  it('leaves other kinds, and scenes without words, alone', () => {
    expect(withKindThemes(scene, { lyrics: second })).toBe(scene);
    expect(withKindThemes(scene, {})).toBe(scene);
    const empty = makeScene();
    expect(withKindThemes(empty, { scripture: second })).toBe(empty);
    expect(withWordsTheme(scene, null)).toBe(scene);
  });

  it('counts countdowns as text', () => {
    const countdown = makeScene({
      content: { key: 'c', kind: 'countdown', theme: first, blocks: [] },
    });
    expect(withKindThemes(countdown, { text: second }).content?.theme.id).toBe(second.id);
  });
});

describe('a key feed for a video mixer', () => {
  it('keeps the words over a flat colour and drops pictures and video', () => {
    const withVideo = {
      ...scene,
      media: {
        mediaId: 'm',
        kind: 'video' as const,
        fit: 'cover' as const,
        loop: false,
        muted: false,
        volume: 1,
        playing: true,
        position: 0,
      },
    };
    const key = keyFeedScene(withVideo, 'green');
    expect(key.background?.ref).toEqual({ kind: 'color', color: KEY_COLORS.green });
    expect(key.media).toBeNull();
    expect(key.content).toBe(scene.content);
    expect(keyFeedScene(scene, 'black').background?.ref).toEqual({
      kind: 'color',
      color: '#000000',
    });
  });
});
