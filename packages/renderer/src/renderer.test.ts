// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EMPTY_MASKS, EMPTY_SCENE, STARTER_THEMES, type Scene } from '@lampstand/core';
import { FitCache, fitFontSize } from './fit';
import { SceneRenderer } from './scene-renderer';
import { backgroundKey } from './style';
import { formatCountdown } from './content';

const theme = {
  ...STARTER_THEMES[0]!,
  transition: { kind: 'cut' as const, durationMs: 0, easing: 'linear' },
};
const scene = (text: string, color = '#123456'): Scene => ({
  background: { ref: { kind: 'color', color } },
  media: null,
  content: { key: text, kind: 'lyrics', theme, blocks: [{ spans: [{ text }] }] },
  overlays: [],
  masks: EMPTY_MASKS,
});

describe('fitFontSize', () => {
  it('finds the largest fitting size', () => {
    expect(fitFontSize(10, 100, (s) => s <= 57)).toBe(57);
    expect(fitFontSize(10, 100, () => true)).toBe(100);
    expect(fitFontSize(10, 100, () => false)).toBe(10);
  });
  it('uses few measurements', () => {
    let n = 0;
    fitFontSize(8, 400, (s) => (n++, s < 200));
    expect(n).toBeLessThanOrEqual(10);
  });
  it('cache evicts oldest', () => {
    const c = new FitCache(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });
});

describe('SceneRenderer', () => {
  it('renders text as text nodes, never HTML', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => `m://${id}` });
    r.render(scene('<img src=x onerror=alert(1)>'));
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.ls-text')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps the same background element across slide changes (continuity)', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    r.render(scene('one'));
    const bg = host.querySelector('.ls-bg');
    r.render(scene('two'));
    expect(host.querySelector('.ls-bg')).toBe(bg);
    expect(host.querySelector('.ls-text')?.textContent).toBe('two');
    r.render(scene('two', '#ffffff'));
    const all = host.querySelectorAll('.ls-bg');
    // New background cross-fades in on top of the old one, which is retired afterwards.
    expect(all[all.length - 1]).not.toBe(bg);
  });

  it('freeze holds the last frame', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    r.render(scene('one'));
    r.render({ ...scene('two'), masks: { ...EMPTY_MASKS, freeze: true } });
    expect(host.querySelector('.ls-text')?.textContent).toBe('one');
    r.render(scene('three'));
    expect(host.querySelector('.ls-text')?.textContent).toBe('three');
  });

  it('black mask covers output', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    r.render({ ...scene('x'), masks: { ...EMPTY_MASKS, black: true } }, { instant: true });
    expect((host.querySelector('.ls-mask-black') as HTMLElement).style.opacity).toBe('1');
  });
});

describe('props', () => {
  it('draws a library picture in its position and keeps it when other overlays change', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => `media://${id}` });
    const prop = {
      id: 'p1',
      kind: 'prop' as const,
      text: '',
      mediaId: 'logo',
      mediaKind: 'image' as const,
      position: 'top-right' as const,
    };
    r.render({ ...EMPTY_SCENE, overlays: [prop] }, { instant: true });
    const img = host.querySelector('.ls-prop-top-right img');
    expect(img?.getAttribute('src')).toBe('media://logo');
    r.render(
      { ...EMPTY_SCENE, overlays: [prop, { id: 'm', kind: 'lower-third', text: 'Parent of 12' }] },
      { instant: true },
    );
    expect(host.querySelector('.ls-prop-top-right img')).toBe(img); // not rebuilt
    expect(host.querySelector('.ls-lower-third')?.textContent).toBe('Parent of 12');
    r.render({ ...EMPTY_SCENE, overlays: [prop] }, { instant: true });
    expect(host.querySelector('.ls-lower-third')).toBeNull();
    expect(host.querySelector('.ls-prop-top-right img')).toBe(img);
  });
});

