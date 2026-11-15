import type { Layer, Overlay, ServiceItem, Settings } from '@lampstand/core';
import { cmd } from './api';
import i18n from '../i18n';
import {
  buildItemSlides,
  type ItemSlides,
  type PresentableSlide,
  type SlideContext,
} from './slides';
import { attempt, loadChapter, toast, useStore, type Cursor } from './store';

const get = useStore.getState;

let lastNoOutputWarning = 0;
/** Live content with no output assigned goes nowhere — say so instead of failing silently. */
function warnIfNoOutput(): void {
  const s = get();
  if (!s.settings || s.settings.windowMode) return;
  if (s.displays.some((d) => d.role !== 'none')) return;
  if (Date.now() - lastNoOutputWarning < 30_000) return;
  lastNoOutputWarning = Date.now();
  toast(i18n.t('outputs.noneToast'), 'warning');
}

export function slideContext(): SlideContext {
  const s = get();
  return {
    songs: s.songs,
    themes: s.themes,
    media: s.media,
    settings: s.settings,
    versions: s.versions,
    verseCounts: s.verseCounts,
    chapters: s.chapters,
  };
}

export function findItem(itemId: string | null): ServiceItem | null {
  if (!itemId) return null;
  const s = get();
  if (s.adhoc?.id === itemId) return s.adhoc;
  return s.service?.items.find((i) => i.id === itemId) ?? null;
}

/** Load any Bible chapters an item still needs (cached + de-duplicated by the store). */
export function loadMissingChapters(missing: ItemSlides['missing']): Promise<unknown> {
  return Promise.all(missing.map((m) => loadChapter(m.versionId, m.book, m.chapter)));
}

/** Slides for an item; kicks off chapter loading if needed (returns [] until loaded). */
export function slidesFor(item: ServiceItem | null): PresentableSlide[] {
  if (!item) return [];
  const built = buildItemSlides(item, slideContext());
  void loadMissingChapters(built.missing);
  return built.slides;
}

async function safe(p: Promise<unknown>): Promise<void> {
  await attempt(() => p, 'errors.action');
}

function withFreshCountdown(slide: PresentableSlide): PresentableSlide {
  if (!slide.countdownSec || slide.action.kind !== 'content') return slide;
  const content = {
    ...slide.action.content,
    countdownTo: new Date(Date.now() + slide.countdownSec * 1000).toISOString(),
  };
  return { ...slide, action: { ...slide.action, content } };
}

/** Put a slide into Preview (green). Nothing changes on screen. */
export async function previewSlide(item: ServiceItem, index: number): Promise<void> {
  const slides = slidesFor(item);
  const slide = slides[index];
  if (!slide) return;
  useStore.setState({ previewCursor: { itemId: item.id, index } });
  if (slide.action.kind === 'content') {
    const next = slides[index + 1];
    await safe(
      cmd('live.setPreview', {
        content: slide.action.content,
        background: slide.action.background,
        next: next?.action.kind === 'content' ? next.action.content : null,
      }),
    );
  } else
    await safe(
      cmd('live.setPreview', {
        content: null,
        background: slide.action.kind === 'background' ? slide.action.background : null,
        // Waiting in preview = first frame, paused. It starts playing when it goes live.
        media:
          slide.action.kind === 'media'
            ? { ...slide.action.media, playing: false, position: 0 }
            : null,
        web: slide.action.kind === 'web' ? slide.action.web : null,
        next: null,
      }),
    );
}

/** Send a slide straight to Program (red). */
export async function goLiveSlide(
  item: ServiceItem,
  index: number,
  source: 'ui' | 'shortcut' = 'ui',
): Promise<void> {
  const slides = slidesFor(item);
  const raw = slides[index];
  if (!raw) return;
  warnIfNoOutput();
  const slide = withFreshCountdown(raw);
  const next = slides[index + 1];
  useStore.setState({ liveCursor: { itemId: item.id, index } });
  const a = slide.action;
  if (a.kind === 'content') {
    await safe(
      cmd(
        'live.goLive',
        {
          content: a.content,
          background: a.background,
          next: next?.action.kind === 'content' ? next.action.content : null,
        },
        source,
      ),
    );
  } else if (a.kind === 'media') {
    // Full-screen media replaces the slide on screen (the text is cleared; background stays).
    await safe(cmd('live.goLive', { media: a.media, content: null, next: null }, source));
  } else if (a.kind === 'web') {
    // A web page replaces the slide too; outputs show it in an isolated web view.
    await safe(cmd('live.goLive', { web: a.web, content: null, next: null }, source));
  } else {
    await safe(cmd('live.setBackground', { background: a.background }, source));
  }
  // Keep preview one step ahead so Space keeps walking forward.
  const pc = get().previewCursor;
  if (pc && pc.itemId === item.id && pc.index === index && next)
    await previewSlide(item, index + 1);
  scheduleAnnouncements(item, index);
}

/**
 * Re-send the live slide of an item after it changed (e.g. transposed chords), in place:
 * no transition for the room, no reset of the elapsed timer.
 */
