import { useEffect, useMemo, useState } from 'react';
import {
  defaultSettings,
  resolveLogo,
  resolveStandby,
  type MediaItem,
  type ScreenVisual,
  type ServiceItem,
  type Settings,
  type Standby,
} from '@lampstand/core';
import { findItem, loadMissingChapters, saveSettings } from './actions';
import { buildItemSlides, type ItemSlides } from './slides';
import { useStore } from './store';

export function useSelectedItem(): ServiceItem | null {
  const id = useStore((s) => s.selectedItemId);
  useStore((s) => s.service);
  useStore((s) => s.adhoc);
  return findItem(id);
}

/** Reactive slides for an item; loads missing Bible chapters on demand. */
export function useItemSlides(item: ServiceItem | null): ItemSlides & { loading: boolean } {
  const songs = useStore((s) => s.songs);
  const themes = useStore((s) => s.themes);
  const media = useStore((s) => s.media);
  const settings = useStore((s) => s.settings);
  const versions = useStore((s) => s.versions);
  const verseCounts = useStore((s) => s.verseCounts);
  const chapters = useStore((s) => s.chapters);
  const built = useMemo(
    () =>
      item
        ? buildItemSlides(item, { songs, themes, media, settings, versions, verseCounts, chapters })
        : { slides: [], missing: [] },
    [item, songs, themes, media, settings, versions, verseCounts, chapters],
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
