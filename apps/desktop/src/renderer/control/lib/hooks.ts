import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  defaultSettings,
  resolveLogo,
  resolveStandby,
  type MediaItem,
  type ScreenVisual,
  type ServiceItem,
  type Settings,
  type Standby,
  type ContentLayer,
} from '@lampstand/core';
import { findItem, loadMissingChapters, refreshLiveSlide, saveSettings } from './actions';
import { buildItemSlides } from './slides';
import { itemIn, useStore } from './store';
import { type ItemSlides, type SlideContext } from '../types';
import { CANVAS } from '../constants';

export function useSelectedItem(): ServiceItem | null {
  const id = useStore((s) => s.selectedItemId);
  useStore((s) => s.service);
  useStore((s) => s.adhoc);
  return findItem(id);
}

/** Everything slides are built from (songs, themes, media, settings, Bibles), kept current. */
export function useSlideContext(): SlideContext {
  const songs = useStore((s) => s.songs);
  const themes = useStore((s) => s.themes);
  const media = useStore((s) => s.media);
  const settings = useStore((s) => s.settings);
  const versions = useStore((s) => s.versions);
  const verseCounts = useStore((s) => s.verseCounts);
  const bookNames = useStore((s) => s.bookNames);
  const chapters = useStore((s) => s.chapters);
  return useMemo(
    () => ({ songs, themes, media, settings, versions, verseCounts, bookNames, chapters }),
    [songs, themes, media, settings, versions, verseCounts, bookNames, chapters],
  );
}

/** Reactive slides for an item; loads missing Bible chapters on demand. */
export function useItemSlides(item: ServiceItem | null): ItemSlides & { loading: boolean } {
  const ctx = useSlideContext();
  const { verseCounts } = ctx;
  const built = useMemo(
    () => (item ? buildItemSlides(item, ctx) : { slides: [], missing: [] }),
    [item, ctx],
  );
  useEffect(() => {
    void loadMissingChapters(built.missing);
  }, [built.missing]);
  const loading =
    built.missing.length > 0 ||
    (item?.kind === 'scripture' && !verseCounts[item.versionIds[0] ?? '']);
  return { ...built, loading };
}

const DEFAULTS = defaultSettings();

/** Media kinds by id, for resolving logo/off-air/prop picks the same way main does. */
export function useMediaKindOf(): (id: string) => string | undefined {
  const media = useStore((s) => s.media);
  return useMemo(() => {
    const kinds = new Map(media.map((m) => [m.id, m.kind]));
    return (id: string) => kinds.get(id);
  }, [media]);
}

/** The logo as the projector draws it (Logo button, and the "Logo" off-air screen). */
export function useLogo(): ScreenVisual {
  const logo = useStore((s) => s.settings?.logo ?? DEFAULTS.logo);
  const kindOf = useMediaKindOf();
  return useMemo(() => resolveLogo(logo, kindOf), [logo, kindOf]);
}

/** The off-air screen, resolved the same way main does for the projector. */
export function useStandby(): Standby {
  const offAir = useStore((s) => s.settings?.offAir ?? DEFAULTS.offAir);
  const logo = useStore((s) => s.settings?.logo ?? DEFAULTS.logo);
  const kindOf = useMediaKindOf();
  return useMemo(() => resolveStandby(offAir, logo, kindOf), [offAir, logo, kindOf]);
}

/**
 * Is there a main output (a projector assigned as Main, or the rehearsal Output window)?
 * When there isn't, the Program monitor plays the video's sound instead, so it's never silent.
 */
export function useHasMainOutput(): boolean {
  const windowMode = useStore((s) => s.settings?.windowMode ?? false);
  const main = useStore((s) => s.displays.some((d) => d.role === 'main'));
  return windowMode || main;
}

/** The current time, re-read every `ms` while `active` (clocks, timers, playheads). */
export function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

/** Is this item part of the open service plan (as opposed to an ad-hoc library pick)? */
export function useInService(item: ServiceItem | null): boolean {
  return useStore((s) => !!item && !!s.service?.items.some((x) => x.id === item.id));
}

export const isPicture = (kind: string | undefined): kind is 'image' | 'video' =>
  kind === 'image' || kind === 'video';

/** Library images and videos: what the logo, off-air screen and props can show. */
export function usePictures(): MediaItem[] {
  const media = useStore((s) => s.media);
  return useMemo(() => media.filter((m) => isPicture(m.kind)), [media]);
}

/** Is the overlay (message, prop) with this id on screen? */
export function useOverlayLive(id: string): boolean {
  return useStore((s) => !!s.live?.program.overlays.some((o) => o.id === id));
}

type ListKey = 'props' | 'messages' | 'timers';

/** A list kept in settings (props, message templates, timers) and a way to save it. */
export function useSettingsList<K extends ListKey>(
  key: K,
): [Settings[K], (next: Settings[K]) => void] {
  const list = useStore((s) => s.settings?.[key] ?? DEFAULTS[key]);
  return [list, (next) => void saveSettings({ [key]: next })];
}

/**
 * Scale that fits the 1920×1080 slide canvas into an element's width, kept up to date as it
 * resizes. Draw at canvas size inside it with `transform: scale(scale)`.
 */
export function useCanvasScale<T extends HTMLElement = HTMLDivElement>(
  initial = 0.4,
): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [scale, setScale] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CANVAS.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

/**
 * An element's width, kept up to date as it is resized (0 until it is first measured): for
 * toolbars that drop labels and extras when their pane is narrow.
 */
export function useWidth<T extends HTMLElement = HTMLDivElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** An element's size, kept up to date as it is resized (0 × 0 until it is first measured). */
export function useSize<T extends HTMLElement = HTMLDivElement>(): [
  RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void =>
      setSize((s) =>
        s.width === el.clientWidth && s.height === el.clientHeight
          ? s
          : { width: el.clientWidth, height: el.clientHeight },
      );
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** What of a slide's words the room sees (its key and timings aside). */
const shown = (c: ContentLayer | null | undefined): string =>
  c
    ? JSON.stringify([c.blocks, c.objects, c.reference, c.copyright, c.theme.id, c.theme.updatedAt])
    : '';

/**
 * The live slide was edited after it went on screen: the room still sees the old version. Edits
 * never reach the screen by themselves (an operator can fix a typo calmly); `update` puts the
 * new version up, in place, without a transition.
 */
export function useLiveEdited(): { edited: boolean; update: () => void } {
  const cursor = useStore((s) => s.liveCursor);
  const program = useStore((s) => s.live?.program.content ?? null);
  const item = useStore((s) => itemIn(s, cursor?.itemId));
  const { slides } = useItemSlides(item);
  const slide = cursor ? slides[cursor.index] : undefined;
  const now = slide?.action.kind === 'content' ? slide.action.content : null;
  const edited = !!now && !!program && now.key === program.key && shown(now) !== shown(program);
  return { edited, update: () => void (cursor && refreshLiveSlide(cursor.itemId)) };
}

/**
 * The window follows the operator's look: light or dark, and the text size (every UI text
 * size reads --text-scale). Every control-side window uses it (main, Live console, multi-view).
 */
export function useUiTheme(title?: string): void {
  const uiTheme = useStore((s) => s.settings?.uiTheme ?? 'dark');
  const textScale = useStore((s) => s.settings?.textScale ?? 1);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.documentElement.style.setProperty('--text-scale', String(textScale));
    if (title) document.title = title;
  }, [uiTheme, textScale, title]);
}
