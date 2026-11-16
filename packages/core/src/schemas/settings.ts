import { z } from 'zod';
import { TimerDefSchema } from './timers';
import { PropPositionSchema } from './scene';

export const OutputRoleSchema = z.enum(['main', 'stage', 'secondary', 'none']);
export type OutputRole = z.infer<typeof OutputRoleSchema>;

/** Saved display fingerprint so hot-plugged projectors are re-mapped automatically (§7.3). */
export const DisplayAssignmentSchema = z.object({
  fingerprint: z.string().max(300),
  label: z.string().max(200),
  role: OutputRoleSchema,
});
export type DisplayAssignment = z.infer<typeof DisplayAssignmentSchema>;

/** Name-card looks for the logo and off-air screen. */
export const LogoStyleSchema = z.enum([
  'halo',
  'rays',
  'aurora',
  'bokeh',
  'gold',
  'minimal',
  'classic',
]);
export type LogoStyle = z.infer<typeof LogoStyleSchema>;

export const SettingsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    uiTheme: z.enum(['dark', 'light']).default('dark'),
    /** Size of the control window's text (1 = 100%); icons and layout keep their size. */
    textScale: z.number().min(0.85).max(1.4).default(1),
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
    /**
     * Clicking a slide sends it straight to the screen (the default). Off = "Preview first":
     * clicks load Preview and Go live (Space) sends it.
     */
    clickGoesLive: z.boolean().default(true),
    /** Audience message templates; {tokens} are filled in when shown. */
    messages: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          name: z.string().min(1).max(60),
          template: z.string().min(1).max(300),
          style: z.enum(['ticker', 'lower-third']).default('lower-third'),
        }),
      )
      .max(100)
      .default([
        {
          id: 'msg-nursery',
          name: 'Nursery',
          template: 'Parent of {number}, please come to the nursery',
          style: 'lower-third',
        },
        {
          id: 'msg-car',
          name: 'Car',
          template: 'Owner of the car {plate}, please see an usher',
          style: 'ticker',
        },
      ]),
    /** Props: library images/videos or text overlaid on top of everything. */
    props: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          name: z.string().min(1).max(60),
          mediaId: z.string().max(64).optional(),
          text: z.string().max(200).optional(),
          position: PropPositionSchema.default('top-right'),
        }),
      )
      .max(100)
      .default([]),
    /** Saved timers (Timers bin). */
    timers: z
      .array(TimerDefSchema)
      .max(50)
      .default([
        { id: 'timer-preservice', name: 'Pre-service', kind: 'countdown', durationSec: 300 },
        { id: 'timer-sermon', name: 'Sermon', kind: 'elapsed' },
      ]),
    /** Item kinds that go straight to program on click when "Preview first" is on (§3.4). */
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
        /** Look of the name card: its moving background and lettering. */
        style: LogoStyleSchema.default('halo'),
        /** Optional smaller line under the name (e.g. "Welcome home"). */
        tagline: z.string().max(120).optional(),
        mediaId: z.string().max(64).optional(),
      })
      .default({ kind: 'text', text: 'Lampstand', style: 'halo' }),
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
