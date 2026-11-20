import { safeStorage } from 'electron';
import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from '../storage/atomic';

/**
 * Secrets (stream keys, remote PIN hash) via OS keychain/DPAPI (§6.4, §17.5). Never in
 * settings.json, never logged, never sent to a renderer. Stream keys live here.
 */
export class SecretStore {
  /** Changes run one at a time, so two at once can't lose one. */
  private changes: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private change(fn: () => Promise<void>): Promise<void> {
    const next = this.changes.catch(() => undefined).then(fn);
    this.changes = next;
    return next;
  }

  available(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable();
  }

  /**
   * Every secret. A missing file is none; an unreadable one is none for reading, but an error
   * when changing it (so one new key never overwrites all the others).
   */
  private async readAll(forChange = false): Promise<Record<string, string>> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      if (raw && typeof raw === 'object') return raw as Record<string, string>;
      if (forChange) throw new Error('Secrets file is not an object');
      return {};
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' || !forChange) return {};
      throw e;
    }
  }

  set(name: string, value: string): Promise<void> {
    return this.change(async () => {
      if (!(await this.available())) throw new Error('Secure storage unavailable');
      const all = await this.readAll(true);
      all[name] = (await safeStorage.encryptStringAsync(value)).toString('base64');
      await writeJsonAtomic(this.file, all);
    });
  }

  /** The names of every secret saved (one read). */
  async names(): Promise<Set<string>> {
    return new Set(Object.keys(await this.readAll()));
  }

  async has(name: string): Promise<boolean> {
    return (await this.readAll())[name] !== undefined;
  }

  delete(name: string): Promise<void> {
    return this.change(async () => {
      const all = await this.readAll(true);
      if (!(name in all)) return;
      await writeJsonAtomic(
        this.file,
        Object.fromEntries(Object.entries(all).filter(([k]) => k !== name)),
      );
    });
  }

  async get(name: string): Promise<string | null> {
    const enc = (await this.readAll())[name];
    if (!enc || !(await this.available())) return null;
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
        Buffer.from(enc, 'base64'),
      );
      if (shouldReEncrypt) await this.set(name, result);
      return result;
    } catch {
      return null;
    }
  }
}
