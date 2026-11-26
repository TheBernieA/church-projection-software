import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CUT_SLOPES, type MixerChannel } from '@lampstand/core';
import { eqStages, SPECTRUM_BINS, SPECTRUM_FLOOR_DB, spectrumHz } from '@lampstand/renderer';
import { Typography } from '@lampstand/ui';
import { onMeters, readSpectrum } from '../../../lib/meters';
import { useStore } from '../../../lib/store';
import {
  BAND_RANGE,
  clamp,
  curve,
  dbToY,
  formatGain,
  formatHz,
  GRAPH_DB,
  HPF_RANGE,
  hzToX,
  LPF_RANGE,
  NODE_IDS,
  nodeActive,
  nodeColour,
  nodePoint,
  nodeStages,
  noteOf,
  Q_RANGE,
  roundHz,
  xToHz,
  yToDb,
  type NodeId,
} from './eqGeometry';
import { setBand, setCut, withAlpha } from './eqEdit';

const GRID_HZ = [
  30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000,
  5000, 6000, 7000, 8000, 9000, 10_000,
];
const LABEL_HZ: [number, string][] = [
  [50, '50'],
  [100, '100'],
  [200, '200'],
  [500, '500'],
  [1000, '1k'],
  [2000, '2k'],
  [5000, '5k'],
  [10_000, '10k'],
];
const GRID_DB = [-12, -6, 6, 12];

/** The spectrum's scale: 0 dBFS at the top, this much quieter at the bottom. */
const SPECTRUM_RANGE_DB = 96;
/** Tilt the spectrum up 3 dB an octave around 1 kHz, so ordinary sound looks level. */
const TILT_DB_PER_OCTAVE = 3;

const NODE_R = 8;

interface Props {
  c: MixerChannel;
  node: NodeId;
  onSelect: (n: NodeId) => void;
  disabled: boolean;
}

/** A node's number on the graph: L and H for the cuts, 1–6 for the bands. */
const nodeMark = (id: NodeId): string => (id === 'hpf' ? 'L' : id === 'lpf' ? 'H' : String(id + 1));

/**
 * The EQ as a picture to play with: the response curve over a live spectrum of the channel
 * (what goes in, faint; what comes out, brighter), and a node per band to drag. Drag sets
 * frequency and gain; Alt-drag or the wheel sets the width (a cut's slope); double-click a node
 * to flatten it (a cut: off), or the graph to put the nearest unused band there. Arrow keys move
 * the focused node (Shift: finer), [ and ] change its width.
 */
