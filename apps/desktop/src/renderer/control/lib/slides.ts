import {
  DEFAULT_THEME_IDS,
  withTextFormat,
  findTheme,
  type BackgroundLayer,
  type BibleVersionInfo,
  type BookId,
  type ContentLayer,
  type ServiceItem,
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
import { type ItemSlides, type PresentableSlide, type SlideContext } from '../types';
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

export function themeFor(ctx: SlideContext, kind: ThemeContentKind, themeId?: string): Theme {
  const settingsKey = kind === 'lower-third' ? 'text' : kind;
  const fallback =
    kind === 'scripture'
      ? DEFAULT_THEME_IDS.scripture
      : kind === 'lyrics'
        ? DEFAULT_THEME_IDS.lyrics
        : DEFAULT_THEME_IDS.text;
  return findTheme(ctx.themes, themeId ?? ctx.settings?.defaultThemes[settingsKey], fallback);
}

function themeBackground(theme: Theme, override?: BackgroundLayer['ref']): BackgroundLayer | null {
  const ref = override ?? theme.background;
  if (ref.kind === 'none') return null;
  const bg: BackgroundLayer = { ref };
  // The theme's dim/blur/colour adjustments apply to an item's own background too.
  if (theme.backgroundAdjust) bg.adjust = theme.backgroundAdjust;
  return bg;
}

const textBlock = (text: string): TextBlock => ({ spans: [{ text }] });

export function itemTitle(item: ServiceItem, ctx: Pick<SlideContext, 'songs' | 'media'>): string {
  switch (item.kind) {
    case 'song':
      return ctx.songs.find((s) => s.id === item.songId)?.title ?? 'Missing song';
    case 'scripture':
      return formatPassage(item.passage);
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
      const theme = withTextFormat(
        themeFor(ctx, 'lyrics', item.themeId ?? song.themeId),
        item.textFormat,
      );
      const background = themeBackground(theme, item.background);
      const lyricSlides = buildSongSlides(song, {
        arrangementId: item.arrangementId,
        translationLang: item.translationLang,
        maxLines: ctx.settings?.lyrics.maxLinesPerSlide ?? 4,
      });
      const credit = [
        song.title,
        song.authors.join(', '),
        song.copyright,
        song.ccliNumber && ctx.settings?.ccliLicenseNumber
          ? `CCLI #${ctx.settings.ccliLicenseNumber}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
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
          return {
            key: ls.key,
            label: ls.label,
            group: ls.sectionLabel,
            action: { kind: 'content', content, background },
          };
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
      const background = themeBackground(theme, item.background);
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
          const ref = first && last ? formatPassage({ start: first, end: last }) : '';
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
          return { key: sl.key, label, action: { kind: 'content', content, background } };
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
                position: 0,
                volume: 1,
              },
            },
          },
        ],
      };
    }
    case 'presentation':
    case 'announcements': {
      const theme = withTextFormat(themeFor(ctx, 'text', item.themeId), item.textFormat);
      const background = themeBackground(theme);
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
          return {
            key: content.key,
            label: ts.title || `Slide ${i + 1}`,
            action: { kind: 'content', content, background },
          };
        }),
      };
    }
    case 'countdown': {
      const theme = withTextFormat(themeFor(ctx, 'text', item.themeId), item.textFormat);
      const durationSec = typeof item.target === 'string' ? undefined : item.target.durationSec;
      const target =
        typeof item.target === 'string'
          ? item.target
          : new Date(Date.now() + (durationSec ?? 0) * 1000).toISOString();
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
        action: { kind: 'content', content, background: themeBackground(theme) },
      };
      if (durationSec) slide.countdownSec = durationSec;
      return { missing: [], slides: [slide] };
    }
  }
}
