#!/usr/bin/env node
// Builds resources/bibles/kjv.lsbible from the public-domain KJV USFM published by eBible.org.
// Usage: node scripts/build-kjv-module.mjs [--refresh]   (--refresh re-downloads the source zip)
// See docs/module-format.md for the output format.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const OUT_FILE = join(ROOT, 'resources', 'bibles', 'kjv.lsbible');
const SOURCE_URL = 'https://ebible.org/Scriptures/eng-kjv2006_usfm.zip';
const CACHE_ZIP = join(CACHE_DIR, 'eng-kjv2006_usfm.zip');
const CACHE_META = join(CACHE_DIR, 'eng-kjv2006_usfm.meta.json');

const EXPECTED = { books: 66, chapters: 1189, verses: 31102 };

/** Canonical 66 books (USFM codes, must match BOOK_IDS in packages/core) with English names. */
const BOOKS = [
  ['GEN', 'Genesis'],
  ['EXO', 'Exodus'],
  ['LEV', 'Leviticus'],
  ['NUM', 'Numbers'],
  ['DEU', 'Deuteronomy'],
  ['JOS', 'Joshua'],
  ['JDG', 'Judges'],
  ['RUT', 'Ruth'],
  ['1SA', '1 Samuel'],
  ['2SA', '2 Samuel'],
  ['1KI', '1 Kings'],
  ['2KI', '2 Kings'],
  ['1CH', '1 Chronicles'],
  ['2CH', '2 Chronicles'],
  ['EZR', 'Ezra'],
  ['NEH', 'Nehemiah'],
  ['EST', 'Esther'],
  ['JOB', 'Job'],
  ['PSA', 'Psalms'],
  ['PRO', 'Proverbs'],
  ['ECC', 'Ecclesiastes'],
  ['SNG', 'Song of Solomon'],
  ['ISA', 'Isaiah'],
  ['JER', 'Jeremiah'],
  ['LAM', 'Lamentations'],
  ['EZK', 'Ezekiel'],
  ['DAN', 'Daniel'],
  ['HOS', 'Hosea'],
  ['JOL', 'Joel'],
  ['AMO', 'Amos'],
  ['OBA', 'Obadiah'],
  ['JON', 'Jonah'],
  ['MIC', 'Micah'],
  ['NAM', 'Nahum'],
  ['HAB', 'Habakkuk'],
  ['ZEP', 'Zephaniah'],
  ['HAG', 'Haggai'],
  ['ZEC', 'Zechariah'],
  ['MAL', 'Malachi'],
  ['MAT', 'Matthew'],
  ['MRK', 'Mark'],
  ['LUK', 'Luke'],
  ['JHN', 'John'],
  ['ACT', 'Acts'],
  ['ROM', 'Romans'],
  ['1CO', '1 Corinthians'],
  ['2CO', '2 Corinthians'],
  ['GAL', 'Galatians'],
  ['EPH', 'Ephesians'],
  ['PHP', 'Philippians'],
  ['COL', 'Colossians'],
  ['1TH', '1 Thessalonians'],
  ['2TH', '2 Thessalonians'],
  ['1TI', '1 Timothy'],
  ['2TI', '2 Timothy'],
  ['TIT', 'Titus'],
  ['PHM', 'Philemon'],
  ['HEB', 'Hebrews'],
  ['JAS', 'James'],
  ['1PE', '1 Peter'],
  ['2PE', '2 Peter'],
  ['1JN', '1 John'],
  ['2JN', '2 John'],
  ['3JN', '3 John'],
  ['JUD', 'Jude'],
  ['REV', 'Revelation'],
];
const BOOK_NAMES = new Map(BOOKS);

