import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scrub } from '../app/logger';
import { sniffMedia } from '../library/sniff';
import { resolveRoles, upsertAssignment, type DisplayLike } from '../windows/displays';
import { PROD_CSP } from './csp';
import { fileResponse, parseRange } from './file-response';
import { resolveInside } from './safe-path';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ls-sec-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('resolveInside (§17.3)', () => {
  it('allows files inside the root only', async () => {
    const root = join(dir, 'lib');
    await mkdir(root);
    await writeFile(join(root, 'ok.png'), 'x');
    await writeFile(join(dir, 'secret.txt'), 'x');
    expect(await resolveInside(root, 'ok.png')).toMatch(/ok\.png$/);
    expect(await resolveInside(root, '../secret.txt')).toBeNull();
    expect(await resolveInside(root, '/etc/passwd')).toBeNull();
    expect(await resolveInside(root, 'missing.png')).toBeNull();
    await symlink(join(dir, 'secret.txt'), join(root, 'link.png'));
    expect(await resolveInside(root, 'link.png')).toBeNull(); // symlink escape
  });
});

describe('log scrubber (§17.5)', () => {
  it('redacts stream keys, tokens and URL credentials', () => {
    const out = scrub(
      'rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh token=s3cret https://user:pw@host/x',
    );
    expect(out).not.toMatch(/abcd-1234|s3cret|user:pw/);
  });
});

describe('media sniffing', () => {
  const bytes = (...b: number[]): Uint8Array => {
    const a = new Uint8Array(32);
    a.set(b);
    return a;
  };
  const ascii = (s: string, at = 0): Uint8Array => {
    const a = new Uint8Array(32);
    for (let i = 0; i < s.length; i++) a[at + i] = s.charCodeAt(i);
    return a;
  };
  it('detects by magic bytes, not extension', () => {
    expect(sniffMedia(bytes(0xff, 0xd8, 0xff))?.mime).toBe('image/jpeg');
    expect(sniffMedia(bytes(0x89, 0x50, 0x4e, 0x47))?.ext).toBe('png');
    const mp4 = ascii('ftypisom', 4);
    expect(sniffMedia(mp4)?.kind).toBe('video');
    expect(sniffMedia(ascii('MZ executable'))).toBeNull();
  });
});

describe('display mapping (§7.3 hot-plug)', () => {
  const d = (id: number, label: string, x: number): DisplayLike => ({
    id,
    label,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
  });
  it('re-maps a reconnected projector by fingerprint, with a new id', () => {
    const saved = upsertAssignment([], d(5, 'Epson', 1920), 'main');
    expect(resolveRoles([d(1, 'Built-in', 0), d(99, 'Epson', 1920)], saved).get(99)).toBe('main');
    expect(resolveRoles([d(1, 'Built-in', 0)], saved).get(1)).toBe('none');
  });
  it('falls back to name+size if the position changed', () => {
    const saved = upsertAssignment([], d(5, 'Epson', 1920), 'stage');
    expect(resolveRoles([d(7, 'Epson', -1920)], saved).get(7)).toBe('stage');
  });
  it('only one main output', () => {
    let saved = upsertAssignment([], d(1, 'A', 0), 'main');
    saved = upsertAssignment(saved, d(2, 'B', 1920), 'main');
    expect(saved.filter((s) => s.role === 'main')).toHaveLength(1);
  });
});

describe('CSP', () => {
  it('matches the spec: no remote or inline scripts', () => {
    expect(PROD_CSP).toContain("script-src 'self'");
    expect(PROD_CSP).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|https?:/);
    expect(PROD_CSP).toContain("object-src 'none'");
  });
});

describe('media byte ranges (video seeking)', () => {
  it('parses ranges', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-1, 5-6', 1000)).toEqual({ start: 0, end: 1 });
    expect(parseRange('bytes=1000-', 1000)).toBe('invalid');
    expect(parseRange('bytes=5-2', 1000)).toBe('invalid');
    expect(parseRange('items=0-1', 1000)).toBe('invalid');
  });

  it('answers a range with 206 and exactly those bytes', async () => {
    const file = join(dir, 'clip.mp4');
    await writeFile(file, Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)));
    const res = await fileResponse(file, 'bytes=100-199');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.length).toBe(100);
    expect(body[0]).toBe(100);

    const whole = await fileResponse(file, null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-length')).toBe('1000');
    expect(whole.headers.get('accept-ranges')).toBe('bytes');

    const bad = await fileResponse(file, 'bytes=5000-');
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toBe('bytes */1000');
    expect((await fileResponse(join(dir, 'missing.mp4'), null)).status).toBe(404);
  });
});
