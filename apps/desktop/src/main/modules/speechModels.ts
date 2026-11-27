import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '@lampstand/core';
import type { SpeechModelState, SpeechModelStatus } from '@lampstand/ipc-contract';
import { writeJsonAtomic } from '../storage/atomic';
import type { Logger } from '../types';

/**
 * Speech models for listening (BUILD_SPEC §10.4, ADR 0008): downloaded once on request, pinned
 * to a commit, every file checked against its SHA-256, kept in `userData/models/<id>/` and
 * served to the control window as `lampstand-media://speech/<id>/<file>` (only files listed
 * here). Nothing is bundled and nothing is fetched unless the operator asks.
 */

export interface ModelFile {
  /** Path inside the model folder, as the speech engine asks for it. */
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface SpeechModel {
  readonly id: string;
  readonly repo: string;
  readonly revision: string;
  readonly files: readonly ModelFile[];
}

const SMALL_FILES = (config: string, generation: [number, string]): ModelFile[] => [
  { path: 'config.json', size: 2197, sha256: config },
  { path: 'generation_config.json', size: generation[0], sha256: generation[1] },
  {
    path: 'preprocessor_config.json',
    size: 339,
    sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d',
  },
  {
    path: 'tokenizer.json',
    size: 2405679,
    sha256: '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0',
  },
  {
    path: 'tokenizer_config.json',
    size: 282662,
    sha256: '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c',
  },
];

/** English Whisper, 8-bit: `base` (better, ~78 MB) and `tiny` (faster, ~44 MB). */
export const SPEECH_MODELS: readonly SpeechModel[] = [
  {
    id: 'whisper-base.en',
    repo: 'onnx-community/whisper-base.en',
    revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe',
    files: [
      ...SMALL_FILES('c8a0de5ed8a083565a4319db29d0c210fda35b4d6076c2d711cae53ae00f3cb1', [
        1556,
        '3479b1f44a07e41db799e22599222fee5816738036def94a39841cb9cdbb4120',
      ]),
      {
        path: 'onnx/encoder_model_quantized.onnx',
        size: 23201320,
        sha256: '6e8001198c490bbae018c0044f630c2915efb826bad957006ce36152d0ab2a10',
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        size: 53692803,
        sha256: 'dd4761a3f7add26afda3512abff4706920404c2517e85a9f2ff090b0c0987909',
      },
    ],
  },
  {
    id: 'whisper-tiny.en',
    repo: 'onnx-community/whisper-tiny.en',
    revision: '794207fec2761281fe63a23a94b7e9f53a4efbc1',
    files: [
      ...SMALL_FILES('251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233', [
        1646,
        '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9',
      ]),
      {
        path: 'onnx/encoder_model_quantized.onnx',
        size: 10124993,
        sha256: 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25',
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        size: 30718858,
        sha256: 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52',
      },
    ],
  },
];

export type SpeechModelId = (typeof SPEECH_MODELS)[number]['id'];

export const modelSize = (m: SpeechModel): number => m.files.reduce((n, f) => n + f.size, 0);

export type ModelState = SpeechModelState;
export type ModelStatus = SpeechModelStatus;

type Fetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}>;

interface Options {
  /** `userData/models`. */
  readonly dir: string;
  readonly fetch: Fetch;
  readonly log: Logger;
  /** Called on every change of a model's state (throttled by the caller if needed). */
  readonly onChange: (status: ModelStatus) => void;
  readonly models?: readonly SpeechModel[];
  readonly host?: string;
}

/** Written last, once every file checked out: a folder without it is not a model. */
const MARKER = 'lampstand-model.json';
/** A stalled download gives up after this long without a byte. */
const STALL_MS = 60_000;

