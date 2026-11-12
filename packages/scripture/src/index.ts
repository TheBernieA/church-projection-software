export { BOOKS, getBook, bookName, bookIndex, type BookInfo } from './books';
export {
  ALIASES,
  registerAliases,
  normalizeAliasKey,
  lookupAlias,
  lookupAliasPrefix,
} from './aliases';
export {
  wordsToNumber,
  normalizeSpokenNumbers,
  readNumberPhrase,
  type NumberValue,
} from './numbers';
export {
  parseReference,
  type ReferenceCandidate,
  type ReferenceContext,
  type ParseOptions,
} from './parse';
export { findReferencesInText, type FoundReference, type FindOptions } from './find';
export { formatPassage, formatPassages, type FormatOptions } from './format';
export {
  compareVerse,
  comparePassage,
  passageContains,
  nextVerse,
  prevVerse,
  expandPassage,
  chapterCount,
  type VersesInChapter,
} from './nav';
export { buildScriptureSlides, splitText, type ScriptureSlide, type VersionText } from './slides';
