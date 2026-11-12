import { z } from 'zod';

export const OutputRoleSchema = z.enum(['main', 'stage', 'secondary', 'none']);
export type OutputRole = z.infer<typeof OutputRoleSchema>;

/** Saved display fingerprint so hot-plugged projectors are re-mapped automatically (§7.3). */
export const DisplayAssignmentSchema = z.object({
  fingerprint: z.string().max(300),
  label: z.string().max(200),
  role: OutputRoleSchema,
});
export type DisplayAssignment = z.infer<typeof DisplayAssignmentSchema>;

export const SettingsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    uiTheme: z.enum(['dark', 'light']).default('dark'),
    uiScale: z.number().min(0.9).max(1.5).default(1),
    language: z.string().max(35).default('en'),
    libraryPath: z.string().max(1000).optional(),
    displays: z.array(DisplayAssignmentSchema).max(16).default([]),
    /** Show outputs as normal windows instead of fullscreen (rehearsal / OBS window capture). */
    windowMode: z.boolean().default(false),
    defaultThemes: z
      .object({
        scripture: z.string().max(64).optional(),
        lyrics: z.string().max(64).optional(),
        text: z.string().max(64).optional(),
      })
      .default({}),
    defaultBibleVersion: z.string().max(32).default('kjv'),
    scripture: z
      .object({
        versesPerSlide: z.enum(['one', 'fit']).default('fit'),
        maxCharsPerSlide: z.number().int().min(60).max(1200).default(320),
      })
      .default({ versesPerSlide: 'fit', maxCharsPerSlide: 320 }),
    lyrics: z
      .object({ maxLinesPerSlide: z.number().int().min(1).max(12).default(4) })
      .default({ maxLinesPerSlide: 4 }),
    /** Item kinds that go straight to program on click (§3.4 "Live editing"). */
    liveEditingKinds: z.array(z.string().max(32)).default([]),
    shortcuts: z.record(z.string().max(60), z.string().max(60)).default({}),
    ccliLicenseNumber: z.string().max(20).optional(),
    lastServiceId: z.string().max(64).optional(),
    layout: z.record(z.string().max(60), z.number()).default({}),
    /** The logo: shown by the Logo button (L), and as the off-air screen when set to "Logo". */
    logo: z
      .object({
        kind: z.enum(['text', 'media']).default('text'),
        text: z.string().max(80).default('Lampstand'),
        mediaId: z.string().max(64).optional(),
      })
      .default({ kind: 'text', text: 'Lampstand' }),
    /** What the projector shows when nothing is live: black, the logo card, or a library image/video. */
    offAir: z
      .object({
        kind: z.enum(['black', 'logo', 'media']).default('logo'),
        mediaId: z.string().max(64).optional(),
      })
      .default({ kind: 'logo' }),
    onboardingComplete: z.boolean().default(false),
    updateChecks: z.boolean().default(false),
  })
  .loose();
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

/** A full-screen picture: the logo card (text), or a library image or video. */
export type ScreenVisual =
  { kind: 'logo'; text: string } | { kind: 'image' | 'video'; mediaId: string };

/** What an output shows when nothing is live (the off-air screen). */
export type Standby = { kind: 'black' } | ScreenVisual;

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
