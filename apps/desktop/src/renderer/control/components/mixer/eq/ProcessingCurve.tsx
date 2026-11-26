import { useMemo } from 'react';
import {
  applyMixerAction,
  defaultMixer,
  MixerChannelSchema,
  presetForChannel,
  type Processing,
} from '@lampstand/core';
import { eqStages } from '@lampstand/renderer';
import { curve, dbToY } from './eqGeometry';

const POINTS = 64;
const RANGE = 18;

/** Processing as it would sound on a Lampstand channel (its EQ and cuts' response, in dB). */
function responseOf(p: Processing): number[] {
  const base = MixerChannelSchema.parse({ id: 'x', kind: 'input', name: 'x' });
  const { patch } = presetForChannel(p);
  const m = applyMixerAction(
    { ...defaultMixer(), channels: [base] },
    { action: 'channel', id: 'x', patch },
  );
  const c = m.channels[0] ?? base;
  const s = eqStages(c);
  return curve([...s.hpf, ...s.lpf, ...s.bands], POINTS);
}

/** A small picture of processing's EQ curve (a preset, what the desk has). */
export function ProcessingCurve({
  processing,
  width = 112,
  height = 40,
}: {
  processing: Processing;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    const vals = responseOf(processing);
    return vals
      .map((db, i) => {
        const x = (i / (POINTS - 1)) * width;
        const y = dbToY(Math.max(-RANGE, Math.min(RANGE, db)), RANGE) * height;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('');
  }, [processing, width, height]);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="shrink-0 rounded-[var(--radius-sm)] bg-[#141416] shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="rgba(255,255,255,0.12)" />
      <path
        d={path}
        fill="none"
        stroke={processing.eqOn ? 'var(--accent)' : 'var(--text-3)'}
        strokeWidth={1.75}
      />
    </svg>
  );
}
