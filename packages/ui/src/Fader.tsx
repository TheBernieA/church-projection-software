import { Typography } from './Typography';
import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';

/**
 * Console-style fader travel: the bottom 45% covers −∞…−20 dB, the rest −20…+12 dB, so the
 * useful range (around 0 dB, three-quarters of the way up) gets most of the throw.
 */
export function dbToTravel(db: number, min = -60, max = 12): number {
  if (db <= min) return 0;
  if (db >= max) return 1;
  if (db < -20) return ((db - min) / (-20 - min)) * 0.45;
  return 0.45 + ((db + 20) / (max + 20)) * 0.55;
}
export function travelToDb(t: number, min = -60, max = 12): number {
  const x = Math.min(1, Math.max(0, t));
  const db = x < 0.45 ? min + (x / 0.45) * (-20 - min) : -20 + ((x - 0.45) / 0.55) * (max + 20);
  return Math.round(db * 2) / 2; // half-dB steps
}

const MARKS = [12, 0, -10, -20, -40, -60];

export interface FaderProps {
  /** Level in dB (`min` and below is off). */
  value: number;
  onChange: (db: number) => void;
  /** Accessible name ("Pulpit mic level"). */
  label: string;
  /** Spoken / shown value ("−6.0 dB"). */
  format: (db: number) => string;
  min?: number;
  max?: number;
  /** Scale numbers beside the track. */
  scale?: boolean;
  /** Shown but not movable (a locked channel). */
  disabled?: boolean;
  className?: string;
}

/**
 * A vertical mixing-desk fader: drag the cap, click the track to jump, double-click for 0 dB,
 * arrows nudge (Shift for bigger steps). A wheel only moves it with ⌥/Alt held, so scrolling
 * the mixer never changes a level.
 */
export function Fader({
  value,
  onChange,
  label,
  format,
  min = -60,
  max = 12,
  scale = true,
  disabled = false,
  className = '',
}: FaderProps) {
  const track = useRef<HTMLDivElement>(null);
  const at = dbToTravel(value, min, max);
  const fromPointer = (e: PointerEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    onChange(travelToDb(1 - (e.clientY - r.top) / r.height, min, max));
  };
  const nudge = (steps: number): void => {
    if (disabled) return;
    const base = value <= min ? -40 : value;
    onChange(Math.min(max, Math.max(min, base + steps)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const big = e.shiftKey ? 6 : 1;
    const step = { ArrowUp: big, ArrowRight: big, ArrowDown: -big, ArrowLeft: -big }[e.key];
    if (step) {
      e.preventDefault();
      nudge(step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(max);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === '0') {
      e.preventDefault();
      onChange(0);
    }
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    if (!e.altKey) return;
    nudge(e.deltaY < 0 ? 1 : -1);
  };
  return (
    <div className={`flex h-full min-h-0 gap-1.5 ${className}`}>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.max(min, value)}
        aria-valuetext={format(value)}
        title={format(value)}
        onKeyDown={onKey}
        onWheel={onWheel}
        aria-disabled={disabled || undefined}
        onDoubleClick={() => !disabled && onChange(0)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        className={`group relative w-7 touch-none rounded-[6px] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-ns-resize'}`}
      >
        <span className="absolute inset-y-1.5 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]" />
        <span
          className="absolute bottom-1.5 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-[var(--accent)] opacity-70"
          style={{ height: `calc((100% - 12px) * ${at})` }}
        />
        {/* The cap: a ridged handle like a desk's. */}
        <span
          className="absolute left-1/2 flex h-[30px] w-[26px] -translate-x-1/2 translate-y-1/2 flex-col items-center justify-center gap-[3px] rounded-[4px] bg-[linear-gradient(#5b5f69,#3b3e46)] shadow-[0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] transition-[filter] group-hover:brightness-110"
          style={{ bottom: `calc(6px + (100% - 12px) * ${at})` }}
        >
          <span className="h-px w-4 bg-black/40" />
          <span className="h-[2px] w-[18px] rounded bg-white/85" />
          <span className="h-px w-4 bg-black/40" />
        </span>
      </div>
      {scale && (
        <div aria-hidden className="relative w-5">
          {MARKS.filter((m) => m >= min && m <= max).map((m) => (
            <Typography
              key={m}
              size={10}
              leading="none"
              tabular
              tone={m === 0 ? 'primary' : 'muted'}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `calc(6px + (100% - 12px) * ${dbToTravel(m, min, max)})` }}
            >
              {m === min ? '∞' : m > 0 ? `+${m}` : m}
            </Typography>
          ))}
        </div>
      )}
    </div>
  );
}