describe('video sound', () => {
  const video: Scene = {
    ...EMPTY_SCENE,
    media: {
      mediaId: 'clip',
      kind: 'video',
      fit: 'contain',
      loop: false,
      muted: false,
      playing: false,
      position: 0,
      volume: 1,
    },
  };
  const muted = (host: HTMLElement): boolean => host.querySelector('video')!.muted;

  it('plays only where audio is handed, and can move at runtime', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'monitor', mediaUrl: (id) => id });
    r.render(video, { instant: true });
    expect(muted(host)).toBe(true); // monitors are silent by default
    r.setAudio(true); // no projector: the Program monitor takes the sound
    expect(muted(host)).toBe(false);
    r.setAudio(false); // a projector appeared: hand it back
    expect(muted(host)).toBe(true);
  });

  it('the operator mute wins everywhere', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id, audio: true });
    r.render({ ...video, media: { ...video.media!, muted: true } }, { instant: true });
    expect(muted(host)).toBe(true);
  });
});

describe('off-air screen', () => {
  const opacity = (host: HTMLElement): string =>
    (host.querySelector('.ls-layer-standby') as HTMLElement).style.opacity;

  it('shows the logo card only while nothing is live', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    r.setStandby({ kind: 'logo', text: 'Grace Church' });
    r.render(EMPTY_SCENE, { instant: true });
    expect(host.querySelector('.ls-standby-logo')?.textContent).toBe('Grace Church');
    expect(opacity(host)).toBe('1');
    r.render(scene('verse'), { instant: true });
    expect(opacity(host)).toBe('0');
    r.render(EMPTY_SCENE, { instant: true });
    expect(opacity(host)).toBe('1');
  });

  it('uses a library image, and black means nothing extra', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => `media://${id}` });
    r.render(EMPTY_SCENE, { instant: true });
    r.setStandby({ kind: 'image', mediaId: 'pic' });
    expect(host.querySelector('.ls-standby-image img')?.getAttribute('src')).toBe('media://pic');
    expect(opacity(host)).toBe('1');
    r.setStandby({ kind: 'black' });
    expect(host.querySelector('.ls-standby')).toBeNull();
    expect(opacity(host)).toBe('0');
  });

  it('keeps the same node when the setting is re-sent unchanged (a loop never restarts)', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    r.setStandby({ kind: 'video', mediaId: 'loop' });
    const node = host.querySelector('.ls-standby');
    r.setStandby({ kind: 'video', mediaId: 'loop' });
    expect(host.querySelector('.ls-standby')).toBe(node);
  });

  it('the Logo mask shows the logo picture, and a logo video plays only while shown', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => `media://${id}` });
    r.setLogo({ kind: 'video', mediaId: 'intro' });
    const v = host.querySelector('.ls-mask-logo video') as HTMLVideoElement;
    expect(v.getAttribute('src')).toBe('media://intro');
    let plays = 0;
    v.play = () => ((plays += 1), Promise.resolve());
    r.render({ ...scene('x'), masks: { ...EMPTY_MASKS, logo: true } }, { instant: true });
    expect((host.querySelector('.ls-mask-logo') as HTMLElement).style.opacity).toBe('1');
    expect(plays).toBe(1);
    r.setLogo({ kind: 'video', mediaId: 'intro' }); // re-sent unchanged: same element
    expect(host.querySelector('.ls-mask-logo video')).toBe(v);
    r.setLogo({ kind: 'logo', text: 'Grace Church' });
    expect(host.querySelector('.ls-logo-logo')?.textContent).toBe('Grace Church');
  });

  it('is never drawn in thumbnails', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'thumbnail', mediaUrl: (id) => id });
    r.setStandby({ kind: 'logo', text: 'x' });
    r.render(EMPTY_SCENE);
    expect(host.querySelector('.ls-standby')).toBeNull();
  });
});

describe('helpers', () => {
  it('backgroundKey treats none and null alike', () => {
    expect(backgroundKey(null)).toBe('none');
    expect(backgroundKey({ ref: { kind: 'none' } })).toBe('none');
  });
  it('formats countdowns', () => {
    expect(formatCountdown(new Date(65_000).toISOString(), 0)).toBe('01:05');
    expect(formatCountdown(new Date(3_661_000).toISOString(), 0)).toBe('1:01:01');
    expect(formatCountdown(new Date(0).toISOString(), 10_000)).toBe('00:00');
  });
});
