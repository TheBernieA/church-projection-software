import type { LogoStyle, Settings } from '../schemas/settings';
import type { ScreenVisual, Standby } from '../types/screen';

type MediaKindOf = (id: string) => string | undefined;
/** Logo settings; older files may have no style yet. */
type LogoSettings = Omit<Settings['logo'], 'style'> & { style?: LogoStyle };

/** A library pick, if it still exists and is a picture (not deleted, not audio). */
function picture(mediaId: string | undefined, mediaKind: MediaKindOf): ScreenVisual | null {
  if (!mediaId) return null;
  const kind = mediaKind(mediaId);
  return kind === 'image' || kind === 'video' ? { kind, mediaId } : null;
}

/** The logo as drawn; a missing image/video falls back to the text card, never a broken frame. */
export function resolveLogo(logo: LogoSettings, mediaKind: MediaKindOf): ScreenVisual {
  return (
    (logo.kind === 'media' && picture(logo.mediaId, mediaKind)) || {
      kind: 'logo',
      text: logo.text.trim() || 'Lampstand',
      ...(logo.style ? { style: logo.style } : {}),
      ...(logo.tagline?.trim() ? { tagline: logo.tagline.trim() } : {}),
    }
  );
}

/** The off-air screen as drawn: black, the logo, or a picture (falling back to the logo). */
export function resolveStandby(
  offAir: Settings['offAir'],
  logo: LogoSettings,
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
      ? `logo|${s.style ?? ''}|${s.text}|${s.tagline ?? ''}`
      : `${s.kind}|${s.mediaId}`;
}
