#!/usr/bin/env node
// Builds the bundled Bibles (resources/bibles/<id>.lsbible) from the public-domain USFM editions
// published by eBible.org.
// Usage: node scripts/buildBibleModules.mjs [id ...] [--refresh]
//   ids: which versions to build (default: all, see VERSIONS); --refresh re-downloads the sources.
// See docs/module-format.md for the output format.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const OUT_DIR = join(ROOT, 'resources', 'bibles');
const BOOK_COUNT = 66;

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

/** What every module made here says about where it came from. */
const madeFrom = (ebible) =>
  `This module was produced from the public-domain "${ebible}" USFM edition published by ` +
  "eBible.org; footnotes, cross references and Strong's tagging were removed.";

/**
 * The bundled versions: all public domain, all from eBible.org. `english` keeps the English book
 * names (other languages take each book's own heading from the source). `expected` pins the
 * exact shape where it is known (the KJV); the others are checked for all 66 books and every
 * chapter having text, and may leave a verse empty where the source has none (e.g. Darby omits
 * a few the KJV has).
 */
const VERSIONS = [
  {
    id: 'kjv',
    ebible: 'eng-kjv2006',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'en',
    versification: 'kjv',
    expected: { chapters: 1189, verses: 31102 },
    license:
      'The King James Version (Authorized Version, 1611; text as standardised in the 1769 Oxford ' +
      'edition) is in the public domain in most of the world. In the United Kingdom, rights in the ' +
      'Authorized Version are vested in the Crown and administered by Cambridge University Press, the ' +
      "Crown's patentee; reproduction there is permitted under the terms of that patent. " +
      'This module was produced from the public-domain "eng-kjv2006" USFM edition published by ' +
      "eBible.org; footnotes and Strong's tagging were removed.",
  },
  {
    id: 'asv',
    ebible: 'eng-asv',
    name: 'American Standard Version (1901)',
    abbreviation: 'ASV',
    language: 'en',
    versification: 'kjv',
    license: 'The American Standard Version (1901) is in the public domain.',
  },
  {
    id: 'web',
    ebible: 'engwebp',
    name: 'World English Bible',
    abbreviation: 'WEB',
    language: 'en',
    versification: 'kjv',
    license:
      'The World English Bible is in the public domain. "World English Bible" is a trademark of ' +
      'eBible.org; this module is the unaltered text without its footnotes.',
  },
  {
    id: 'ylt',
    ebible: 'engylt',
    name: "Young's Literal Translation",
    abbreviation: 'YLT',
    language: 'en',
    versification: 'kjv',
    license: "Young's Literal Translation (1898) is in the public domain.",
  },
  {
    id: 'darby',
    ebible: 'engDBY',
    name: 'Darby Translation',
    abbreviation: 'DBY',
    language: 'en',
    versification: 'kjv',
    license: 'The Darby Translation (1890) is in the public domain.',
  },
  {
    id: 'bbe',
    ebible: 'engBBE',
    name: 'Bible in Basic English',
    abbreviation: 'BBE',
    language: 'en',
    versification: 'kjv',
    license: 'The Bible in Basic English (1965) is in the public domain.',
  },
  {
    id: 'webster',
    ebible: 'engwebster',
    name: 'Noah Webster Bible',
    abbreviation: 'WBS',
    language: 'en',
    versification: 'kjv',
    license: "Noah Webster's revision of the King James Version (1833) is in the public domain.",
  },
  {
    id: 'diodati',
    ebible: 'ita1885',
    name: 'Diodati (1885)',
    abbreviation: 'DIO',
    language: 'it',
    versification: 'kjv',
    license:
      "Giovanni Diodati's Italian translation (1641, revised 1821; this edition 1885) is in the " +
      'public domain.',
  },
  {
    id: 'riveduta',
    ebible: 'ita1927',
    name: 'Riveduta (1927)',
    abbreviation: 'RIV',
    language: 'it',
    versification: 'kjv',
    license: 'The Riveduta Italian Bible (1927) is in the public domain.',
  },
  {
    id: 'rv1909',
    ebible: 'spaRV1909',
    name: 'Reina-Valera 1909',
    abbreviation: 'RV1909',
    language: 'es',
    versification: 'kjv',
    license: 'The Reina-Valera revision of 1909 is in the public domain.',
  },
  {
    id: 'lsg',
    ebible: 'fraLSG',
    name: 'Louis Segond (1910)',
    abbreviation: 'LSG',
    language: 'fr',
    // Segond numbers some verses differently (e.g. Psalm titles are verse 1).
    versification: 'custom',
    license: 'The Louis Segond translation (1910) is in the public domain.',
  },
  {
    id: 'luther1912',
    ebible: 'deu1912',
    name: 'Lutherbibel 1912',
    abbreviation: 'LUT',
    language: 'de',
    versification: 'kjv',
    license: "The 1912 revision of Martin Luther's German Bible is in the public domain.",
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function fail(msg) {
  console.error(`buildBibleModules: FAILED — ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}

// ---------------------------------------------------------------------------------------------
// 1. Download (cached)
// ---------------------------------------------------------------------------------------------
async function getSource(v) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const sourceUrl = `https://ebible.org/Scriptures/${v.ebible}_usfm.zip`;
  const cacheZip = join(CACHE_DIR, `${v.ebible}_usfm.zip`);
  const cacheMeta = join(CACHE_DIR, `${v.ebible}_usfm.meta.json`);
  const refresh = process.argv.includes('--refresh');
  if (!refresh && existsSync(cacheZip) && existsSync(cacheMeta)) {
    const bytes = readFileSync(cacheZip);
    const meta = JSON.parse(readFileSync(cacheMeta, 'utf8'));
    assert(
      sha256(bytes) === meta.sha256,
      `${v.id}: cached zip does not match its recorded sha256; rerun with --refresh`,
    );
    console.log(`Using cached source ${cacheZip} (retrieved ${meta.retrievedAt})`);
    return { bytes, provenance: meta };
  }
  console.log(`Downloading ${sourceUrl} ...`);
  const res = await fetch(sourceUrl);
  assert(res.ok, `${v.id}: download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert(
    bytes.length > 1_000_000 && bytes.length < 50_000_000,
    `${v.id}: unexpected download size ${bytes.length}`,
  );
  const provenance = { sourceUrl, retrievedAt: new Date().toISOString(), sha256: sha256(bytes) };
  writeFileSync(cacheZip, bytes);
  writeFileSync(cacheMeta, JSON.stringify(provenance, null, 2) + '\n');
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

/** Verses the source leaves out (e.g. Darby's Matthew 23:14), as "BOOK c:v". */
function parseBook(usfm, bookId, headings, missing) {
  const chapters = [];
  let chapter = 0;
  let verse = 0;
  let cur = null; // { chapter, verse, raw }
  let pendingHeadings = [];

  const flush = () => {
    if (cur) {
      const text = convertInline(cur.raw);
      chapters[cur.chapter - 1][cur.verse - 1] = text;
      // A verse with no words (e.g. the WEB's Luke 17:36, kept only as a number) counts as missing.
      if (!text.replace(/<[^>]+>/g, '').trim())
        missing.push(`${bookId} ${cur.chapter}:${cur.verse}`);
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
      // The text may start on the next line (as in the Reina-Valera's Numbers 12:16).
      const vm = /^(\d+)(?:\s+([\s\S]*))?$/.exec(rest);
      assert(vm, `${bookId} ${chapter}: malformed verse line: ${line.slice(0, 80)}`);
      const n = parseInt(vm[1], 10);
      assert(n > verse, `${bookId} ${chapter}:${n}: verse out of order (after ${verse})`);
      // A verse the source leaves out stays empty, so the numbering still lines up.
      for (let gap = verse + 1; gap < n; gap++) {
        chapters[chapter - 1][gap - 1] = '';
        missing.push(`${bookId} ${chapter}:${gap}`);
      }
      verse = n;
      cur = { chapter, verse, raw: vm[2] ?? '' };
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
  // A note after a book's last verse (the ASV's end of Habakkuk) goes after that verse.
  for (const h of pendingHeadings)
    headings.push({ ...h, chapter, verse, position: 'after', kind: 'subscription' });
  return chapters;
}

/**
 * A book's name in its own language, as the source gives it: its running head (\\h), or its short
 * title (\\toc2) when the head is in capitals (Segond's "GENÈSE" → "Genèse"). Where both are in
 * capitals (Diodati), it's put in ordinary case: "I CORINTI" → "1 Corinti".
 */
function ownName(usfm) {
  const field = (m) =>
    new RegExp(`^\\\\${m}\\s+(.+?)\\s*$`, 'm').exec(usfm)?.[1]?.replace(/\s+/g, ' ');
  const caps = (t) => t === t.toUpperCase();
  const head = field('h');
  const short = field('toc2');
  if (head && !caps(head)) return head;
  if (short && !caps(short) && short.length <= 40) return short;
  return head ? ordinaryCase(head) : undefined;
}

/** Small words that stay lower case inside a book's name. */
const SMALL_WORDS = new Set([
  'de',
  'dei',
  'del',
  'della',
  'des',
  'di',
  'du',
  'e',
  'et',
  'la',
  'le',
  'les',
  'aux',
]);

function ordinaryCase(t) {
  return t
    .toLowerCase()
    .replace(/^(i{1,3})\s/, (_, n) => `${n.length} `)
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** A section heading that is the last text-bearing line of the book (Pauline subscriptions). */
function isSubscription(usfm, line) {
  const after = usfm.slice(usfm.indexOf(line) + line.length);
  return !/\\v\s/.test(after);
}

// ---------------------------------------------------------------------------------------------
// 3. Build
// ---------------------------------------------------------------------------------------------
async function buildVersion(v) {
  const { bytes, provenance } = await getSource(v);
  const src = unzipSync(new Uint8Array(bytes));

  const byBook = new Map();
  for (const [name, data] of Object.entries(src)) {
    if (!name.endsWith('.usfm')) continue;
    const text = strFromU8(data).replace(/^\uFEFF/, '');
    const id = /^\\id\s+([A-Z0-9]{3})/.exec(text)?.[1];
    assert(id, `${v.id} ${name}: no \\id line`);
    if (!BOOK_NAMES.has(id)) {
      console.log(`  skipping non-canonical book ${id} (${name})`);
      continue;
    }
    assert(!byBook.has(id), `${v.id}: duplicate book ${id}`);
    byBook.set(id, text);
  }
  assert(byBook.size === BOOK_COUNT, `${v.id}: expected ${BOOK_COUNT} books, found ${byBook.size}`);

  const files = {}; // path -> Uint8Array
  const headings = [];
  const missing = [];
  const names = new Map(); // book -> the name in the module
  let chapterCount = 0;
  let verseCount = 0;
  const bookTexts = new Map();

  for (const [id, english] of BOOKS) {
    const usfm = byBook.get(id);
    assert(usfm, `${v.id}: missing book ${id}`);
    // English versions keep the English names; others take the book's own heading.
    const own = ownName(usfm);
    const name = v.language === 'en' || !own ? english : own.slice(0, 100);
    names.set(id, name);
    const chapters = parseBook(usfm, id, headings, missing);
    chapters.forEach((verses, ci) => {
      assert(verses.length > 0, `${v.id} ${id} ${ci + 1}: chapter has no verses`);
      verses.forEach((t, vi) => {
        const where = `${v.id} ${id} ${ci + 1}:${vi + 1}`;
        assert(typeof t === 'string', `${where}: no verse`);
        assert(
          t.replace(/<[^>]+>/g, '').trim().length > 0 ||
            missing.includes(`${id} ${ci + 1}:${vi + 1}`),
          `${where}: empty verse`,
        );
        assert(!t.includes('\\'), `${where}: stray USFM marker: ${t}`);
        assert(!/[|]/.test(t), `${where}: stray attribute pipe: ${t}`);
        assert(t.length <= 5000, `${where}: verse too long`);
        assertBalancedTags(t, where);
      });
      verseCount += verses.length;
    });
    chapterCount += chapters.length;
    bookTexts.set(id, chapters);
    files[`books/${id}.json`] = strToU8(JSON.stringify({ book: id, name, chapters }));
  }

  // Sanity checks on content.
  const plain = (t) => t.replace(/<[^>]+>/g, '');
  const gen11 = plain(bookTexts.get('GEN')[0][0]);
  const jhn316 = plain(bookTexts.get('JHN')[2][15]);
  assert(gen11 && jhn316, `${v.id}: Genesis 1:1 or John 3:16 is empty`);
  if (v.expected) {
    assert(
      chapterCount === v.expected.chapters,
      `expected ${v.expected.chapters} chapters, got ${chapterCount}`,
    );
    assert(
      verseCount === v.expected.verses,
      `expected ${v.expected.verses} verses, got ${verseCount}`,
    );
  }
  if (v.id === 'kjv') {
    assert(
      gen11 === 'In the beginning God created the heaven and the earth.',
      `Genesis 1:1 looks wrong: ${gen11}`,
    );
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
  }
  assert(bookTexts.get('PSA').length === 150, `${v.id}: Psalms should have 150 chapters`);
  assert(missing.length <= 20, `${v.id}: ${missing.length} verses missing: ${missing.join(', ')}`);

  for (const h of headings) {
    assert(
      !h.text.includes('\\'),
      `${v.id}: stray marker in heading ${h.book} ${h.chapter}:${h.verse}`,
    );
  }
  files['headings.json'] = strToU8(
    JSON.stringify({ format: 'lampstand-headings', formatVersion: 1, headings }),
  );

  const manifest = {
    format: 'lampstand-bible',
    formatVersion: 1,
    version: {
      id: v.id,
      name: v.name,
      abbreviation: v.abbreviation,
      language: v.language,
      direction: 'ltr',
      versification: v.versification,
      license: {
        kind: 'public-domain',
        text: v.id === 'kjv' ? v.license : `${v.license} ${madeFrom(v.ebible)}`,
        url: `https://ebible.org/find/details.php?id=${v.ebible}`,
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
  const out = join(OUT_DIR, `${v.id}.lsbible`);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(out, zipped);

  verifyOutput(out, names, verseCount);

  console.log(
    `Wrote ${out}\n  ${BOOKS.length} books, ${chapterCount} chapters, ${verseCount} verses ` +
      `(${missing.length} missing in the source${missing.length ? `: ${missing.join(', ')}` : ''}), ${headings.length} headings\n` +
      `  size ${statSync(out).size} bytes, sha256 ${sha256(readFileSync(out))}\n` +
      `  Genesis 1:1  ${gen11}\n  John 3:16    ${jhn316}`,
  );
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const id of wanted)
    assert(
      VERSIONS.some((v) => v.id === id),
      `unknown version ${id}`,
    );
  for (const v of VERSIONS) if (!wanted.length || wanted.includes(v.id)) await buildVersion(v);
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
function verifyOutput(path, names, expectedVerses) {
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
        f.path === `books/${json.book}.json` && names.get(json.book) === json.name,
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
    manifest.files.filter((f) => f.path.startsWith('books/')).length === BOOK_COUNT,
    'output: book count',
  );
  assert(verses === expectedVerses, `output: verse count ${verses}`);
  console.log('Output verified (manifest, per-file sha256/size, book files, verse count).');
}

main().catch((err) => fail(err?.stack ?? String(err)));
