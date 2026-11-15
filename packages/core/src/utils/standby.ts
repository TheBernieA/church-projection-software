import type { Settings } from '../schemas/settings';
import type { ScreenVisual, Standby } from '../types/screen';

type MediaKindOf = (id: string) => string | undefined;

/** A library pick, if it still exists and is a picture (not deleted, not audio). */
function picture(mediaId: string | undefined, mediaKind: MediaKindOf): ScreenVisual | null {
  if (!mediaId) return null;
  const kind = mediaKind(mediaId);
  return kind === 'image' || kind === 'video' ? { kind, mediaId } : null;
}

/** The logo as drawn; a missing image/video falls back to the text card, never a broken frame. */
export function resolveLogo(logo: Settings['logo'], mediaKind: MediaKindOf): ScreenVisual {
  return (
    (logo.kind === 'media' && picture(logo.mediaId, mediaKind)) || {
      kind: 'logo',
      text: logo.text.trim() || 'Lampstand',
    }
  );
}

/** The off-air screen as drawn: black, the logo, or a picture (falling back to the logo). */
export function resolveStandby(
  offAir: Settings['offAir'],
  logo: Settings['logo'],
  mediaKind: MediaKindOf,
): Standby {
  if (offAir.kind === 'black') return { kind: 'black' };
  return (
    (offAir.kind === 'media' && picture(offAir.mediaId, mediaKind)) || resolveLogo(logo, mediaKind)
  );
}

/** Identity of a visual: equal keys mean nothing to rebuild (a looping video never restarts). */
export function standbyKey(s: Standby): string {
  return s.kind === 'black'
    ? 'black'
    : s.kind === 'logo'
      ? `logo|${s.text}`
      : `${s.kind}|${s.mediaId}`;
}
