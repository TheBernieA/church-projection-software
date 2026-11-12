import { useEffect, useMemo } from 'react';
import {
  defaultSettings,
  resolveLogo,
  resolveStandby,
  type ScreenVisual,
  type ServiceItem,
  type Standby,
} from '@lampstand/core';
import { findItem, loadMissingChapters } from './actions';
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

/** Media kinds by id, for resolving logo/off-air picks the same way main does. */
function useMediaKindOf(): (id: string) => string | undefined {
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
