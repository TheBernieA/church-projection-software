import { net, protocol } from 'electron';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROD_CSP } from './csp';
import { fileResponse } from './fileResponse';
import { resolveInside } from './safePath';
import { APP_SCHEME, MEDIA_SCHEME, MIME_TYPES } from '../constants';

/** Must run before `app.ready`. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * `app://bundle/<path>` serves the built renderer from inside the asar with the strict CSP
 * header (§17.1) — production never loads from http://localhost.
 */
export function handleAppProtocol(rendererRoot: string): void {
  protocol.handle(APP_SCHEME, async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'control/index.html';
    const file = await resolveInside(rendererRoot, rel);
    if (!file) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Type', MIME_TYPES[extname(file)] ?? 'application/octet-stream');
    headers.set('Content-Security-Policy', PROD_CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers });
  });
}

/**
 * `lampstand-media://<kind>/<id>` resolves library ids → files inside the library only (§12, §17.3).
 * Renderers never see paths.
 */
export function handleMediaProtocol(
  lookup: (kind: string, id: string) => Promise<{ root: string; rel: string } | null>,
): void {
  protocol.handle(MEDIA_SCHEME, async (req) => {
    const url = new URL(req.url);
    const kind = url.hostname;
    const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(id)) return new Response('Bad request', { status: 400 });
    const found = await lookup(kind, id);
    if (!found) return new Response('Not found', { status: 404 });
    const file = await resolveInside(found.root, found.rel);
    if (!file) return new Response('Not found', { status: 404 });
    // Byte ranges are served by hand: <video> seeking needs real 206 responses.
    return fileResponse(file, req.headers.get('range'));
  });
}

export function rendererUrl(page: 'control' | 'output' | 'stage', query = ''): string {
  const dev = process.env.ELECTRON_RENDERER_URL;
  const q = query ? `?${query}` : '';
  return dev ? `${dev}/${page}/index.html${q}` : `${APP_SCHEME}://bundle/${page}/index.html${q}`;
}

export function rendererRootDir(): string {
  return join(__dirname, '../renderer');
}
