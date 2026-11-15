import { safeStorage } from 'electron';
import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from '../storage/atomic';

/**
 * Secrets (stream keys, remote PIN hash) via OS keychain/DPAPI (§6.4, §17.5). Never in
 * settings.json, never logged. Used by streaming/remote in later phases.
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
