# 0003 — Development CSP

**Status:** accepted · 2026-11-12

Production renderers are served from `app://bundle/` with exactly the CSP in §17.1 (set as a response header by the
protocol handler). In development, Vite's React Fast Refresh injects an inline preamble and uses a websocket, which
that CSP blocks. `devCsp()` therefore adds `'unsafe-inline'` scripts and the dev-server origin **only when
`ELECTRON_RENDERER_URL` is set** (electron-vite dev). Packaged builds never set it, and `scripts/security-check.mjs`
asserts the production policy.
