import { useEffect, useRef, useState } from 'react';
import type { Scene, Standby } from '@lampstand/core';
import { SceneRenderer, type RenderMode } from '@lampstand/renderer';
import { mediaUrl } from '../../shared/mediaUrl';
import { useLogo } from '../lib/hooks';

/**
 * React wrapper around the shared output renderer — the operator sees exactly what the
 * projector shows (WYSIWYG, §3.2). Thumbnails render lazily when scrolled into view.
 */
export function SceneView({
  scene,
  mode = 'monitor',
  className = '',
  label,
  standby = null,
  audio = false,
  transparent = false,
}: {
  scene: Scene;
  mode?: RenderMode;
  className?: string;
  label?: string;
  /** Off-air screen shown when the scene is empty (the Program monitor mirrors the projector). */
  standby?: Standby | null;
  /** Play live video sound here (the Program monitor, only when no projector output exists). */
  audio?: boolean;
  /** No black backdrop: for layering (the canvas editor draws slide text over its objects). */
  transparent?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<SceneRenderer | null>(null);
  const logo = useLogo(); // so the monitors show the real Logo mask
  const [visible, setVisible] = useState(mode !== 'thumbnail');

  useEffect(() => {
    if (visible || !host.current) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '200px' },
    );
    io.observe(host.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !host.current) return;
    const r = new SceneRenderer(host.current, { mode, mediaUrl, transparent });
    renderer.current = r;
    void document.fonts.ready.then(() => r.refresh());
    return () => {
      r.destroy();
      renderer.current = null;
    };
  }, [visible, mode, transparent]);

  useEffect(() => {
    renderer.current?.setLogo(logo);
    renderer.current?.setAudio(audio);
    renderer.current?.setStandby(standby);
    renderer.current?.render(scene);
  }, [scene, standby, audio, logo, visible]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={`relative aspect-video w-full overflow-hidden ${transparent ? '' : 'bg-black'} ${className}`}
    />
  );
}
