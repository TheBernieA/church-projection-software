/** After the voice stops, stay down this long (no pumping between words). */
export const DUCK_HOLD_MS = 600;
/** Time constants of the dip and the recovery (s): down quickly, back up gently. */
export const DUCK_DOWN_SEC = 0.04;
export const DUCK_UP_SEC = 0.4;

/**
 * Whether a ducking channel should be down: a voice above its threshold now, or within the hold
 * since one was. Fed the loudest triggering voice (dBFS peak) at each check.
 */
export class DuckFollower {
  private lastVoice = -Infinity;

  next(voiceDb: number, thresholdDb: number, now: number): boolean {
    if (voiceDb >= thresholdDb) this.lastVoice = now;
    return now - this.lastVoice < DUCK_HOLD_MS;
  }
}
