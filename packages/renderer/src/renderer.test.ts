// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  EMPTY_MASKS,
  EMPTY_SCENE,
  GeneratedPresetSchema,
  LogoStyleSchema,
  STARTER_THEMES,
  type Scene,
} from '@lampstand/core';
import { buildGenerated } from './generated';
import { buildLogoCard } from './logoCard';
import { FitCache, fitFontSize } from './fit';
import { SceneRenderer } from './sceneRenderer';
import { backgroundFilter, backgroundKey } from './style';
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

describe('web pages', () => {
  const web = { ...EMPTY_SCENE, web: { key: 'w', url: 'https://example.com/give' } };
  it('monitors show a card naming the page', () => {
    const host = document.createElement('div');
    new SceneRenderer(host, { mode: 'monitor', mediaUrl: (id) => id }).render(web, {
      instant: true,
    });
    expect(host.querySelector('.ls-web-url')?.textContent).toBe('example.com/give');
  });
  it('outputs draw nothing (the isolated web view covers them)', () => {
    const host = document.createElement('div');
    new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id }).render(web, {
      instant: true,
    });
    expect(host.querySelector('.ls-web')).toBeNull();
  });
});

describe('slide objects', () => {
  it('draws text boxes, shapes and pictures at their canvas positions, under the slide text', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => `media://${id}` });
    const s = scene('Title');
    r.render(
      {
        ...s,
        content: {
          ...s.content!,
          objects: [
            { id: 'r', kind: 'rect', x: 100, y: 200, w: 300, h: 150, fill: '#ff0000', radius: 12 },
            {
              id: 't',
              kind: 'text',
              x: 0,
              y: 0,
              w: 500,
              h: 100,
              text: 'Hello',
              fontSize: 40,
              color: '#fff',
              align: 'center',
            },
            { id: 'i', kind: 'image', x: 10, y: 10, w: 50, h: 50, mediaId: 'pic', fit: 'cover' },
          ],
        },
      },
      { instant: true },
    );
    const rect = host.querySelector('.ls-object-rect') as HTMLElement;
    expect([rect.style.left, rect.style.top, rect.style.width]).toEqual([
      '100px',
      '200px',
      '300px',
    ]);
    expect(rect.style.borderRadius).toBe('12px');
    expect(host.querySelector('.ls-object-text')?.textContent).toBe('Hello');
    expect(host.querySelector('.ls-object-image img')?.getAttribute('src')).toBe('media://pic');
    expect((host.querySelector('.ls-text') as HTMLElement).style.zIndex).toBe('1');
  });
});

describe('text and background effects', () => {
  it('glow adds a soft halo to the text shadow', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    const s = scene('Glow');
    const theme = {
      ...s.content!.theme,
      text: { ...s.content!.theme.text, glow: { blur: 24, color: '#ff0000' } },
    };
    r.render({ ...s, content: { ...s.content!, theme } }, { instant: true });
    expect((host.querySelector('.ls-text') as HTMLElement).style.textShadow).toContain('24px');
  });

  it('background adjustments become a filter chain and a tint wash', () => {
    expect(backgroundFilter({ blur: 4, brightness: 0.8, contrast: 1, saturate: 1.5 })).toBe(
      'blur(4px) brightness(0.8) saturate(1.5)',
    );
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    r.render(
      {
        ...scene('x'),
        background: {
          ref: { kind: 'color', color: '#123456' },
          adjust: { tint: { color: '#0000ff', opacity: 0.4 } },
        },
      },
      { instant: true },
    );
    expect((host.querySelector('.ls-bg-tint') as HTMLElement).style.opacity).toBe('0.4');
  });

  it('changing only the adjustments rebuilds the background', () => {
    const ref = { kind: 'color' as const, color: '#123456' };
    expect(backgroundKey({ ref })).not.toBe(backgroundKey({ ref, adjust: { dim: 0.5 } }));
  });
});

