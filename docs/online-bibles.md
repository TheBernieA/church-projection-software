# Online Bibles

Bible versions read from an API as they're used (Settings › Bibles & hymnals › Online Bibles),
next to the installed `.lsbible` versions. Code: `apps/desktop/src/main/modules/onlineBibles/`.

## How it works

- A source is a setting (`settings.onlineBibles`: provider, name, abbreviation, language, the
  provider's id for the version, and for Custom the request/reply mapping). Its API key, if any, is
  kept in the encrypted secret store (`online-bible:<id>`), never in settings, never sent back to a
  window, and never logged (nor are request addresses, which may contain it).
- Its version id is `ol-…`. `bible.versions` lists installed versions then online ones;
  `bible.chapter`, `bible.verseCounts` and `bible.bookNames` route by id. Nothing else in the app
  knows the difference: slides, playlists, the Bible workspace and the quick bar work as usual.
- One chapter is fetched at a time, when it's first shown, and kept within the provider's terms
  (below) in `userData/online-bibles/<id>.json`, so a service prepared online also works offline.
  Chapters that can't be kept (one more than half its book: Jude, Obadiah…) are held in memory only
  while the app runs.
- Verse counts are the KJV's, corrected per chapter by what the version sends; book names for
  non-English versions come from the replies (bible-api.com, getBible).
- Requests stay under each provider's rate limits (counted on this computer); the same chapter is
  never requested twice at once.
- Online versions are not in word search (their full text isn't on this computer); references
  (`jn 3 16`) work.
- Errors say what to do: no internet (and the chapter isn't saved), key missing or refused, too many
  requests, passage not found.

## Providers and their rules

| Provider | Key | Kept on this computer | Requests |
|---|---|---|---|
| ESV API (Crossway) | yes, free for non-commercial use | ≤ 500 verses, never > half a book, 30 days | 60/min, 1,000/h, 5,000/day |
| API.Bible (American Bible Society) | yes, free plan | ≤ 500 verses, never > half a book, 30 days | 60/min, 5,000/month (free plan) |
| bible-api.com | no | ≤ 3,000 verses, 30 days | 15 per 30 s |
| getBible | no | ≤ 3,000 verses, re-checked weekly | 60/min (and its 429 Retry-After) |
| Custom | optional | ≤ 500 verses, never > half a book, 30 days | 60/min |

- **ESV** (api.esv.org): `GET /v3/passage/text/?q=<Book> <chapter>` with `Authorization: Token <key>`;
  headings, footnotes and the short copyright off; the reply's `parsed` range is checked against the
  chapter asked for. Terms: "You may not locally store more than 500 verses or one-half of any book";
  "include the letters ESV" with each quotation (every slide's reference carries the abbreviation);
  the full notice is shown in Settings. Each church creates its own application/key ("You may not
  sell, share, or publish your access key"). Crossway also states the ESV text may not be processed by
  AI systems: development and tests use a stand-in server and made-up text, never the real API.
- **API.Bible** (rest.api.bible): `GET /v1/bibles` lists the versions a key may read;
  `GET /v1/bibles/{id}/chapters/{BOOK}.{n}?content-type=text&include-titles=false&include-notes=false`
  with header `api-key`. Each version's `copyright` is shown with its verses. Its Fair Use System is
  reported with the manual call (`fums.api.bible/f3?t=<token>&dId=&sId=`: a random id for this
  computer and one per run, nothing personal) when a chapter is fetched. Its docs require this for web
  apps and don't address desktop apps; no caching rule was found, so it's kept to the ESV's limits.
- **bible-api.com**: `GET /<book>+<chapter>?translation=<id>&single_chapter_book_matching=indifferent`;
  a free hobby service ("do not use this API to download an entire bible"), may be down at times.
- **getBible**: `GET https://api.getbible.net/v2/<translation>/<bookNumber>/<chapter>.json`; asks
  clients to re-check cached data at least weekly.
- **Custom**: any API sending JSON or plain text. The chapter address takes `{book}` (USFM, `JHN`),
  `{bookNumber}` (43), `{bookName}` (John), `{chapter}` and `{key}`; the key may instead go in a header
  (with a prefix such as `Bearer `). The reply is either a list of verses (path to it, text field,
  verse-number field) or one text with `[1] [2]` numbers (path to it). https only; plain http only to
  this computer (localhost / 127.0.0.1), so a key never crosses the network unencrypted.

Not built in: the **NLT API** (Tyndale) ends public access on 1 January 2027; **YouVersion
Platform**'s reply format wasn't in the docs read (it can be set up as Custom once its replies are
known).

Sources (read November 2026): api.esv.org, api.esv.org/docs/passage-text/, crossway.org/permissions/,
docs.api.bible (authentication, bibles, chapters, content formats, rate limiting, licensing, fair
use), bible-api.com, getbible.net/api, api.nlt.to, developers.youversion.com.
