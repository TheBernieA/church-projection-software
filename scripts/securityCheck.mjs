#!/usr/bin/env node
// Static security checklist (§17, Phase 0 acceptance). Fails CI if a hardening rule regresses.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const failures = [];
const fail = (msg) => failures.push(msg);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'out', 'dist', 'release', 'test-results'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const sources = [...walk(join(root, 'apps/desktop/src')), ...walk(join(root, 'packages'))];
for (const file of sources) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  if (/\.innerHTML\s*=|dangerouslySetInnerHTML|insertAdjacentHTML/.test(src))
    fail(`${rel}: HTML injection API used`);
  if (/\beval\(|new Function\(/.test(src)) fail(`${rel}: eval/new Function`);
  if (
    /nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|webSecurity:\s*false/.test(
      src,
    )
  )
    fail(`${rel}: weakened webPreferences`);
  if (/@electron\/remote|enableRemoteModule/.test(src)) fail(`${rel}: remote module`);
  if (/new BrowserWindow\(/.test(src) && !/secureWebPreferences\(/.test(src))
    fail(`${rel}: BrowserWindow without secureWebPreferences()`);
  if (rel.startsWith('packages/') && /from 'electron'/.test(src))
    fail(`${rel}: packages/* must not import Electron`);
  if (rel.includes('/preload/') && /exposeInMainWorld\([^)]*ipcRenderer\s*\)/.test(src))
    fail(`${rel}: ipcRenderer exposed`);
  if (/fetch\(\s*['"`]https?:|https?\.request\(|axios/.test(src) && !rel.includes('/modules/'))
    fail(`${rel}: unexpected network call (§17.4)`);
  // The online assistant is opt-in and lives in one place (ADR 0008).
  if (/from '@anthropic-ai\/sdk/.test(src) && !rel.startsWith('apps/desktop/src/main/ai/'))
    fail(`${rel}: the Anthropic SDK is only for main/ai (ADR 0008)`);
}

const hardening = readFileSync(join(root, 'apps/desktop/src/main/security/hardening.ts'), 'utf8');
for (const rule of [
  'contextIsolation: true',
  'nodeIntegration: false',
  'sandbox: true',
  'webSecurity: true',
  'allowRunningInsecureContent: false',
  'webviewTag: false',
  'will-navigate',
  'setWindowOpenHandler',
  'setPermissionRequestHandler',
]) {
  if (!hardening.includes(rule)) fail(`hardening.ts missing: ${rule}`);
}
const csp = readFileSync(join(root, 'apps/desktop/src/main/security/csp.ts'), 'utf8');
for (const d of [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
])
  if (!csp.includes(d)) fail(`CSP missing ${d}`);
const builder = readFileSync(join(root, 'apps/desktop/electron-builder.yml'), 'utf8');
for (const f of [
  'runAsNode: false',
  'enableNodeOptionsEnvironmentVariable: false',
  'enableNodeCliInspectArguments: false',
  'enableEmbeddedAsarIntegrityValidation: true',
  'onlyLoadAppFromAsar: true',
  'enableCookieEncryption: true',
]) {
  if (!builder.includes(f)) fail(`electron-builder fuse missing: ${f}`);
}

if (failures.length) {
  console.error(`Security check FAILED (${failures.length}):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`Security check passed (${sources.length} files scanned).`);
