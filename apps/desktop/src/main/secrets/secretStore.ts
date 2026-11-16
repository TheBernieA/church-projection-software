import { safeStorage } from 'electron';
import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from '../storage/atomic';

/**
 * Secrets (stream keys, remote PIN hash) via OS keychain/DPAPI (§6.4, §17.5). Never in
 * settings.json, never logged, never sent to a renderer. Stream keys live here.
 */
export class SecretStore {
  constructor(private readonly file: string) {}

  available(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable();
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  async set(name: string, value: string): Promise<void> {
    if (!(await this.available())) throw new Error('Secure storage unavailable');
    const all = await this.readAll();
    all[name] = (await safeStorage.encryptStringAsync(value)).toString('base64');
    await writeJsonAtomic(this.file, all);
  }

  async has(name: string): Promise<boolean> {
    return (await this.readAll())[name] !== undefined;
  }

  async delete(name: string): Promise<void> {
    const all = await this.readAll();
    if (!(name in all)) return;
    await writeJsonAtomic(
      this.file,
      Object.fromEntries(Object.entries(all).filter(([k]) => k !== name)),
    );
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