const LICENSE_TEXT =
  'The King James Version (Authorized Version, 1611; text as standardised in the 1769 Oxford ' +
  'edition) is in the public domain in most of the world. In the United Kingdom, rights in the ' +
  'Authorized Version are vested in the Crown and administered by Cambridge University Press, the ' +
  "Crown's patentee; reproduction there is permitted under the terms of that patent. " +
  'This module was produced from the public-domain "eng-kjv2006" USFM edition published by ' +
  "eBible.org; footnotes and Strong's tagging were removed.";

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function fail(msg) {
  console.error(`build-kjv-module: FAILED — ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}

// ---------------------------------------------------------------------------------------------
// 1. Download (cached)
// ---------------------------------------------------------------------------------------------
async function getSource() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const refresh = process.argv.includes('--refresh');
  if (!refresh && existsSync(CACHE_ZIP) && existsSync(CACHE_META)) {
    const bytes = readFileSync(CACHE_ZIP);
    const meta = JSON.parse(readFileSync(CACHE_META, 'utf8'));
    assert(
      sha256(bytes) === meta.sha256,
      'cached zip does not match its recorded sha256; rerun with --refresh',
    );
    console.log(`Using cached source ${CACHE_ZIP} (retrieved ${meta.retrievedAt})`);
    return { bytes, provenance: meta };
  }
  console.log(`Downloading ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  assert(res.ok, `download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert(
    bytes.length > 1_000_000 && bytes.length < 50_000_000,
    `unexpected download size ${bytes.length}`,
  );
  const provenance = {
    sourceUrl: SOURCE_URL,
    retrievedAt: new Date().toISOString(),
    sha256: sha256(bytes),
  };
  writeFileSync(CACHE_ZIP, bytes);
  writeFileSync(CACHE_META, JSON.stringify(provenance, null, 2) + '\n');
  return { bytes, provenance };
}

// ---------------------------------------------------------------------------------------------
// 2. USFM parsing
// ---------------------------------------------------------------------------------------------

/** Convert inline USFM character markup to Lampstand markup; strip everything else. */
function convertInline(s) {
  let t = s;
  // Notes: footnotes, cross references, endnotes (content dropped entirely).
  t = t.replace(/\\(f|fe|x)\s[\s\S]*?\\\1\*/g, '');
  // Word-level attributes: \w word|strong="..."\w*  and nested \+w ... \+w*  -> word
  t = t.replace(/\\\+?w\s+([^|\\]*?)(?:\|[^\\]*)?\\\+?w\*/g, '$1');
  // Kept character styles (plain and nested "+" forms).
  for (const tag of ['wj', 'add', 'nd']) {
    t = t.replace(new RegExp(`\\\\\\+?${tag}\\s`, 'g'), `<${tag}>`);
    t = t.replace(new RegExp(`\\\\\\+?${tag}\\*`, 'g'), `</${tag}>`);
  }
  // Other character styles whose text we keep but whose markup we drop (\tl, \qs, \sc, \it ...).
  t = t.replace(/\\\+?[a-z]+[0-9]*\*/g, '');
  t = t.replace(/\\\+?[a-z]+[0-9]*\s?/g, ' ');
  // KJV paragraph signs are not wanted on screen.
  t = t.replace(/¶/g, '');
  return normalizeWs(t);
}

function normalizeWs(t) {
  let s = t.replace(/\s+/g, ' ');
  // Move spaces out of tags: "<add> was </add>" -> " <add>was</add> "
  s = s.replace(/<(wj|add|nd)>\s+/g, ' <$1>').replace(/\s+<\/(wj|add|nd)>/g, '</$1> ');
  // Drop empty tags.
  s = s.replace(/<(wj|add|nd)><\/\1>/g, '');
  s = s.replace(/\s+/g, ' ');
  // No space before punctuation (can appear after removing notes / moving tag whitespace).
  s = s.replace(/ +([,.;:!?)])/g, '$1');
  return s.trim();
}

/** Paragraph/poetry/break markers that carry no text worth keeping. */
const PARA_MARKERS =
  /^\\(p|m|pi\d?|mi|nb|q\d?|qm\d?|qr|qc|b|pb|li\d?|pc|pm|pmo|pmc|pmr|cls|ie|tr|tc\d?|th\d?)$/;
/** Front-matter and identification markers (skipped). */
const SKIP_MARKERS =
  /^\\(id|ide|h|toc\d?|toca\d?|mt\d?|mte\d?|imt\d?|is\d?|ip|ipi|im|imi|ipq|imq|ipr|iq\d?|ib|ili\d?|iot|io\d?|ior|iex|rem|sts|usfm|cl|cp|ca|va|vp|r|mr|ms\d?|sr|sp)$/;

function parseBook(usfm, bookId, headings) {
  const chapters = [];
  let chapter = 0;
  let verse = 0;
  let cur = null; // { chapter, verse, raw }
  let pendingHeadings = [];

  const flush = () => {
    if (cur) {
      const text = convertInline(cur.raw);
      chapters[cur.chapter - 1][cur.verse - 1] = text;
      cur = null;
    }
  };

  // Split into marker-led segments: each paragraph-level marker starts a new segment.
  const lines = usfm.replace(/\r\n?/g, '\n').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(\\[a-z]+[0-9]*)(?:\s+([\s\S]*))?$/.exec(line);
    if (!m) {
      // Continuation of the previous verse text.
      if (cur) cur.raw += ' ' + line;
      continue;
    }
    const marker = m[1];
    const rest = m[2] ?? '';
    if (marker === '\\c') {
      flush();
      chapter = parseInt(rest, 10);
      assert(chapter === chapters.length + 1, `${bookId}: chapter ${rest} out of order`);
      chapters.push([]);
      verse = 0;
      continue;
    }
    if (marker === '\\v') {
      flush();
      const vm = /^(\d+)\s+([\s\S]*)$/.exec(rest);
      assert(vm, `${bookId} ${chapter}: malformed verse line: ${line.slice(0, 80)}`);
      const n = parseInt(vm[1], 10);
      assert(n === verse + 1, `${bookId} ${chapter}:${n}: verse out of order (after ${verse})`);
      verse = n;
      cur = { chapter, verse, raw: vm[2] };
      for (const h of pendingHeadings) headings.push({ ...h, chapter, verse, position: 'before' });
      pendingHeadings = [];
      continue;
    }
    if (PARA_MARKERS.test(marker)) {
      // e.g. "\q1" alone, or "\p text" (rare continuation).
      if (rest && cur) cur.raw += ' ' + rest;
      continue;
    }
    if (marker === '\\d' || /^\\s\d?$/.test(marker)) {
      flush();
      const text = convertInline(rest);
      if (!text) continue;
      const kind = marker === '\\d' ? 'title' : 'section';
      if (chapter > 0 && verse > 0 && kind === 'section' && isSubscription(usfm, line)) {
        headings.push({
          book: bookId,
          chapter,
          verse,
          position: 'after',
          kind: 'subscription',
          text,
        });
      } else {
        pendingHeadings.push({ book: bookId, kind, text });
      }
      continue;
    }
    if (SKIP_MARKERS.test(marker)) {
      flush();
      continue;
    }
    fail(`${bookId} ${chapter}:${verse}: unhandled paragraph marker ${marker}`);
  }
  flush();
  assert(pendingHeadings.length === 0, `${bookId}: dangling headings at end of book`);
  return chapters;
}

/** A section heading that is the last text-bearing line of the book (Pauline subscriptions). */
function isSubscription(usfm, line) {
  const after = usfm.slice(usfm.indexOf(line) + line.length);
  return !/\\v\s/.test(after);
}

// ---------------------------------------------------------------------------------------------
// 3. Build
// ---------------------------------------------------------------------------------------------
async function main() {
  const { bytes, provenance } = await getSource();
  const src = unzipSync(new Uint8Array(bytes));

  const byBook = new Map();
  for (const [name, data] of Object.entries(src)) {
    if (!name.endsWith('.usfm')) continue;
    const text = strFromU8(data).replace(/^﻿/, '');
    const id = /^\\id\s+([A-Z0-9]{3})/.exec(text)?.[1];
    assert(id, `${name}: no \\id line`);
    if (!BOOK_NAMES.has(id)) {
      console.log(`  skipping non-canonical book ${id} (${name})`);
      continue;
    }
    assert(!byBook.has(id), `duplicate book ${id}`);
    byBook.set(id, text);
  }
  assert(byBook.size === EXPECTED.books, `expected ${EXPECTED.books} books, found ${byBook.size}`);

  const files = {}; // path -> Uint8Array
  const headings = [];
  let chapterCount = 0;
  let verseCount = 0;
  const bookTexts = new Map();

  for (const [id, name] of BOOKS) {
    const usfm = byBook.get(id);
    assert(usfm, `missing book ${id}`);
    const chapters = parseBook(usfm, id, headings);
    chapters.forEach((verses, ci) => {
      assert(verses.length > 0, `${id} ${ci + 1}: chapter has no verses`);
      verses.forEach((v, vi) => {
        assert(
          typeof v === 'string' && v.replace(/<[^>]+>/g, '').trim().length > 0,
          `${id} ${ci + 1}:${vi + 1}: empty verse`,
        );
        assert(!v.includes('\\'), `${id} ${ci + 1}:${vi + 1}: stray USFM marker: ${v}`);
        assert(!/[|]/.test(v), `${id} ${ci + 1}:${vi + 1}: stray attribute pipe: ${v}`);
        assert(v.length <= 5000, `${id} ${ci + 1}:${vi + 1}: verse too long`);
        assertBalancedTags(v, `${id} ${ci + 1}:${vi + 1}`);
      });
      verseCount += verses.length;
    });
    chapterCount += chapters.length;
    bookTexts.set(id, chapters);
    files[`books/${id}.json`] = strToU8(JSON.stringify({ book: id, name, chapters }));
  }

  // Sanity checks on content.
  assert(
    chapterCount === EXPECTED.chapters,
    `expected ${EXPECTED.chapters} chapters, got ${chapterCount}`,
  );
  assert(verseCount === EXPECTED.verses, `expected ${EXPECTED.verses} verses, got ${verseCount}`);
  const plain = (s) => s.replace(/<[^>]+>/g, '');
  const gen11 = plain(bookTexts.get('GEN')[0][0]);
  assert(
    gen11 === 'In the beginning God created the heaven and the earth.',
    `Genesis 1:1 looks wrong: ${gen11}`,
  );
  const jhn316 = plain(bookTexts.get('JHN')[2][15]);
  assert(
    jhn316 ===
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    `John 3:16 looks wrong: ${jhn316}`,
  );
  assert(bookTexts.get('JHN')[2][15].startsWith('<wj>'), 'John 3:16 should be words of Jesus');
  assert(
    bookTexts.get('PSA')[22][0].includes('<nd>LORD</nd>'),
    'Psalm 23:1 should contain <nd>LORD</nd>',
  );
  assert(bookTexts.get('PSA').length === 150, 'Psalms should have 150 chapters');
  assert(bookTexts.get('PSA')[118].length === 176, 'Psalm 119 should have 176 verses');

  for (const h of headings) {
    assert(!h.text.includes('\\'), `stray marker in heading ${h.book} ${h.chapter}:${h.verse}`);
  }
  files['headings.json'] = strToU8(
    JSON.stringify({ format: 'lampstand-headings', formatVersion: 1, headings }),
  );

  const manifest = {
    format: 'lampstand-bible',
    formatVersion: 1,
    version: {
      id: 'kjv',
      name: 'King James Version',
      abbreviation: 'KJV',
      language: 'en',
      direction: 'ltr',
      versification: 'kjv',
      license: {
        kind: 'public-domain',
        text: LICENSE_TEXT,
        url: 'https://ebible.org/find/details.php?id=eng-kjv2006',
      },
      source: 'bundled',
      checksumSha256: '',
      moduleVersion: '1.0.0',
      provenance: {
        sourceUrl: provenance.sourceUrl,
        retrievedAt: provenance.retrievedAt,
        sha256: provenance.sha256,
      },
    },
    files: Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, data]) => ({ path, sha256: sha256(data), size: data.length })),
  };

  const zipEntries = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
  for (const [p, d] of Object.entries(files)) zipEntries[p] = d;
  // Fixed mtime keeps the output byte-reproducible for a given source zip.
  const zipped = zipSync(zipEntries, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') });
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, zipped);

  verifyOutput(OUT_FILE);

  console.log(
    `Wrote ${OUT_FILE}\n  ${BOOKS.length} books, ${chapterCount} chapters, ${verseCount} verses, ` +
      `${headings.length} headings\n  size ${statSync(OUT_FILE).size} bytes, sha256 ${sha256(readFileSync(OUT_FILE))}`,
  );
}

function assertBalancedTags(v, where) {
  const stack = [];
  for (const m of v.matchAll(/<(\/?)(wj|add|nd)>/g)) {
    if (!m[1]) stack.push(m[2]);
    else assert(stack.pop() === m[2], `${where}: unbalanced markup: ${v}`);
  }
  assert(stack.length === 0, `${where}: unclosed markup: ${v}`);
  assert(!/<(?!\/?(wj|add|nd)>)/.test(v), `${where}: unexpected tag: ${v}`);
}

/** Re-read the written module and check it the way the installer will. */
function verifyOutput(path) {
  const entries = unzipSync(new Uint8Array(readFileSync(path)));
  const manifestBytes = entries['manifest.json'];
  assert(manifestBytes, 'output: manifest.json missing at zip root');
  const manifest = JSON.parse(strFromU8(manifestBytes));
  assert(
    manifest.format === 'lampstand-bible' && manifest.formatVersion === 1,
    'output: bad format header',
  );
  assert(/^[a-z0-9][a-z0-9-]{0,31}$/.test(manifest.version.id), 'output: bad version id');
  assert(manifest.version.license.text.length <= 4000, 'output: license text too long');
  assert(manifest.files.length <= 200, 'output: too many files');
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const name of Object.keys(entries)) {
    assert(name === 'manifest.json' || listed.has(name), `output: unlisted zip entry ${name}`);
  }
  let verses = 0;
  for (const f of manifest.files) {
    assert(
      /^[A-Za-z0-9_\-/.]+$/.test(f.path) && !f.path.includes('..'),
      `output: bad path ${f.path}`,
    );
    const data = entries[f.path];
    assert(data, `output: listed file missing: ${f.path}`);
    assert(data.length === f.size, `output: size mismatch for ${f.path}`);
    assert(sha256(data) === f.sha256, `output: sha256 mismatch for ${f.path}`);
    const json = JSON.parse(strFromU8(data));
    if (f.path.startsWith('books/')) {
      assert(
        f.path === `books/${json.book}.json` && BOOK_NAMES.get(json.book) === json.name,
        `output: bad book file ${f.path}`,
      );
      assert(
        Array.isArray(json.chapters) && json.chapters.length <= 200,
        `output: bad chapters in ${f.path}`,
      );
      for (const ch of json.chapters) {
        assert(
          ch.length <= 200 && ch.every((v) => typeof v === 'string' && v.length <= 5000),
          `output: bad verses in ${f.path}`,
        );
        verses += ch.length;
      }
    }
  }
  assert(
    manifest.files.filter((f) => f.path.startsWith('books/')).length === EXPECTED.books,
    'output: book count',
  );
  assert(verses === EXPECTED.verses, `output: verse count ${verses}`);
  console.log('Output verified (manifest, per-file sha256/size, book files, verse count).');
}

main().catch((err) => fail(err?.stack ?? String(err)));
