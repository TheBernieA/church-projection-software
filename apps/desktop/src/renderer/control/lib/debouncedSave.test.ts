import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebouncedSave } from './debouncedSave';

describe('DebouncedSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves typing once after a pause, and other edits at once', async () => {
    const save = vi.fn(() => Promise.resolve());
    const d = new DebouncedSave(save, 500);
    d.schedule(true);
    d.schedule(true);
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    d.schedule(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('is busy while a save is waiting or on its way', async () => {
    let land = (): void => undefined;
    const d = new DebouncedSave(() => new Promise<void>((r) => (land = r)));
    d.schedule(true);
    expect(d.isBusy()).toBe(true);
    const saving = d.flush();
    expect(d.isPending()).toBe(false);
    expect(d.isBusy()).toBe(true);
    land();
    await saving;
    expect(d.isBusy()).toBe(false);
  });

  it('flushes what is waiting, and nothing when nothing is', async () => {
    const save = vi.fn(() => Promise.resolve());
    const d = new DebouncedSave(save);
    await d.flush();
    expect(save).not.toHaveBeenCalled();
    d.schedule(true);
    expect(d.isPending()).toBe(true);
    await d.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(d.isPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