export async function refreshLiveSlide(itemId: string): Promise<void> {
  const cur = get().liveCursor;
  const item = findItem(itemId);
  if (cur?.itemId !== itemId || !item) return;
  const slide = slidesFor(item)[cur.index];
  if (slide?.action.kind !== 'content') return;
  await safe(cmd('live.updateContent', { content: slide.action.content }));
}

/** Space/Enter: Preview → Program ("Preview first"), or the next slide when clicks go live. */
export async function goLive(source: 'ui' | 'shortcut' = 'shortcut'): Promise<void> {
  const s = get();
  if (s.settings?.clickGoesLive !== false) {
    // No Preview stage: Space walks forward through the live item, or starts the selected one.
    const selected = findItem(s.selectedItemId);
    if (s.liveCursor && selected && s.liveCursor.itemId === selected.id) return step(1);
    if (selected) return goLiveSlide(selected, 0, source);
    return;
  }
  const pc = s.previewCursor;
  const item = findItem(pc?.itemId ?? null);
  if (pc && item) return goLiveSlide(item, pc.index, source);
  const selected = findItem(s.selectedItemId);
  if (selected) return goLiveSlide(selected, 0, source);
}

export async function step(delta: 1 | -1): Promise<void> {
  const s = get();
  const cursor: Cursor | null = s.liveCursor ?? s.previewCursor;
  const item = findItem(cursor?.itemId ?? s.selectedItemId);
  if (!item) return;
  const slides = slidesFor(item);
  const idx = cursor && cursor.itemId === item.id ? cursor.index + delta : 0;
  if (idx < 0 || idx >= slides.length) return; // stop at item boundaries — never jump to the next song by accident
  await goLiveSlide(item, idx, 'shortcut');
}

export const clearLayer = (layer: Layer): Promise<void> => {
  if (layer === 'content' || layer === 'all' || layer === 'panic')
    useStore.setState({ liveCursor: null });
  stopAnnouncements();
  return safe(cmd('live.clearLayer', { layer }, 'shortcut'));
};

export const toggleMask = (mask: 'black' | 'logo' | 'freeze'): Promise<void> =>
  safe(cmd('live.setMask', { mask }, 'shortcut'));

/** Put an overlay (message, prop) on screen, replacing any with the same id. */
export function showOverlay(overlay: Overlay): Promise<void> {
  const others = (get().live?.program.overlays ?? []).filter((o) => o.id !== overlay.id);
  return safe(cmd('live.setOverlays', { overlays: [...others, overlay].slice(-10) }));
}

/** Take an overlay off screen (nothing to do if it isn't showing). */
export async function hideOverlay(id: string): Promise<void> {
  const current = get().live?.program.overlays ?? [];
  if (!current.some((o) => o.id === id)) return;
  await safe(cmd('live.setOverlays', { overlays: current.filter((o) => o.id !== id) }));
}

/** Save part of the settings (validated against the full schema in main). */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await attempt(() => cmd('settings.update', { patch }), 'errors.setting');
}

// ---------- Announcements loop (auto-advance while live) ----------
let loopTimer: ReturnType<typeof setTimeout> | null = null;
function stopAnnouncements(): void {
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = null;
}
function scheduleAnnouncements(item: ServiceItem, index: number): void {
  stopAnnouncements();
  if (item.kind !== 'announcements' || item.slides.length < 2) return;
  loopTimer = setTimeout(() => {
    const cur = get().liveCursor;
    if (cur?.itemId !== item.id || cur.index !== index) return;
    void goLiveSlide(item, (index + 1) % item.slides.length, 'ui');
  }, item.loopIntervalSec * 1000);
}

/** Wait until an item's slides can be built (e.g. Bible chapters loaded). */
export async function ensureItemReady(item: ServiceItem): Promise<PresentableSlide[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const built = buildItemSlides(item, slideContext());
    if (!built.missing.length) return built.slides;
    await loadMissingChapters(built.missing);
  }
  return [];
}

/**
 * Click-goes-live (the default): a click sends straight to the screen. With "Preview first"
 * on, clicks load Preview and Go live sends it (except item kinds set to live editing).
 */
export function clickGoesLive(kind?: ServiceItem['kind']): boolean {
  const s = get().settings;
  if (!s || s.clickGoesLive) return true;
  return !!kind && s.liveEditingKinds.includes(kind);
}

/** A slide was clicked: show it, or load Preview, following {@link clickGoesLive}. */
export function triggerSlide(item: ServiceItem, index: number): Promise<void> {
  useStore.setState({ editCursor: { itemId: item.id, index } });
  return clickGoesLive(item.kind) ? goLiveSlide(item, index) : previewSlide(item, index);
}

/** Show an ad-hoc item (from library or quick bar) in the slide grid, then preview or show it. */
export async function openAdhoc(
  item: ServiceItem,
  requested: 'select' | 'preview' | 'live' = 'preview',
): Promise<void> {
  useStore.setState({ adhoc: item, selectedItemId: item.id });
  if (requested === 'select') return;
  const mode = requested === 'preview' && clickGoesLive(item.kind) ? 'live' : requested;
  const slides = await ensureItemReady(item);
  if (!slides.length) return;
  if (mode === 'live') await goLiveSlide(item, 0);
  else await previewSlide(item, 0);
}
