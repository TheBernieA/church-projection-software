# 0001 — Toolchain versions

**Status:** accepted · 2026-11-12

TypeScript 7 (native port) is the latest release, but `typescript-eslint` 8.72 supports TypeScript `<6.1`. We pin
**TypeScript 6.0.3** so the strict type-checked lint rules (§19.1) work. Electron is pinned to **45.3.1** (latest
stable), React 19, Vite 8 + electron-vite 6, Vitest 5, Zod 4. All versions are exact (`.npmrc save-exact`).

Revisit when typescript-eslint supports TS 7.