export function EqGraph({ c, node, onSelect, disabled }: Props) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 260 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<NodeId | null>(null);
  const drag = useRef<{ id: NodeId; alt: boolean; y0: number; q0: number } | null>(null);
  const { w, h } = size;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const r = e.contentRect;
      setSize({ w: Math.max(200, Math.round(r.width)), h: Math.max(120, Math.round(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The spectrum: drawn on a canvas on every animation frame while reports arrive, easing
  // towards each new reading and falling away when the sound stops.
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shown = {
      pre: new Float32Array(SPECTRUM_BINS).fill(SPECTRUM_FLOOR_DB),
      post: new Float32Array(SPECTRUM_BINS).fill(SPECTRUM_FLOOR_DB),
    };
    const tilt = Array.from(
      { length: SPECTRUM_BINS },
      (_, i) => TILT_DB_PER_OCTAVE * Math.log2(spectrumHz(i) / 1000),
    );
    const xs = Array.from({ length: SPECTRUM_BINS }, (_, i) => hzToX(spectrumHz(i)) * w);
    const yOf = (db: number): number => clamp((-db / SPECTRUM_RANGE_DB) * h, 0, h);
    const styles = getComputedStyle(cv);
    const accent = styles.getPropertyValue('--accent').trim() || '#f0a73a';
    let raf = 0;
    let lastReport = 0;
    const area = (
      vals: Float32Array,
      fill: string | CanvasGradient,
      stroke: string | null,
    ): void => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < SPECTRUM_BINS; i++) {
        const x = xs[i] ?? 0;
        const y = yOf((vals[i] ?? SPECTRUM_FLOOR_DB) + (tilt[i] ?? 0));
        if (i === 0) ctx.lineTo(0, y);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, yOf((vals[SPECTRUM_BINS - 1] ?? SPECTRUM_FLOOR_DB) + (tilt.at(-1) ?? 0)));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    const frame = (): void => {
      raf = 0;
      const s = readSpectrum('room', c.id);
      let moving = false;
      for (const key of ['pre', 'post'] as const) {
        const target = s?.[key];
        const vals = shown[key];
        for (let i = 0; i < SPECTRUM_BINS; i++) {
          const goal = target?.[i] ?? SPECTRUM_FLOOR_DB;
          const cur = vals[i] ?? SPECTRUM_FLOOR_DB;
          // Rise quickly, fall slowly, like an analyser's ballistics.
          const next = goal > cur ? cur + (goal - cur) * 0.5 : cur + (goal - cur) * 0.12;
          vals[i] = next;
          if (Math.abs(next - goal) > 0.3) moving = true;
        }
      }
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0.03)');
      area(shown.pre, grad, null);
      ctx.globalAlpha = 0.9;
      const out = ctx.createLinearGradient(0, 0, 0, h);
      out.addColorStop(0, withAlpha(accent, 0.3));
      out.addColorStop(1, withAlpha(accent, 0.04));
      area(shown.post, out, withAlpha(accent, 0.55));
      ctx.globalAlpha = 1;
      if (moving || performance.now() - lastReport < 600) raf = requestAnimationFrame(frame);
    };
    const kick = (): void => {
      lastReport = performance.now();
      raf ||= requestAnimationFrame(frame);
    };
    kick();
    const off = onMeters(kick);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [c.id, w, h]);

  const points = Math.min(400, Math.max(120, Math.round(w / 2)));
  const total = useMemo(() => {
    const s = eqStages(c);
    return curve([...s.hpf, ...s.lpf, ...s.bands], points);
  }, [c, points]);
  const own = useMemo(() => curve(nodeStages(c, node), points), [c, node, points]);

  const yPx = (db: number): number => dbToY(clamp(db, -GRAPH_DB - 2, GRAPH_DB + 2)) * h;
  const linePath = (vals: number[]): string =>
    vals
      .map(
        (db, i) => `${i ? 'L' : 'M'}${((i / (points - 1)) * w).toFixed(1)},${yPx(db).toFixed(1)}`,
      )
      .join('');
  const areaPath = (vals: number[]): string => `${linePath(vals)}L${w},${h / 2}L0,${h / 2}Z`;

  // ---- Editing ------------------------------------------------------------------------------
  // Handlers read the channel as it is now (a held key or a fast drag outruns React's renders).
  const cur = (): MixerChannel =>
    useStore.getState().live?.mixer.channels.find((x) => x.id === c.id) ?? c;
  const moveNode = (id: NodeId, hz: number, db: number, fine = false): void => {
    if (disabled) return;
    if (id === 'hpf' || id === 'lpf') {
      const [lo, hi] = id === 'hpf' ? HPF_RANGE : LPF_RANGE;
      setCut(cur(), id, { hz: roundHz(clamp(hz, lo, hi)), on: true });
      return;
    }
    const b = cur().eq.bands[id];
    if (!b) return;
    const g = Math.round(clamp(db, -GRAPH_DB, GRAPH_DB) * (fine ? 10 : 2)) / (fine ? 10 : 2);
    setBand(cur(), id, {
      hz: roundHz(clamp(hz, BAND_RANGE[0], BAND_RANGE[1])),
      ...(b.type === 'notch' ? {} : { db: g }),
      ...(b.on ? {} : { on: true }),
    });
  };
  const setQ = (id: NodeId, q: number): void => {
    if (disabled || id === 'hpf' || id === 'lpf') return;
    setBand(cur(), id, { q: Math.round(clamp(q, Q_RANGE[0], Q_RANGE[1]) * 100) / 100 });
  };
  const stepSlope = (id: 'hpf' | 'lpf', dir: number): void => {
    const now = id === 'hpf' ? cur().hpfSlope : cur().lpfSlope;
    const i = clamp(CUT_SLOPES.indexOf(now) + dir, 0, CUT_SLOPES.length - 1);
    const slope = CUT_SLOPES[i];
    if (slope && slope !== now) setCut(cur(), id, { slope });
  };
  const qOf = (id: NodeId): number => (typeof id === 'number' ? (cur().eq.bands[id]?.q ?? 1) : 1);

  const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const nodeDown = (id: NodeId) => (e: PointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(id);
    if (disabled) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id, alt: e.altKey, y0: e.clientY, q0: qOf(id) };
    setDragging(id);
  };
  const nodeMove = (e: PointerEvent<SVGGElement>): void => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    setHover(p);
    if (d.alt) {
      // Up: narrower. 120 px doubles or halves the width.
      setQ(d.id, d.q0 * Math.pow(2, (d.y0 - e.clientY) / 120));
      return;
    }
    moveNode(d.id, xToHz(p.x / w), yToDb(p.y / h), e.shiftKey);
  };
  const nodeUp = (): void => {
    drag.current = null;
    setDragging(null);
  };
  const nodeWheel = (id: NodeId) => (e: WheelEvent<SVGGElement>) => {
    if (disabled) return;
    e.stopPropagation();
    onSelect(id);
    if (id === 'hpf' || id === 'lpf') stepSlope(id, e.deltaY < 0 ? 1 : -1);
    else setQ(id, qOf(id) * Math.pow(2, (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.05 : 0.15)));
  };
  const nodeDouble = (id: NodeId) => (): void => {
    if (disabled) return;
    if (id === 'hpf' || id === 'lpf')
      setCut(cur(), id, { on: !(id === 'hpf' ? cur().hpf : cur().lpf) });
    else setBand(cur(), id, { db: 0 });
  };
  const nodeKey = (id: NodeId) => (e: KeyboardEvent<SVGGElement>) => {
    if (disabled) return;
    const { hz, db } = nodePoint(cur(), id);
    const oct = e.shiftKey ? 1 / 48 : 1 / 12;
    const g = e.shiftKey ? 0.1 : 0.5;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight')
      moveNode(id, hz * Math.pow(2, k === 'ArrowLeft' ? -oct : oct), db, true);
    else if (k === 'ArrowUp' || k === 'ArrowDown')
      moveNode(id, hz, db + (k === 'ArrowUp' ? g : -g), true);
    else if (k === '[' || k === ']') {
      if (id === 'hpf' || id === 'lpf') stepSlope(id, k === ']' ? 1 : -1);
      else setQ(id, qOf(id) * Math.pow(2, k === ']' ? 0.15 : -0.15));
    } else if (k === 'Delete' || k === 'Backspace') nodeDouble(id)();
    else return;
    e.preventDefault();
  };
  /** Double-click the graph: the nearest band not doing anything moves there. */
  const graphDouble = (e: { clientX: number; clientY: number }): void => {
    if (disabled) return;
    const p = local(e);
    const hz = xToHz(p.x / w);
    const free = ([0, 1, 2, 3, 4, 5] as const)
      .filter((i) => !nodeActive(cur(), i))
      .sort(
        (a, b) =>
          Math.abs(Math.log2((cur().eq.bands[a]?.hz ?? 1000) / hz)) -
          Math.abs(Math.log2((cur().eq.bands[b]?.hz ?? 1000) / hz)),
      )[0];
    if (free === undefined) return;
    onSelect(free);
    moveNode(free, hz, yToDb(p.y / h));
  };

  // ---- Readouts -------------------------------------------------------------------------------
  const focus = dragging ?? node;
  const fp = nodePoint(c, focus);
  const focusText =
    focus === 'hpf' || focus === 'lpf'
      ? `${formatHz(fp.hz)} · ${focus === 'hpf' ? c.hpfSlope : c.lpfSlope} dB/oct`
      : `${formatHz(fp.hz)} · ${c.eq.bands[focus]?.type === 'notch' ? t('mixer.eqw.types.notch') : formatGain(fp.db)} · Q ${qOf(focus).toFixed(2)}`;
  const hoverHz = hover ? xToHz(hover.x / w) : null;
  const ordered = [...NODE_IDS].sort((a, b) => (a === node ? 1 : b === node ? -1 : 0));

  return (
    <div
      ref={box}
      className="relative h-full min-h-0 w-full select-none overflow-hidden rounded-[var(--radius-lg)] bg-[#141416] shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
      onPointerMove={(e) => !drag.current && setHover(local(e))}
      onPointerLeave={() => !drag.current && setHover(null)}
      onDoubleClick={graphDouble}
    >
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="group"
        aria-label={t('mixer.eqw.graph', { name: c.name })}
        className="absolute inset-0"
      >
        {/* Grid: decades stronger, dB every 6. */}
        {GRID_HZ.map((f) => (
          <line
            key={f}
            x1={hzToX(f) * w}
            x2={hzToX(f) * w}
            y1={0}
            y2={h}
            stroke={
              f === 100 || f === 1000 || f === 10_000
                ? 'rgba(255,255,255,0.09)'
                : 'rgba(255,255,255,0.035)'
            }
          />
        ))}
        {GRID_DB.map((db) => (
          <line key={db} x1={0} x2={w} y1={yPx(db)} y2={yPx(db)} stroke="rgba(255,255,255,0.045)" />
        ))}
        <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="rgba(255,255,255,0.16)" />
        {LABEL_HZ.map(([f, label]) => (
          <text
            key={f}
            x={hzToX(f) * w + 4}
            y={h - 6}
            fontSize={10}
            fill="rgba(255,255,255,0.38)"
            fontFamily="var(--font-ui)"
          >
            {label}
          </text>
        ))}
        {[...GRID_DB, 0].map((db) => (
          <text
            key={db}
            x={w - 6}
            y={yPx(db) - 3}
            fontSize={10}
            textAnchor="end"
            fill="rgba(255,255,255,0.38)"
            fontFamily="var(--font-ui)"
          >
            {db > 0 ? `+${db}` : db}
          </text>
        ))}

        {/* The focused node's own part of the curve, then the whole curve. */}
        <path d={areaPath(own)} fill={nodeColour(focus)} opacity={0.16} />
        <path
          d={linePath(own)}
          fill="none"
          stroke={nodeColour(focus)}
          strokeWidth={1.25}
          opacity={0.7}
        />
        <path
          d={areaPath(total)}
          fill="var(--accent)"
          opacity={c.eq.on || c.hpf || c.lpf ? 0.1 : 0.04}
        />
        <path
          d={linePath(total)}
          fill="none"
          stroke="var(--text-1)"
          strokeWidth={2.25}
          strokeLinejoin="round"
          opacity={c.eq.on || c.hpf || c.lpf ? 0.95 : 0.4}
        />

        {/* Where the pointer is: frequency line. */}
        {hover && hoverHz !== null && !dragging && (
          <line x1={hover.x} x2={hover.x} y1={0} y2={h} stroke="rgba(255,255,255,0.12)" />
        )}

        {/* Nodes (the selected one last, so it's on top). */}
        {ordered.map((id) => {
          const p = nodePoint(c, id);
          const x = hzToX(p.hz) * w;
          const y = yPx(p.db);
          const active = nodeActive(c, id);
          const selected = id === node;
          const colour = nodeColour(id);
          const label =
            id === 'hpf'
              ? t('mixer.eqw.lowCut')
              : id === 'lpf'
                ? t('mixer.eqw.highCut')
                : t('mixer.eqw.band', { n: id + 1 });
          return (
            <g
              key={String(id)}
              role="slider"
              tabIndex={0}
              aria-label={label}
              aria-valuetext={
                id === 'hpf' || id === 'lpf'
                  ? `${formatHz(p.hz)}${active ? '' : `, ${t('mixer.eqw.off')}`}`
                  : `${formatHz(p.hz)}, ${formatGain(p.db)}`
              }
              aria-valuemin={20}
              aria-valuemax={20_000}
              aria-valuenow={Math.round(p.hz)}
              aria-disabled={disabled || undefined}
              className="cursor-grab outline-none active:cursor-grabbing [&:focus-visible>circle:first-child]:stroke-[var(--accent)]"
              onPointerDown={nodeDown(id)}
              onPointerMove={nodeMove}
              onPointerUp={nodeUp}
              onPointerCancel={nodeUp}
              onWheel={nodeWheel(id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                nodeDouble(id)();
              }}
              onKeyDown={nodeKey(id)}
              onFocus={() => onSelect(id)}
            >
              {/* A bigger, invisible target for the pointer. */}
              <circle
                cx={x}
                cy={y}
                r={NODE_R + 8}
                fill="transparent"
                stroke="transparent"
                strokeWidth={2}
              />
              {selected && (
                <circle
                  cx={x}
                  cy={y}
                  r={NODE_R + 5}
                  fill="none"
                  stroke={colour}
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={NODE_R}
                fill={active ? colour : '#1c1c1e'}
                stroke={colour}
                strokeWidth={active ? 0 : 1.5}
                opacity={active || selected ? 1 : 0.75}
              />
              <text
                x={x}
                y={y + 3.5}
                fontSize={10}
                fontWeight={700}
                textAnchor="middle"
                fill={active ? '#16161a' : colour}
                fontFamily="var(--font-ui)"
                pointerEvents="none"
              >
                {nodeMark(id)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Readouts: the focused node (top left), the pointer (top right). */}
      <div className="pointer-events-none absolute left-2.5 top-2 flex items-center gap-2 rounded-[var(--radius-sm)] bg-black/45 px-2 py-1">
        <span className="size-2 rounded-full" style={{ background: nodeColour(focus) }} />
        <Typography size={11} weight="semibold" tone="primary" tabular>
          {focusText}
        </Typography>
      </div>
      {hover && hoverHz !== null && (
        <div className="pointer-events-none absolute right-2.5 top-2 rounded-[var(--radius-sm)] bg-black/45 px-2 py-1">
          <Typography size={11} tone="secondary" tabular>
            {`${formatHz(hoverHz)} · ${noteOf(hoverHz)} · ${formatGain(yToDb(hover.y / h))}`}
          </Typography>
        </div>
      )}
      {!c.eq.on && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-[var(--radius-sm)] bg-black/55 px-2.5 py-1">
          <Typography size={11} weight="semibold" tone="secondary" caps>
            {t('mixer.eqw.bypassed')}
          </Typography>
        </div>
      )}
    </div>
  );
}
