# 0006 — Playwright for Electron and test profile override

**Status:** accepted · 2026-11-12

E2E tests use `@playwright/test`'s `_electron`. Two environment variables, `LAMPSTAND_USER_DATA` and
`LAMPSTAND_LIBRARY`, point the app at an isolated profile so tests never touch a real library. They only redirect
directories inside the user's own control and grant no extra capability. Tests run in "window mode" so they never take
over a real projector.

Note: VS Code's integrated terminal sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron run as plain Node. The
`e2e`/`dev` commands must run without it (`env -u ELECTRON_RUN_AS_NODE …`).
