import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Logger } from '../types';
import { SpeechModels, type ModelStatus, type SpeechModel } from './speechModels';

const log = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => log,
} as unknown as Logger;

const bytes = (s: string) => new TextEncoder().encode(s);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const CONTENT: Record<string, string> = {
  'config.json': '{"a":1}',
  'onnx/model.onnx': 'x'.repeat(5000),
};
const MODEL: SpeechModel = {
  id: 'test-model',
  repo: 'someone/test-model',
  revision: 'abc123',
  files: Object.entries(CONTENT).map(([path, s]) => ({ path, size: s.length, sha256: sha(s) })),
};

function streamOf(s: string): ReadableStream<Uint8Array> {
  const data = bytes(s);
  return new ReadableStream({
    start(c) {
      // In two pieces, as a network would.
      c.enqueue(data.slice(0, 7));
      c.enqueue(data.slice(7));
      c.close();
    },
  });
}

let dir: string;
let urls: string[];
let changes: ModelStatus[];
let serve: (path: string) => string | null;

function make(): SpeechModels {
  return new SpeechModels({
    dir,
    log,
    models: [MODEL],
    host: 'https://models.test',
    onChange: (s) => changes.push(s),
    fetch: (url) => {
      urls.push(url);
      const path = url.split('/resolve/abc123/')[1] ?? '';
      const body = serve(path);
      return Promise.resolve(
        body === null
          ? { ok: false, status: 404, body: null }
          : { ok: true, status: 200, body: streamOf(body) },
      );
    },
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lampstand-models-'));
  urls = [];
  changes = [];
  serve = (p) => CONTENT[p] ?? null;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SpeechModels', () => {
  it('downloads a pinned revision, checks it, and serves only its files', async () => {
    const models = make();
    expect((await models.status())[0]?.state.kind).toBe('missing');
    expect(await models.fileFor('test-model/config.json')).toBeNull();

    await models.download('test-model');
    expect(urls).toEqual([
      'https://models.test/someone/test-model/resolve/abc123/config.json',
      'https://models.test/someone/test-model/resolve/abc123/onnx/model.onnx',
    ]);
    expect((await models.status())[0]?.state.kind).toBe('ready');
    expect(changes.at(-1)?.state.kind).toBe('ready');
    expect(changes.some((c) => c.state.kind === 'downloading')).toBe(true);

    const file = await models.fileFor('test-model/onnx/model.onnx');
    expect(file).not.toBeNull();
    expect(await readFile(join(file!.root, file!.rel), 'utf8')).toBe(CONTENT['onnx/model.onnx']);
    // Not listed, outside the folder, or another model: never served.
    expect(await models.fileFor('test-model/lampstand-model.json')).toBeNull();
    expect(await models.fileFor('test-model/../secrets.json')).toBeNull();
    expect(await models.fileFor('other/config.json')).toBeNull();

    // Already there: no second download.
    await models.download('test-model');
    expect(urls).toHaveLength(2);
  });

  it('rejects a file that does not match its checksum, and keeps nothing', async () => {
    serve = (p) => (p === 'onnx/model.onnx' ? 'y'.repeat(5000) : (CONTENT[p] ?? null));
    const models = make();
    await expect(models.download('test-model')).rejects.toMatchObject({
      code: 'speech-model-corrupt',
    });
    expect((await models.status())[0]?.state.kind).toBe('error');
    expect(await models.fileFor('test-model/config.json')).toBeNull();
  });

  it('rejects a file larger than expected', async () => {
    serve = (p) => (p === 'config.json' ? `${CONTENT[p]}   ` : (CONTENT[p] ?? null));
    await expect(make().download('test-model')).rejects.toMatchObject({
      code: 'speech-model-download',
    });
  });

  it('a missing file fails the download', async () => {
    serve = (p) => (p === 'config.json' ? null : (CONTENT[p] ?? null));
    await expect(make().download('test-model')).rejects.toMatchObject({
      code: 'speech-model-download',
    });
  });

  it('an unknown model is refused', async () => {
    await expect(make().download('nope')).rejects.toMatchObject({ code: 'speech-model-unknown' });
  });

  it('removing a model makes it missing again', async () => {
    const models = make();
    await models.download('test-model');
    await models.remove('test-model');
    expect((await models.status())[0]?.state.kind).toBe('missing');
    expect(await models.fileFor('test-model/config.json')).toBeNull();
  });
});
