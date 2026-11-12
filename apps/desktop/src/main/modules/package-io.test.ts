import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listDir } from '../storage/atomic';
import { installIntoPlace, parseJsonBytes, sha256 } from './package-io';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ls-pkg-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('package-io', () => {
  it('hashes and parses defensively', () => {
    expect(sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(parseJsonBytes(new TextEncoder().encode('{"a":1}'))).toEqual({ a: 1 });
    expect(parseJsonBytes(new TextEncoder().encode('{nope'))).toBeNull();
  });
  it('installs atomically and replaces an older copy', async () => {
    await installIntoPlace(dir, 'x', (d) => writeFile(join(d, 'v.txt'), '1'));
    await installIntoPlace(dir, 'x', (d) => writeFile(join(d, 'v.txt'), '2'));
    expect(await readFile(join(dir, 'x', 'v.txt'), 'utf8')).toBe('2');
    expect((await listDir(dir)).map((e) => e.name)).toEqual(['x']); // no staging left behind
  });
  it('leaves the existing install untouched when writing fails', async () => {
    await installIntoPlace(dir, 'x', (d) => writeFile(join(d, 'v.txt'), 'good'));
    await expect(
      installIntoPlace(dir, 'x', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(await readFile(join(dir, 'x', 'v.txt'), 'utf8')).toBe('good');
    expect((await listDir(dir)).map((e) => e.name)).toEqual(['x']);
  });
  it('listDir returns [] for a missing folder', async () => {
    expect(await listDir(join(dir, 'nope'))).toEqual([]);
  });
});
