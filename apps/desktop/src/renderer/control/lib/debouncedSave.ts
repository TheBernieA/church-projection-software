/**
 * A save that can wait: typing is saved after a short pause (one save, one undo step, for a
 * burst of keys), anything else at once. `flush` saves whatever is waiting now, so a discrete
 * action or an undo never folds into (or reverts) the typing before it.
 */
export class DebouncedSave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Saves sent and not yet answered. */
  private saving = 0;

  constructor(
    private readonly save: () => Promise<void>,
    private readonly pauseMs = 500,
  ) {}

  /** A save is waiting. A method, not a field: it changes while a save is awaited. */
  isPending(): boolean {
    return this.timer !== null;
  }

  /**
   * A save is waiting or still on its way. Until it lands, a copy read from disk may be older
   * than what's on screen, so it mustn't replace it.
   */
  isBusy(): boolean {
    return this.timer !== null || this.saving > 0;
  }

  schedule(typing: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), typing ? this.pauseMs : 0);
  }

  /** Save now if anything is waiting (nothing waiting: nothing saved, no empty undo step). */
  async flush(): Promise<void> {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.saving += 1;
    try {
      await this.save();
    } finally {
      this.saving -= 1;
    }
  }
}
