# Phase 0 — Foundations: smoke test

Automated (all must pass): `pnpm verify` (typecheck, lint, unit/integration tests, security check) and `pnpm --filter @lampstand/desktop e2e`.

Manual, on macOS **and** Windows:

- [ ] `pnpm dev` opens the control window; there are no errors in the terminal.
- [ ] DevTools console: `window.require`, `process` and `ipcRenderer` are undefined (sandbox + context isolation).
- [ ] Dragging a link onto a window does not navigate it; `window.open('https://example.com')` opens nothing in-app.
- [ ] `settings.json` appears in the app-data folder; deleting it restores defaults with no crash.
- [ ] Putting a corrupt `*.song.json` in the library moves it to `quarantine/` and shows a notice.
- [ ] `logs/lampstand.log` exists and contains no lyrics, verse text or secrets.
- [ ] The interface theme switches between dark and light; the UI size slider works.
