import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type Level, type Logger } from '../types';
import { LOG_MAX_BYTES, LOG_MAX_FILES } from '../constants';

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(rtmps?:\/\/[^\s"']+\/)[^\s"'/]+/gi, '$1[redacted]'], // stream keys at the end of RTMP URLs
  [/\b(key|token|secret|password|pin|streamkey)(["'\s:=]+)[^\s"',}]+/gi, '$1$2[redacted]'],
  [/\/\/[^/\s:@]+:[^/\s@]+@/g, '//[redacted]@'], // credentials in URLs
  [/\b(streamid|passphrase)=[^\s&"']+/gi, '$1=[redacted]'], // SRT keys and passwords
];

/** Redact secrets from any log line (§17.5). */
export function scrub(text: string): string {
  return SECRET_PATTERNS.reduce((t, [re, replacement]) => t.replace(re, replacement), text);
}

/** Structured JSON-lines logger with rotation (5 × 5 MB) and a secret scrubber. */
export function createLogger(dir: string, module = 'app'): Logger {
  const file = join(dir, 'lampstand.log');
  let chain: Promise<void> = mkdir(dir, { recursive: true }).then(
    () => undefined,
    () => undefined,
  );

  /** The log file's size, kept as lines are added (one stat to begin with). */
  let size: number | null = null;
  const rotate = async (): Promise<void> => {
    size ??= await stat(file).then(
      (s) => s.size,
      () => 0,
    );
    if (size < LOG_MAX_BYTES) return;
    size = 0;
    await rm(join(dir, `lampstand.${LOG_MAX_FILES - 1}.log`), { force: true });
    for (let i = LOG_MAX_FILES - 2; i >= 1; i--)
      await rename(join(dir, `lampstand.${i}.log`), join(dir, `lampstand.${i + 1}.log`)).catch(
        () => undefined,
      );
    await rename(file, join(dir, 'lampstand.1.log')).catch(() => undefined);
  };

  const make = (mod: string): Logger => {
    const write = (level: Level, msg: string, data?: Record<string, unknown>): void => {
      const line =
        scrub(JSON.stringify({ t: new Date().toISOString(), level, mod, msg, ...data })) + '\n';
      if (process.env.NODE_ENV !== 'production' || level === 'error') process.stdout.write(line);
      chain = chain
        .then(rotate)
        .then(() => appendFile(file, line))
        .then(() => {
          size = (size ?? 0) + Buffer.byteLength(line);
        })
        .catch(() => undefined);
    };
    return {
      debug: (m, d) => write('debug', m, d),
      info: (m, d) => write('info', m, d),
      warn: (m, d) => write('warn', m, d),
      error: (m, d) => write('error', m, d),
      child: (m) => make(`${mod}.${m}`),
    };
  };
  return make(module);
}

/** Logger for tests/pure modules. */
export const nullLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => nullLogger,
};