export class SpeechModels {
  private readonly models: readonly SpeechModel[];
  private readonly host: string;
  private readonly states = new Map<string, ModelState>();
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly o: Options) {
    this.models = o.models ?? SPEECH_MODELS;
    this.host = o.host ?? 'https://huggingface.co';
  }

  find(id: string): SpeechModel | undefined {
    return this.models.find((m) => m.id === id);
  }

  private folder(m: SpeechModel): string {
    return join(this.o.dir, m.id);
  }

  private set(m: SpeechModel, state: ModelState): void {
    this.states.set(m.id, state);
    this.o.onChange({ id: m.id, bytes: modelSize(m), state });
  }

  private async installed(m: SpeechModel): Promise<boolean> {
    try {
      const marker = JSON.parse(await readFile(join(this.folder(m), MARKER), 'utf8')) as {
        revision?: unknown;
      };
      return marker.revision === m.revision;
    } catch {
      return false;
    }
  }

  async status(): Promise<ModelStatus[]> {
    return Promise.all(
      this.models.map(async (m) => {
        let state = this.states.get(m.id);
        if (!state || state.kind === 'ready' || state.kind === 'missing')
          state = (await this.installed(m)) ? { kind: 'ready' } : { kind: 'missing' };
        return { id: m.id, bytes: modelSize(m), state };
      }),
    );
  }

  /**
   * The file a `lampstand-media://speech/<id>/<path>` request may read, or null: only files of
   * a model that finished installing, and only the ones it lists.
   */
  async fileFor(urlPath: string): Promise<{ root: string; rel: string } | null> {
    const slash = urlPath.indexOf('/');
    if (slash < 0) return null;
    const m = this.find(urlPath.slice(0, slash));
    const rel = urlPath.slice(slash + 1);
    if (!m || !m.files.some((f) => f.path === rel) || !(await this.installed(m))) return null;
    return { root: this.folder(m), rel };
  }

  /** Download and check a model. Resolves when it's ready; a second call joins the first. */
  async download(id: string): Promise<void> {
    const m = this.find(id);
    if (!m) throw new AppError('speech-model-unknown', 'There is no such speech model.');
    if (this.running.has(id) || (await this.installed(m))) return;
    const abort = new AbortController();
    this.running.set(id, abort);
    const total = modelSize(m);
    let received = 0;
    let lastReport = 0;
    const report = (force = false): void => {
      const now = Date.now();
      if (!force && now - lastReport < 250) return;
      lastReport = now;
      this.set(m, { kind: 'downloading', received, total });
    };
    report(true);
    const folder = this.folder(m);
    const partial = `${folder}.partial`;
    this.o.log.info('speech model download', { id, bytes: total });
    try {
      await rm(partial, { recursive: true, force: true });
      for (const f of m.files) {
        const dest = join(partial, f.path);
        await mkdir(dirname(dest), { recursive: true });
        await this.fetchFile(m, f, dest, abort.signal, (n) => {
          received += n;
          report();
        });
      }
      await writeJsonAtomic(join(partial, MARKER), { id: m.id, revision: m.revision });
      await rm(folder, { recursive: true, force: true });
      await rename(partial, folder);
      this.o.log.info('speech model ready', { id });
      this.set(m, { kind: 'ready' });
    } catch (e) {
      await rm(partial, { recursive: true, force: true }).catch(() => undefined);
      const cancelled = abort.signal.aborted;
      const err =
        e instanceof AppError
          ? e
          : new AppError(
              'speech-model-download',
              'The speech model couldn’t be downloaded. Check the internet connection and try again.',
            );
      this.o.log.warn('speech model failed', { id, code: err.code, cancelled });
      this.set(m, cancelled ? { kind: 'missing' } : { kind: 'error', message: err.message });
      if (!cancelled) throw err;
    } finally {
      this.running.delete(id);
    }
  }

  cancel(id: string): void {
    this.running.get(id)?.abort();
  }

  async remove(id: string): Promise<void> {
    const m = this.find(id);
    if (!m) return;
    this.cancel(id);
    await rm(this.folder(m), { recursive: true, force: true });
    this.set(m, { kind: 'missing' });
  }

  private async fetchFile(
    m: SpeechModel,
    f: ModelFile,
    dest: string,
    signal: AbortSignal,
    onBytes: (n: number) => void,
  ): Promise<void> {
    const url = `${this.host}/${m.repo}/resolve/${m.revision}/${f.path}`;
    // Each chunk restarts the stall timer; a dead connection doesn't hang forever.
    const stall = new AbortController();
    let timer = setTimeout(() => stall.abort(), STALL_MS);
    const both = AbortSignal.any([signal, stall.signal]);
    try {
      const res = await this.o.fetch(url, { signal: both });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const hash = createHash('sha256');
      const out = createWriteStream(dest);
      let size = 0;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          clearTimeout(timer);
          timer = setTimeout(() => stall.abort(), STALL_MS);
          size += value.byteLength;
          if (size > f.size) throw new Error('larger than expected');
          hash.update(value);
          onBytes(value.byteLength);
          if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          out.end((err?: Error | null) => (err ? reject(err) : resolve())),
        );
      }
      if (size !== f.size || hash.digest('hex') !== f.sha256)
        throw new AppError(
          'speech-model-corrupt',
          'The downloaded speech model didn’t check out (it may have been damaged on the way). Try again.',
        );
      await stat(dest);
    } finally {
      clearTimeout(timer);
    }
  }
}