describe('bilingual lyrics', () => {
  it('draws a secondary (translation) block smaller and in italics under the lyric', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    const s = scene('Amazing grace');
    r.render(
      {
        ...s,
        content: {
          ...s.content!,
          blocks: [
            { spans: [{ text: 'Amazing grace' }] },
            { spans: [{ text: 'Sublime gracia' }], role: 'secondary' },
          ],
        },
      },
      { instant: true },
    );
    const second = host.querySelector('.ls-block-secondary') as HTMLElement;
    expect(second.textContent).toBe('Sublime gracia');
    expect(second.style.fontStyle).toBe('italic');
    expect(second.style.fontSize).toBe('0.72em');
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

  it('a full announcement hides the slide words under it; a lower third leaves them', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    const words = host.querySelector<HTMLElement>('.ls-layer-content');
    const notice = (layout: typeof theme.layout) => ({
      key: 'n',
      kind: 'text' as const,
      theme: { ...theme, layout },
      blocks: [{ spans: [{ text: 'Welcome' }] }],
    });
    r.render({ ...scene('one'), announcement: notice('center') }, { instant: true });
    expect(words?.style.opacity).toBe('0');
    r.render({ ...scene('one'), announcement: notice('lower-third') }, { instant: true });
    expect(words?.style.opacity).toBe('');
    r.render({ ...scene('one'), announcement: null }, { instant: true });
    expect(words?.style.opacity).toBe('');
  });

  it("turns a background video's sound on and off without restarting it", () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id, audio: true });
    const withVideo = (sound?: boolean): Scene => ({
      ...scene('one'),
      background: { ref: { kind: 'video', mediaId: 'v', loop: true, sound } },
    });
    r.render(withVideo());
    const v = host.querySelector('.ls-bg video') as HTMLVideoElement;
    expect(v.muted).toBe(true);
    r.render(withVideo(true));
    expect(host.querySelector('.ls-bg video')).toBe(v);
    expect(v.muted).toBe(false);
    // A video over everything silences it; it's heard again when that goes.
    r.render({
      ...withVideo(true),
      media: {
        mediaId: 'm',
        kind: 'video',
        loop: false,
        muted: false,
        fit: 'cover',
        playing: true,
        position: 0,
        volume: 1,
      },
    });
    expect(v.muted).toBe(true);
    r.render(withVideo(true));
    expect(v.muted).toBe(false);
    // Only the renderer that plays the room's sound is heard.
    r.setAudio(false);
    expect(v.muted).toBe(true);
  });

  it('changes the readability overlay without rebuilding the background', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
    const withOverlay = (style?: 'bottom' | 'even'): Scene => ({
      ...scene('one'),
      background: {
        ref: { kind: 'video', mediaId: 'v', loop: true },
        ...(style ? { adjust: { scrim: { style, strength: 0.5 } } } : {}),
      },
    });
    r.render(withOverlay());
    const bg = host.querySelector('.ls-bg');
    expect(host.querySelector('.ls-bg-scrim')).toBeNull();
    r.render(withOverlay('bottom'));
    expect(host.querySelector('.ls-bg')).toBe(bg);
    expect(host.querySelector<HTMLElement>('.ls-bg-scrim')?.style.background).toContain(
      'linear-gradient',
    );
    r.render(withOverlay('even'));
    expect(host.querySelectorAll('.ls-bg-scrim')).toHaveLength(1);
    r.render(withOverlay());
    expect(host.querySelector('.ls-bg')).toBe(bg);
    expect(host.querySelector('.ls-bg-scrim')).toBeNull();
  });

  it('centres the words on a canvas wider than the theme (edge blending)', () => {
    const host = document.createElement('div');
    const r = new SceneRenderer(host, {
      mode: 'output',
      mediaUrl: (id) => id,
      canvas: { width: 3552, height: 1080 },
    });
    r.render(scene('wide'));
    const words = host.querySelector<HTMLElement>('.ls-layer-content > *');
    expect(words?.style.left).toBe(`${(3552 - theme.canvas.width) / 2}px`);
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

describe('motion backgrounds and logo cards', () => {
  it('draws every generated preset, still in thumbnails', () => {
    for (const preset of GeneratedPresetSchema.options) {
      const node = buildGenerated(document, preset, ['#ffffff', '#336699', '#000000'], 1, false);
      expect(node.classList.contains(`ls-gen-${preset}`)).toBe(true);
      expect(node.children.length).toBeGreaterThan(0);
    }
  });
  it('the name card shows the name and tagline as text, in every look', () => {
    for (const style of LogoStyleSchema.options) {
      const node = document.createElement('div');
      buildLogoCard(document, node, { text: '<b>Grace</b>', style, tagline: 'Welcome' }, false);
      expect(node.querySelector('.ls-logo-name')?.textContent).toBe('<b>Grace</b>');
      expect(node.querySelector('b')).toBeNull();
      expect(node.querySelector('.ls-logo-tagline')?.textContent).toBe('Welcome');
    }
  });
});

describe('mixer gain staging', () => {
  it("takes the Web Audio compressor's hidden makeup gain back out", async () => {
    const { autoMakeupDb } = await import('./mixer');
    // A channel compressor at −18 dB, 3:1 would add about 7 dB by itself.
    expect(autoMakeupDb(-18, 3)).toBeCloseTo(7.2, 1);
    // The limiter (20:1 near the top) adds under a dB; none at all when it's off.
    expect(autoMakeupDb(-1.5, 20)).toBeCloseTo(0.855, 2);
    expect(autoMakeupDb(0, 1)).toBeCloseTo(0, 6);
  });
});
