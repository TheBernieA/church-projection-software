// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SCENE, type Scene, type VideoInputLayer } from '@lampstand/core';
import { SceneRenderer } from './sceneRenderer';

const cam = (id: string): VideoInputLayer => ({
  deviceId: id,
  label: id,
  fit: 'cover',
  mirror: false,
  resolution: 'auto',
});
const make = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const r = new SceneRenderer(host, { mode: 'output', mediaUrl: (id) => id });
  const inputs = () => host.querySelectorAll('.ls-layer-input > .ls-input');
  return { host, r, inputs };
};
const with_ = (patch: Partial<Scene>): Scene => ({ ...EMPTY_SCENE, ...patch });

afterEach(() => vi.useRealTimers());

describe('camera switching', () => {
  it('a fade keeps the old camera until the new one is up; a cut swaps at once', () => {
    vi.useFakeTimers();
    const { r, inputs } = make();
    r.render(with_({ input: cam('a') }));
    expect(inputs()).toHaveLength(1);
    r.render(with_({ input: cam('b'), inputTransition: { kind: 'fade', durationMs: 400 } }));
    expect(inputs()).toHaveLength(2);
    vi.advanceTimersByTime(500);
    expect(inputs()).toHaveLength(1);
    r.render(with_({ input: cam('c') }));
    expect(inputs()).toHaveLength(1);
  });

  it('the T-bar mixes the next camera in and keeps it when the take finishes', () => {
    vi.useFakeTimers();
    const { r, inputs } = make();
    r.render(with_({ input: cam('a'), inputNext: { input: cam('b'), pos: 0.4 } }));
    const all = inputs();
    expect(all).toHaveLength(2);
    const next = all[1] as HTMLElement;
    expect(next.style.opacity).toBe('0.4');
    r.render(with_({ input: cam('b'), inputTransition: { kind: 'fade', durationMs: 100 } }));
    vi.advanceTimersByTime(200);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0]).toBe(next); // not reopened
  });

  it('picture-in-picture sits in its corner', () => {
    const { r, host } = make();
    r.render(with_({ pip: { ...cam('p'), corner: 'tl', size: 0.25 } }));
    const box = host.querySelector<HTMLElement>('.ls-pip');
    expect(box?.style.width).toBe('25%');
    expect(box?.style.top).toBe('3.5%');
    expect(box?.style.left).toBe('3.5%');
    r.render(with_({ pip: null }));
    expect(host.querySelector('.ls-pip')).toBeNull();
  });
});
