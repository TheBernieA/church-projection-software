/**
 * Binary-search the largest font size in [min, max] for which `fits(size)` is true (§7.2).
 * `fits` must be monotonic (smaller sizes never fit worse). Returns `min` if nothing fits.
 * Resolution is 1px — enough for projection and keeps measurement count ≈ log2(range).
 */
export function fitFontSize(min: number, max: number, fits: (size: number) => boolean): number {
  let lo = Math.floor(min);
  let hi = Math.floor(max);
  if (hi <= lo) return lo;
  if (fits(hi)) return hi;
  let best = lo;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Small LRU-ish cache for fitted sizes keyed by (text, theme, box). */
export class FitCache {
  private map = new Map<string, number>();
  constructor(private readonly limit = 500) {}
  get(key: string): number | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  clear(): void {
    this.map.clear();
  }
  set(key: string, size: number): void {
    this.map.set(key, size);
    if (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }
}
