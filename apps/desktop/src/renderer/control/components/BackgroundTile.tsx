import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { makeScene, type BackgroundRef } from '@lampstand/core';
import { swatchCss } from '../lib/utils';
import { SceneView } from './SceneView';

/**
 * A built-in background in the picker, drawn by the output renderer: a still frame, and for
 * motion backgrounds live motion while hovered or focused (one animated preview at a time).
 */
export function BackgroundTile({
  name,
  bgRef,
  title,
  onPick,
}: {
  name: string;
  bgRef: BackgroundRef;
  title: string;
  onPick: () => void;
}) {
  const [hot, setHot] = useState(false);
  const moving = bgRef.kind === 'generated';
  const scene = useMemo(() => makeScene({ background: { ref: bgRef } }), [bgRef]);
  return (
    <button
      type="button"
      title={title}
      onClick={onPick}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      className="group text-left"
    >
      <div
        className="relative aspect-video w-full overflow-hidden rounded-[8px] shadow-[var(--shadow-1)] transition-transform duration-150 will-change-transform group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-2)]"
        style={{ background: swatchCss(bgRef) }}
      >
        {/* The real renderer: a still frame, and live motion while hovered. */}
        <div className="absolute inset-0">
          <SceneView scene={scene} mode={moving && hot ? 'monitor' : 'thumbnail'} />
        </div>
        {moving && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm"
          >
            <Sparkles size={11} />
          </span>
        )}
      </div>
      <span className="mt-1.5 block text-[12px] text-[var(--text-2)]">{name}</span>
    </button>
  );
}
