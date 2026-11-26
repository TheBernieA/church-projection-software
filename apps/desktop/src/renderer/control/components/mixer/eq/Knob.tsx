import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Typography } from '@lampstand/ui';

/** The knob turns through 270°, from 7:30 to 4:30. */
const SWEEP = 270;
const START = 135;

export interface KnobProps {
  label: string;
  /** The knob's position, 0…1 (a frequency knob maps its value on a log scale). */
  pos: number;
  /** Turned to a new position (0…1). */
  onPos: (pos: number) => void;
  /** Its value as people read it ("1.2 kHz", "+3 dB"). */
  text: string;
  /** Double-click: back to its default. */
  onReset?: () => void;
  /** The arc grows from the middle (gain) rather than from the start. */
  bipolar?: boolean;
  colour?: string;
  disabled?: boolean;
  size?: number;
  /** Keyboard and wheel steps as a fraction of the travel (fine with Shift). */
  step?: number;
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  if (Math.abs(to - from) < 0.01) return '';
  const [a, b] = from < to ? [from, to] : [to, from];
  const [x1, y1] = polar(cx, cy, r, a);
  const [x2, y2] = polar(cx, cy, r, b);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * A rotary control, like a desk's: drag up or down (Shift for fine), scroll, or use the arrow
 * keys; double-click to reset. The value is written under it.
 */
export function Knob({
  label,
  pos,
  onPos,
  text,
  onReset,
  bipolar = false,
  colour = 'var(--accent)',
  disabled = false,
  size = 46,
  step = 0.01,
}: KnobProps) {
  const drag = useRef<{ y: number; pos: number } | null>(null);
  const p = clamp01(pos);
  const c = size / 2;
  const r = c - 4;
  const angle = START + p * SWEEP;
  const from = bipolar ? START + SWEEP / 2 : START;
  const [tx, ty] = polar(c, c, r - 7, angle);
  const [ix, iy] = polar(c, c, r - 13, angle);

  const set = (next: number): void => {
    const v = clamp01(next);
    if (Math.abs(v - p) > 1e-6) onPos(v);
  };
  const down = (e: PointerEvent<HTMLDivElement>): void => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { y: e.clientY, pos: p };
  };
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    // 180 px for the whole travel; Shift for a tenth of that.
    const travel = e.shiftKey ? 1800 : 180;
    set(d.pos + (d.y - e.clientY) / travel);
  };
  const up = (): void => {
    drag.current = null;
  };
  const wheel = (e: WheelEvent<HTMLDivElement>): void => {
    if (disabled) return;
    set(p - Math.sign(e.deltaY) * step * (e.shiftKey ? 0.25 : 1));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const fine = e.shiftKey ? 0.25 : 1;
    const moves: Record<string, number> = {
      ArrowUp: step * fine,
      ArrowRight: step * fine,
      ArrowDown: -step * fine,
      ArrowLeft: -step * fine,
      PageUp: step * 10,
      PageDown: -step * 10,
    };
    if (e.key in moves) set(p + (moves[e.key] ?? 0));
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(1);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && onReset) onReset();
    else return;
    e.preventDefault();
  };

  return (
    <div className={`flex flex-col items-center gap-0.5 ${disabled ? 'opacity-45' : ''}`}>
      <Typography size={10} weight="semibold" tone="muted" caps>
        {label}
      </Typography>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        title={onReset ? `${label}: ${text} (double-click to reset)` : `${label}: ${text}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={wheel}
        onKeyDown={key}
        onDoubleClick={() => !disabled && onReset?.()}
        className="cursor-ns-resize touch-none rounded-full focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          {/* Track, then the value's arc. */}
          <path
            d={arc(c, c, r, START, START + SWEEP)}
            fill="none"
            stroke="var(--surface-0)"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <path
            d={arc(c, c, r, from, angle)}
            fill="none"
            stroke={colour}
            strokeWidth={4}
            strokeLinecap="round"
          />
          {/* The cap: a raised disc with a pointer. */}
          <circle cx={c} cy={c} r={r - 5} fill="var(--surface-4)" />
          <circle
            cx={c}
            cy={c}
            r={r - 5}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
          <line
            x1={ix}
            y1={iy}
            x2={tx}
            y2={ty}
            stroke="var(--text-1)"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <Typography size={11} tabular tone="secondary" className="whitespace-nowrap">
        {text}
      </Typography>
    </div>
  );
}
