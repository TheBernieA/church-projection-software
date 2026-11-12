/**
 * Strict CSP (§17.1). Production is exactly the spec string. Dev adds what Vite HMR needs
 * (inline React-refresh preamble, websocket) — see docs/adr/0003-dev-csp.md.
 */
export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' lampstand-media: data: blob:",
  "media-src 'self' lampstand-media: blob: mediastream:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function devCsp(devOrigin: string): string {
  const ws = devOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'self' " + devOrigin,
    `script-src 'self' 'unsafe-inline' ${devOrigin}`,
    `style-src 'self' 'unsafe-inline' ${devOrigin}`,
    `img-src 'self' lampstand-media: data: blob: ${devOrigin}`,
    "media-src 'self' lampstand-media: blob: mediastream:",
    `font-src 'self' data: ${devOrigin}`,
    `connect-src 'self' ${devOrigin} ${ws}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
