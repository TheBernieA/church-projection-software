import { AppError, SettingsSchema, defaultSettings, type Settings } from '@lampstand/core';
import { quarantine, readJson, writeJsonAtomic } from './atomic';
import type { Logger } from '../types';
import { errorMessage } from '../utils';

/** settings.json: validated with defaults; unknown keys preserved (§6.4). Never holds secrets. */
export class SettingsStore {
  private value: Settings = defaultSettings();
  private listeners = new Set<(s: Settings) => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string,
    private readonly root: string,
    private readonly log: Logger,
  ) {}

  async load(): Promise<Settings> {
    const res = await readJson(this.file, SettingsSchema);
    if (res.status === 'ok') this.value = res.value;
    else if (res.status === 'invalid') {
      this.log.warn('settings invalid, using defaults', { reason: res.reason });
      await quarantine(this.file, this.root).catch(() => undefined);
    }
    return this.value;
  }

  get(): Settings {
    return this.value;
  }

  /**
   * Merge a partial update and validate the *result*. Only the keys present in `patch` change;
   * anything invalid throws (as a safe AppError) and leaves settings untouched.
   */
  update(patch: Partial<Settings> | Record<string, unknown>): Settings {
    const merged = SettingsSchema.safeParse({ ...this.value, ...patch });
    if (!merged.success) throw new AppError('invalid-settings', 'That setting value is not valid.');
    this.value = merged.data;
    for (const l of this.listeners) l(this.value);
    this.scheduleSave();
    return this.value;
  }

  onChange(l: (s: Settings) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Debounced autosave (500 ms) — §6.2. */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 500);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await writeJsonAtomic(this.file, this.value).catch((e: unknown) =>
      this.log.error('settings save failed', { err: errorMessage(e) }),
    );
  }
}
