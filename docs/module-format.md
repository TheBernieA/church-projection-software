# Lampstand package formats

Bibles and hymnals are installed by users as **packages** (Settings → Bibles & hymnals → Install package…).
Every package goes through the same verified pipeline before anything touches disk.

## `.lsbible` — Bible version

A zip archive:

```
manifest.json        required
books/GEN.json …     one file per book (USFM 3-letter code), only books present in the version
headings.json        optional section headings (kept, not shown yet)
footnotes.json       optional (kept, not shown yet)
signature.sig        reserved — Ed25519 over manifest.json, for a future catalog (not checked yet)
```

### `manifest.json`

```jsonc
{
  "format": "lampstand-bible",
  "formatVersion": 1,
  "version": {
    "id": "kjv",                     // [a-z0-9-], unique per version
    "name": "King James Version",
    "abbreviation": "KJV",
    "language": "en",                // BCP-47
    "direction": "ltr",              // or "rtl"
    "versification": "kjv",          // kjv | lxx | vulgate | custom
    "license": { "kind": "public-domain", "text": "…", "url": "https://…" },
    "copyrightLine": "…",            // optional; shown on slides when present
    "source": "bundled",             // overwritten by the installer (bundled / imported / downloaded)
    "checksumSha256": "",            // filled in by the installer (sha256 of the whole package)
    "moduleVersion": "1.0.0",
    "provenance": { "sourceUrl": "…", "retrievedAt": "…", "sha256": "…" }
  },
  "files": [{ "path": "books/GEN.json", "sha256": "<hex>", "size": 12345 }]
}
```

### `books/<BOOK>.json`

```json
{ "book": "JHN", "name": "John", "chapters": [["verse 1 text", "verse 2 text"], ["…"]] }
```

`chapters[c][v]` is chapter `c+1`, verse `v+1`. Per-book files mean opening a chapter never parses the whole Bible.

### Inline markup

| Tag | Meaning | Rendering |
|---|---|---|
| `<wj>…</wj>` | Words of Jesus | red letters (theme option) |
| `<add>…</add>` | Translator-added words | italic |
| `<nd>…</nd>` | Divine name (LORD) | small caps |

Markup is parsed by Lampstand's own parser into styled spans. It is **never** injected as HTML; anything else is shown as literal text.

## `.lshymnal` — hymnal

Either a plain hymnal `.json` file, or a zip:

```
manifest.json   { "format": "lampstand-hymnal-module", "formatVersion": 1,
                  "file": { "path": "hymnal.json", "sha256": "<hex>", "size": 123 } }
hymnal.json     the hymnal (schema below)
```

### `hymnal.json`

```jsonc
{
  "format": "lampstand-hymnal",
  "formatVersion": 1,
  "id": "my-church-hymnal",          // [a-z0-9-]
  "name": "Our Hymnal",
  "license": "Public domain / used with permission …",
  "hymns": [{
    "number": "23",
    "title": "…",
    "authors": ["…"],
    "year": 1779,                    // optional
    "copyright": "…",                // optional; default "Public domain (year)"
    "tags": ["grace"],               // optional
    "sections": [
      { "kind": "verse", "label": "Verse 1", "lines": ["…", "…"] },
      { "kind": "chorus", "label": "Chorus", "lines": ["…"] }
    ],
    "order": ["Verse 1", "Chorus", "Verse 2", "Chorus"]   // optional; default = chorus after each verse
  }]
}
```

`kind` is one of `verse, chorus, pre-chorus, bridge, tag, intro, outro, ending, other`. Hymns are read-only in the
app; operators use "Duplicate to edit". Only distribute hymnals whose words you have the right to share.

## Install pipeline (both formats)

1. Size limit (64 MB package). What the file is comes from its contents, not its name: a zip
   (`PK\x03\x04`) whose `manifest.json` says `lampstand-bible` or `lampstand-hymnal-module`, or a
   plain hymnal JSON (`"format": "lampstand-hymnal"`). Anything else is refused as "not a
   Lampstand package". (A damaged file falls back to its extension, so its error says what's wrong.)
2. Optional checksum (SHA-256) when the caller knows one. Ed25519 signatures for a download
   catalog are planned, not implemented.
3. In-memory extraction with **zip-slip** protection (no absolute paths, `..`, backslashes, drive letters; path allow-list)
   and **zip-bomb** limits (≤ 300 files, ≤ 8 MB per file, ≤ 64 MB total, ≤ 200:1 compression ratio).
4. Per-file SHA-256 and size checked against the manifest (tampered packages are rejected).
5. Every JSON validated with Zod.
6. Written to a staging directory and swapped into `userData/bibles/<id>/` or `userData/hymnals/<id>/`: the
   installed copy is renamed aside first and deleted only once the new one is in place, so a crash leaves one
   or the other, never neither. Leftovers of an interrupted install are cleared at the next start.
7. The search index is rebuilt in the SearchWorker; the UI refreshes.

Installing a package whose bytes match an installed version does nothing ("already installed"). One with the
same `id` but different contents replaces it ("Updated"), including an included (bundled) Bible: the user's
copy then stays across restarts, and removing it brings the bundled one back. Removing the default Bible
version moves the default to KJV, or else the first version still installed.

Bundled packages: any valid `.lsbible` in `resources/bibles/` (or hymnal `.json` in `resources/hymns/`) ships with the
app and installs on first run (and again when an app update changes it; the file name must be the version id,
`<id>.lsbible`) — adding one is a content change, not a code change. `scripts/buildBibleModules.mjs`
builds the bundled Bibles from eBible.org's public-domain USFM and records provenance in each manifest:
KJV, ASV, WEB, YLT, Darby, BBE and Webster (English), Diodati and Riveduta (Italian), Reina-Valera 1909
(Spanish), Louis Segond 1910 (French) and Luther 1912 (German). Add one by adding a row to its `VERSIONS`
table and running `pnpm build:bibles <id>`.
