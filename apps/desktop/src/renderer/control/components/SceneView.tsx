import { memo, useEffect, useRef, useState } from 'react';
import type { Scene, ScreenMask, Standby } from '@lampstand/core';
import { SceneRenderer, type RenderMode } from '@lampstand/renderer';
import { mediaUrl } from '../../shared/mediaUrl';
import { useLogo } from '../lib/hooks';
import { useStore } from '../lib/store';
import { localVideoTap } from '../lib/audio';

/**
 * React wrapper around the shared output renderer — the operator sees exactly what the
 * projector shows (WYSIWYG, §3.2). Thumbnails render lazily when scrolled into view, and a
 * memo keeps an unchanged scene from re-rendering when its parent does.
 */
export const SceneView = memo(function SceneView({
  scene,
  mode = 'monitor',
  className = '',
  label,
  standby = null,
  audio = false,
  transparent = false,
  mask = null,
  instant = false,
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
  /** Screen mask, so a monitor shows the output's shape (Settings › Screens). */
  mask?: ScreenMask | null;
  /** Changes show at once, with no transition (an editor: every keystroke is a change). */
  instant?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<SceneRenderer | null>(null);
  const logo = useLogo(); // so the monitors show the real Logo mask
  // With no output, the monitor plays the room's video sound: through the room output.
  const sink = useStore((s) => (audio ? (s.settings?.audio.roomOutput ?? '') : ''));
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
    renderer.current?.setAudioSink(sink);
    renderer.current?.setAudioTap(audio ? localVideoTap : undefined);
    renderer.current?.setAudio(audio);
    renderer.current?.setStandby(standby);
    renderer.current?.setMask(mask);
    renderer.current?.render(scene, { instant });
    // mode/transparent: a new renderer was just built and needs the scene drawn into it.
  }, [scene, standby, audio, sink, logo, visible, mode, transparent, mask, instant]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={`relative aspect-video w-full overflow-hidden ${transparent ? '' : 'bg-black'} ${mode === 'thumbnail' && !visible ? 'ls-skeleton' : ''} ${className}`}
    />
  );
});
