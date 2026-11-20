/**
 * A save that can wait: typing is saved after a short pause (one save, one undo step, for a
 * burst of keys), anything else at once. `flush` saves whatever is waiting now, so a discrete
 * action or an undo never folds into (or reverts) the typing before it.
 */
export class DebouncedSave {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly save: () => Promise<void>,
    private readonly pauseMs = 500,
  ) {}

  /** A save is waiting. A method, not a field: it changes while a save is awaited. */
  isPending(): boolean {
    return this.timer !== null;
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
    await this.save();
  }
}
