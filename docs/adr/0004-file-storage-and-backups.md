# 0004 — File storage, backups and library import

**Status:** accepted · 2026-11-12

- One JSON file per entity (`JsonFileRepository`) behind the `Repository` port; contract tests run against the memory
  and JSON implementations so SQLite/cloud implementations can be dropped in later (§6.3).
- **Daily automatic backups contain library data (songs, services, themes, media metadata) but not media binaries**,
  which can be many GB. "Export library" includes media and streams to disk (no in-memory zip).
- **Library import** reads the zip in memory and is capped at 1 GB. Only known entry paths are accepted, and a backup
  is taken first. A streaming importer can replace this later without UI changes.
