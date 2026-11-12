# 0002 — Bibles and hymnals are user-installed packages

**Status:** accepted · 2026-11-12 (owner decision)

The owner will distribute Bible versions and hymnals as packages that users install. The app therefore ships:

- an **install-from-file** flow for `.lsbible` and `.lshymnal`/`.json` (Settings → Bibles & hymnals), using the same
  verified pipeline as the future signed catalog (§8.3);
- **only KJV bundled**, as required by §8.2 and needed for the sample service and first-run experience;
- **no bundled hymnal content.** The hymnal loader still reads `resources/hymns/*.json`, so bundling one later is a
  content change.

Removing a bundled package is not allowed (it would be reinstalled at next start); installed ones can be removed.
The signed online catalog (Phase 4) plugs in before step 3 of the pipeline in `docs/module-format.md`.
