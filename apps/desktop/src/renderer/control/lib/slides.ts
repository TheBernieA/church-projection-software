import {
  DEFAULT_THEME_IDS,
  withTextFormat,
  findTheme,
  omit,
  secondsUntilTime,
  type BackgroundLayer,
  type BibleVersionInfo,
  type BookId,
  type ContentLayer,
  type Scrim,
  type ServiceItem,
  type Song,
  type TextBlock,
  type Theme,
  type ThemeContentKind,
  type VerseRef,
} from '@lampstand/core';
import { buildSongSlides, transposeLine } from '@lampstand/lyrics';
import {
  buildScriptureSlides,
  expandPassage,
  formatPassage,
  type VersionText,
} from '@lampstand/scripture';
import { chapterKey } from './store';
import { type ItemSlides, type PresentableSlide, type SlideContext, type SongItem } from '../types';
import { GROUP_COLORS } from '../constants';

/** Muted band colours for playlist sections (Pre-service, Worship, Word…), picked by name. */
const SECTION_COLORS = ['#3e7b4f', '#3a6aa6', '#8a6a3a', '#76508f', '#357f86', '#8f4b4b'];
export function sectionColor(label: string): string {
  let h = 0;
  for (const ch of label.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SECTION_COLORS[h % SECTION_COLORS.length] ?? '#555';
}

export function groupColor(label?: string): string | undefined {
  if (!label) return undefined;
  const l = label.trim().toLowerCase();
  return GROUP_COLORS.find(([re]) => re.test(l))?.[1] ?? '#7c8499';
}

export function themeFor(
  ctx: Pick<SlideContext, 'themes' | 'settings'>,
  kind: ThemeContentKind,
  themeId?: string,
): Theme {
  const settingsKey = kind === 'lower-third' ? 'text' : kind;
  const fallback =
    kind === 'scripture'
      ? DEFAULT_THEME_IDS.scripture
      : kind === 'lyrics'
        ? DEFAULT_THEME_IDS.lyrics
        : DEFAULT_THEME_IDS.text;
  return findTheme(ctx.themes, themeId ?? ctx.settings?.defaultThemes[settingsKey], fallback);
}

function themeBackground(
  theme: Theme,
  override?: BackgroundLayer['ref'],
  overlay?: Scrim,
): BackgroundLayer | null {
  const ref = override ?? theme.background;
  if (ref.kind === 'none') return null;
  const bg: BackgroundLayer = { ref };
  // The theme's dim/blur/colour adjustments apply to an item's own background too; the item's
  // readability overlay replaces the theme's.
  const adjust = overlay ? { ...theme.backgroundAdjust, scrim: overlay } : theme.backgroundAdjust;
  if (adjust) bg.adjust = adjust;
  return bg;
}

const textBlock = (text: string): TextBlock => ({ spans: [{ text }] });

/**
 * The item's background, if it sits behind the words (set over everything, it's a cue of its own
 * and the slides keep their theme's).
 */
const behindWords = (item: {
  background?: BackgroundLayer['ref'] | undefined;
  backgroundOver?: boolean | undefined;
}): BackgroundLayer['ref'] | undefined => (item.backgroundOver ? undefined : item.background);

/**
 * A slide's background: its own when it has one (set from its tile), else the item's. `own`
 * says which, so the tile can show a background of its own on its thumbnail.
 */
function slideBackground(
  item: {
    slideBackgrounds?: Record<string, BackgroundLayer['ref']> | undefined;
    backgroundOverlay?: Scrim | undefined;
  },
  theme: Theme,
  itemBackground: BackgroundLayer | null,
  key: string,
): { background: BackgroundLayer | null; own: boolean } {
  const ref = item.slideBackgrounds?.[key];
  return ref
    ? { background: themeBackground(theme, ref, item.backgroundOverlay), own: true }
    : { background: itemBackground, own: false };
}

/** How a song's slides look: its theme (with the item's text format) and its background. */
export function songLook(
  song: Song,
  item: Omit<SongItem, 'id' | 'kind' | 'songId'>,
  ctx: Pick<SlideContext, 'themes' | 'settings'>,
): { theme: Theme; background: BackgroundLayer | null } {
  // The song's own formatting, then the playlist item's (the Text bar) over it.
  const theme = withTextFormat(
    withTextFormat(themeFor(ctx, 'lyrics', item.themeId ?? song.themeId), song.textFormat),
    item.textFormat,
  );
  return { theme, background: themeBackground(theme, behindWords(item), item.backgroundOverlay) };
}

/** The credit line on a song's first slide, or '' when the song's credits are hidden. */
export function songCredit(song: Song, ctx: Pick<SlideContext, 'settings'>): string {
  if (song.showCredits === false) return '';
  return [
    song.title,
    song.authors.join(', '),
    song.copyright,
    song.ccliNumber && ctx.settings?.ccliLicenseNumber
      ? `CCLI #${ctx.settings.ccliLicenseNumber}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The slide, marked when its background is its own. */
const marked = (slide: PresentableSlide, own: boolean): PresentableSlide =>
  own ? { ...slide, ownBackground: true } : slide;

/** "10:30": a time of day a countdown runs to. */
export const isClockTime = (s: string): boolean => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * When a countdown reaches zero, as an ISO time: after its length from now, at its time of day
 * (today, or tomorrow if that's long past), or the exact time it was given.
 */
export function countdownTarget(target: string | { durationSec: number }, nowMs: number): string {
  if (typeof target !== 'string') return new Date(nowMs + target.durationSec * 1000).toISOString();
  if (isClockTime(target))
    return new Date(nowMs + secondsUntilTime(target, nowMs) * 1000).toISOString();
  return target;
}

export function itemTitle(
  item: ServiceItem,
  ctx: Pick<SlideContext, 'songs' | 'media'> & Partial<Pick<SlideContext, 'bookNames'>>,
): string {
  switch (item.kind) {
    case 'song':
      return ctx.songs.find((s) => s.id === item.songId)?.title ?? 'Missing song';
    case 'scripture':
      // In the first version's own language ("Giovanni 3:16").
      return formatPassage(item.passage, {
        names: ctx.bookNames?.[item.versionIds[0] ?? ''],
      });
    case 'media':
      return ctx.media.find((m) => m.id === item.mediaId)?.name ?? 'Missing media';
    case 'presentation':
    case 'announcements':
    case 'countdown':
    case 'web':
      return item.title;
    case 'header':
      return item.label;
  }
}

/** Turn a service item into the slides shown in the grid. Pure given the context. */
export function buildItemSlides(item: ServiceItem, ctx: SlideContext): ItemSlides {
  const none: ItemSlides = { slides: [], missing: [] };
  switch (item.kind) {
    case 'web':
      return {
        missing: [],
        slides: [
          {
            key: `${item.id}:web`,
            label: item.title,
            action: { kind: 'web', web: { key: item.id, url: item.url } },
          },
        ],
      };
    case 'header':
      return none;
    case 'song': {
      const song = ctx.songs.find((s) => s.id === item.songId);
      if (!song) return none;
      const { theme, background } = songLook(song, item, ctx);
      const lyricSlides = buildSongSlides(song, {
        arrangementId: item.arrangementId,
        translationLang: item.translationLang,
        maxLines: ctx.settings?.lyrics.maxLinesPerSlide ?? 4,
      });
      const credit = songCredit(song, ctx);
      return {
        missing: [],
        slides: lyricSlides.map((ls, i) => {
          const blocks: TextBlock[] = [textBlock(ls.lines.join('\n'))];
          if (ls.translation)
            blocks.push({ ...textBlock(ls.translation.join('\n')), role: 'secondary' });
          const content: ContentLayer = {
            key: ls.key,
            kind: 'lyrics',
            theme,
            blocks,
            label: `${song.title} — ${ls.label}`,
          };
          if (i === 0 && credit) content.copyright = credit;
          if (ls.chordLines)
            content.chords = ls.chordLines.map((l) => transposeLine(l, item.transpose ?? 0));
          if (item.notes) content.notes = item.notes;
          const bg = slideBackground(item, theme, background, ls.key);
          return marked(
            {
              key: ls.key,
              label: ls.label,
              group: ls.sectionLabel,
              action: { kind: 'content', content, background: bg.background },
            },
            bg.own,
          );
        }),
      };
    }
    case 'scripture': {
      const versions = item.versionIds
        .map((id) => ctx.versions.find((v) => v.id === id))
        .filter((v): v is BibleVersionInfo => !!v);
      const primary = versions[0];
      if (!primary) return none;
      const counts = ctx.verseCounts[primary.id];
      if (!counts) return none;
      const vic = (b: BookId, c: number): number => counts[b]?.[c - 1] ?? 0;
      const refs = expandPassage(item.passage, vic);
      const missing: ItemSlides['missing'] = [];
      const seen = new Set<string>();
      for (const v of versions)
        for (const r of refs) {
          const k = chapterKey(v.id, r.book, r.chapter);
          if (!ctx.chapters[k] && !seen.has(k)) {
            seen.add(k);
            missing.push({ versionId: v.id, book: r.book, chapter: r.chapter });
          }
        }
      if (missing.length) return { slides: [], missing };
      const texts: VersionText[] = versions.map((v) => ({
        id: v.id,
        abbreviation: v.abbreviation,
        direction: v.direction,
        language: v.language,
        verse: (r: VerseRef) => ctx.chapters[chapterKey(v.id, r.book, r.chapter)]?.[r.verse - 1],
      }));
      const theme = withTextFormat(themeFor(ctx, 'scripture', item.themeId), item.textFormat);
      const background = themeBackground(theme, behindWords(item), item.backgroundOverlay);
      const s = ctx.settings?.scripture;
      const built = buildScriptureSlides(refs, texts, {
        mode: s?.versesPerSlide ?? 'fit',
        maxChars: s?.maxCharsPerSlide ?? 320,
        keyPrefix: item.id,
      });
      const abbrevs = versions.map((v) => v.abbreviation).join(' / ');
      const copyright = versions
        .map((v) => v.copyrightLine)
        .filter(Boolean)
        .join(' · ');
      return {
        missing: [],
        slides: built.map((sl) => {
          const first = sl.verses[0];
          const last = sl.verses[sl.verses.length - 1];
          const ref =
            first && last
              ? formatPassage({ start: first, end: last }, { names: ctx.bookNames[primary.id] })
              : '';
          const content: ContentLayer = {
            key: sl.key,
            kind: 'scripture',
            theme,
            blocks: sl.blocks,
            reference: `${ref} ${abbrevs}`.trim(),
            label: ref,
          };
          if (copyright) content.copyright = copyright;
          if (item.notes) content.notes = item.notes;
          const label = sl.part ? `${ref} (${sl.part.index + 1}/${sl.part.count})` : ref;
          const bg = slideBackground(item, theme, background, sl.key);
          return marked(
            { key: sl.key, label, action: { kind: 'content', content, background: bg.background } },
            bg.own,
          );
        }),
      };
    }
    case 'media': {
      const m = ctx.media.find((x) => x.id === item.mediaId);
      if (!m || m.kind === 'audio') return none;
      if (item.asBackground) {
        const ref: BackgroundLayer['ref'] =
          m.kind === 'video'
            ? { kind: 'video', mediaId: m.id, loop: item.loop }
            : { kind: 'image', mediaId: m.id };
        return {
          missing: [],
          slides: [
            {
              key: `${item.id}:bg`,
              label: m.name,
              action: { kind: 'background', background: { ref } },
            },
          ],
        };
      }
      return {
        missing: [],
        slides: [
          {
            key: `${item.id}:media`,
            label: m.name,
            action: {
              kind: 'media',
              media: {
                mediaId: m.id,
                kind: m.kind,
                loop: item.loop,
                muted: false,
                fit: 'contain',
                playing: true,
                position: item.playback?.start ?? 0,
                volume: 1,
                // Trim and fades go to every output; "play on go live" is the control's choice.
                ...(item.playback ? omit(item.playback, 'autoplay') : {}),
              },
            },
          },
        ],
      };
    }
    case 'presentation':
    case 'announcements': {
      const theme = withTextFormat(themeFor(ctx, 'text', item.themeId), item.textFormat);
      const background = themeBackground(theme, behindWords(item), item.backgroundOverlay);
      return {
        missing: [],
        slides: item.slides.map((ts, i) => {
          const blocks = [
            ts.title ? { spans: [{ text: ts.title, style: 'emphasis' as const }] } : null,
            textBlock(ts.body),
          ].filter((b): b is TextBlock => !!b && b.spans.some((s) => s.text.trim()));
          const content: ContentLayer = {
            key: `${item.id}:${ts.id}`,
            kind: 'text',
            theme,
            blocks,
            label: ts.title ?? `${item.title} ${i + 1}`,
          };
          if (ts.notes) content.notes = ts.notes;
          if (ts.objects?.length) content.objects = ts.objects;
          const bg = slideBackground(item, theme, background, content.key);
          return marked(
            {
              key: content.key,
              label: ts.title || `Slide ${i + 1}`,
              action: { kind: 'content', content, background: bg.background },
            },
            bg.own,
          );
        }),
      };
    }
    case 'countdown': {
      const theme = withTextFormat(themeFor(ctx, 'text', item.themeId), item.textFormat);
      const durationSec = typeof item.target === 'string' ? undefined : item.target.durationSec;
      const clock =
        typeof item.target === 'string' && isClockTime(item.target) ? item.target : undefined;
      const target = countdownTarget(item.target, Date.now());
      const content: ContentLayer = {
        key: `${item.id}:countdown`,
        kind: 'countdown',
        theme,
        blocks: [textBlock(item.title)],
        countdownTo: target,
        label: item.title,
      };
      const slide: PresentableSlide = {
        key: content.key,
        label: item.title,
        action: {
          kind: 'content',
          content,
          background: themeBackground(theme, item.background, item.backgroundOverlay),
        },
      };
      if (durationSec) slide.countdownSec = durationSec;
      if (clock) slide.countdownClock = clock;
      if (item.video)
        slide.countdownVideo = { mediaId: item.video.mediaId, hideTimer: !!item.hideTimer };
      return { missing: [], slides: [slide] };
    }
  }
}

/** Themes made for a lower third (words along the bottom), for the stream and the screens. */
export const lowerThirdThemes = (themes: Theme[]): Theme[] =>
  themes.filter((t) => t.layout === 'lower-third');
