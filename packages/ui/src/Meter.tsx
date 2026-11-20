import { useEffect, useRef } from 'react';

/** dBFS for a linear level (silence is −∞). */
const toDb = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);
/** Position on the meter, 0…1, for −60…0 dBFS (and a little headroom above for clips). */
const meterPos = (db: number): number => Math.min(1, Math.max(0, (db + 60) / 60));

export interface MeterProps {
  /** Current [peak, rms] (linear). Read every frame while something new has arrived. */
  read: () => [number, number];
  /** Called when new levels arrive; returns an unsubscribe. */
  subscribe: (onChange: () => void) => () => void;
  label: string;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * A broadcast-style level meter: green to −18 dBFS, amber to −6, red above, with the RMS body,
 * the peak as a thin bright line and a peak hold that falls back after a second. Draws straight
 * to the page on each animation frame (never through React).
 */
export function Meter({
  read,
  subscribe,
  label,
  orientation = 'vertical',
  className = '',
}: MeterProps) {
  const root = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLSpanElement>(null);
  const peakLine = useRef<HTMLSpanElement>(null);
  const holdLine = useRef<HTMLSpanElement>(null);
  const vertical = orientation === 'vertical';

  useEffect(() => {
    let raf = 0;
    let shownPeak = 0;
    let shownRms = 0;
    let hold = 0;
    let holdAt = 0;
    let lastAria = '';
    const place = (el: HTMLElement | null, p: number): void => {
      if (!el) return;
      if (vertical) el.style.bottom = `${p * 100}%`;
      else el.style.left = `${p * 100}%`;
    };
    const frame = (): void => {
      raf = 0;
      const [peak, rms] = read();
      const now = performance.now();
      // Fast attack, gentle release, like a desk's meters.
      const pp = meterPos(toDb(peak));
      const pr = meterPos(toDb(rms * 1.414));
      shownPeak = pp > shownPeak ? pp : Math.max(pp, shownPeak - 0.025);
      shownRms = pr > shownRms ? pr : Math.max(pr, shownRms - 0.02);
      if (pp >= hold || now - holdAt > 1200) {
        hold = pp;
        holdAt = now;
      }
      const c = cover.current;
      if (c) {
        if (vertical) c.style.height = `${(1 - shownRms) * 100}%`;
        else c.style.width = `${(1 - shownRms) * 100}%`;
      }
      place(peakLine.current, shownPeak);
      place(holdLine.current, hold);
      if (holdLine.current) holdLine.current.style.opacity = hold > 0.01 ? '1' : '0';
      if (peakLine.current) peakLine.current.style.opacity = shownPeak > 0.01 ? '1' : '0';
      const aria = String(Math.round(shownPeak * 60 - 60));
      if (aria !== lastAria && root.current) {
        root.current.setAttribute('aria-valuenow', aria);
        lastAria = aria;
      }
      // Keep falling back to rest after the last report.
      if (shownPeak > 0 || shownRms > 0 || hold > 0) raf = requestAnimationFrame(frame);
    };
    const kick = (): void => {
      raf ||= requestAnimationFrame(frame);
    };
    kick();
    const off = subscribe(kick);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [read, subscribe, vertical]);

  const line = vertical
    ? 'left-0 right-0 h-[2px] translate-y-1/2'
    : 'top-0 bottom-0 w-[2px] -translate-x-1/2';
  return (
    <div
      ref={root}
      role="meter"
      aria-label={label}
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={-60}
      className={`relative overflow-hidden rounded-[2px] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)] ${vertical ? 'w-1.5' : 'h-1.5'} ${className}`}
    >
      <span
        className="absolute inset-0"
        style={{
          background: `linear-gradient(${vertical ? 'to top' : 'to right'}, #2fbf71 0%, #2fbf71 70%, #e8b04b 70%, #e8b04b 90%, #e5484d 90%)`,
        }}
      />
      <span
        ref={cover}
        className={`absolute bg-[var(--surface-0)] ${vertical ? 'inset-x-0 top-0 h-full' : 'inset-y-0 right-0 w-full'}`}
      />
      <span ref={peakLine} className={`absolute bg-white/80 opacity-0 ${line}`} />
      <span ref={holdLine} className={`absolute bg-[#ffd27a] opacity-0 ${line}`} />
    </div>
  );
}
