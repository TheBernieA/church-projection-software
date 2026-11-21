import { ColorSchema } from './common';
import { z } from 'zod';
import { MediaTransitionSchema, TransitionSpecSchema } from './theme';
import { StageLayoutSchema } from './stage';
import { NdiFeedSchema, StreamSettingsSchema } from './stream';
import { MixerSchema } from './mixer';
import { SurfacesSettingsSchema } from './surfaces';
import { OnlineBibleSchema } from './scripture';
import { TimerDefSchema } from './timers';
import { CameraSettingsSchema, InputTransitionSchema, PropPositionSchema } from './scene';

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

/**
 * A screen mask: shapes or hides part of an output (creative stages, a screen behind a pillar).
 * Percentages are of the output's width/height. `image` uses a picture's brightness: white
 * shows, black hides.
 */
export const ScreenMaskSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(40),
  shape: z.enum(['rect', 'ellipse', 'image']),
  top: z.number().min(0).max(45).default(0),
  right: z.number().min(0).max(45).default(0),
  bottom: z.number().min(0).max(45).default(0),
  left: z.number().min(0).max(45).default(0),
  /** Corner rounding for `rect`, as % of the shorter side. */
  radius: z.number().min(0).max(50).default(0),
  mediaId: z.string().max(64).optional(),
});
export type ScreenMask = z.infer<typeof ScreenMaskSchema>;

/**
 * The layers of a screen, in stacking order from the bottom. The one list behind Looks, clear
 * groups, clearing and bringing back.
 */
export const LookLayerSchema = z.enum([
  'background',
  'media',
  'content',
  'announcements',
  'messages',
  'props',
]);
export type LookLayer = z.infer<typeof LookLayerSchema>;
const LAYER_COUNT = LookLayerSchema.options.length;

/** One corner's nudge for corner pinning (keystone), in % of the output's width and height. */
export const CornerOffsetSchema = z.object({
  x: z.number().min(-50).max(50).default(0),
  y: z.number().min(-50).max(50).default(0),
});
export type CornerOffset = z.infer<typeof CornerOffsetSchema>;

const NO_CORNER = { x: 0, y: 0 };

/**
 * How one screen's picture is fitted to it (Settings › Screens): its corners pinned where the
 * projector really lands (keystone), scaled and moved, flipped for rear projection, and its colour
 * matched to the other screens. Applied by that output window only; the slides don't change.
 */
export const ScreenAdjustSchema = z.object({
  corners: z
    .object({
      tl: CornerOffsetSchema,
      tr: CornerOffsetSchema,
      br: CornerOffsetSchema,
      bl: CornerOffsetSchema,
    })
    .default({ tl: NO_CORNER, tr: NO_CORNER, br: NO_CORNER, bl: NO_CORNER }),
  /** 1 = the full screen. */
  scale: z.number().min(0.5).max(1.5).default(1),
  /** Moves the picture, in % of the screen's width and height. */
  offsetX: z.number().min(-50).max(50).default(0),
  offsetY: z.number().min(-50).max(50).default(0),
  /** Mirror left-right / upside down (rear projection, ceiling mounts). */
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  /** Colour matching: 1 = unchanged; hue in degrees. */
  brightness: z.number().min(0.2).max(2).default(1),
  contrast: z.number().min(0.2).max(2).default(1),
  saturate: z.number().min(0).max(2).default(1),
  hue: z.number().min(-180).max(180).default(0),
});
export type ScreenAdjust = z.infer<typeof ScreenAdjustSchema>;

/**
 * Edge blending: several projectors side by side make one wide picture, overlapping a little;
 * the overlaps fade so the seams can't be seen. The audience screens take part, left to right in
 * `order` (by display fingerprint), else as the displays are arranged.
 */
export const EdgeBlendSchema = z.object({
  enabled: z.boolean().default(false),
  /** How much neighbouring screens overlap, in % of one screen's width. */
  overlap: z.number().min(0).max(40).default(15),
  /** The projectors' gamma: the fade is shaped so the overlap is as bright as the rest. */
  gamma: z.number().min(1).max(3).default(2.2),
  order: z.array(z.string().max(300)).max(8).default([]),
  /** Rehearsal (window mode): how many windows stand in for the projectors. */
  windows: z.number().int().min(2).max(4).default(2),
});
export type EdgeBlend = z.infer<typeof EdgeBlendSchema>;

/** A theme id for each kind of slide (any may be left out). */
export const KindThemesSchema = z.object({
  scripture: z.string().max(64).optional(),
  lyrics: z.string().max(64).optional(),
  text: z.string().max(64).optional(),
});
export type KindThemes = z.infer<typeof KindThemesSchema>;
export type KeyFeedMode = 'off' | 'green' | 'blue' | 'black';

/**
 * A Look: which layers each kind of screen shows ("Lobby": secondary screens show only the
 * background and announcements). Switching looks is instant and live.
 */
export const LookSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(40),
  main: z.array(LookLayerSchema).max(LAYER_COUNT),
  secondary: z.array(LookLayerSchema).max(LAYER_COUNT),
});
export type Look = z.infer<typeof LookSchema>;

export const SettingsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    uiTheme: z.enum(['dark', 'light']).default('dark'),
    /** Size of the control window's text (1 = 100%); icons and layout keep their size. */
    textScale: z.number().min(0.85).max(1.4).default(1),
    /** Colours the operator saved in the colour picker (newest first). */
    customColors: z.array(ColorSchema).max(20).default([]),
    /** Audio inputs left out of the lists (a desk shows many; the operator picks the few used). */
    hiddenAudioInputs: z.array(z.string().max(300)).max(256).default([]),
    /** Words size on the audience screens, over each theme's own (1 = as the theme has it). */
    wordsScale: z.number().min(0.5).max(2).default(1),
    /** Words across the audience screens, whatever the theme says ('theme': as it has them). */
    wordsAlign: z.enum(['theme', 'left', 'center', 'right']).default('theme'),
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
    /** Bibles read from an API as they're used (keys are kept encrypted, not here). */
    onlineBibles: z.array(OnlineBibleSchema).max(20).default([]),
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
    /**
     * Picking a verse in the Bible or a picture or video in the media bin puts it on screen at
     * once. Off (the default): it opens in the slides, and a click there shows it, so a pick
     * never interrupts what the room is watching.
     */
    pickShowsNow: z.boolean().default(false),
    /** A video that goes live starts playing at once; off = it waits on its first frame for Play. */
    mediaAutoplay: z.boolean().default(true),
    /**
     * The default transitions (Show, bottom left): slides (unset: each theme's own) and media and
     * backgrounds (unset: the usual fades). An item can set its own slide transition.
     */
    transitions: z
      .object({
        slide: TransitionSpecSchema.optional(),
        media: MediaTransitionSchema.optional(),
      })
      .default({}),
    /** The video switcher (Media › Video input): what a click does, the Auto transition, PiP. */
    switcher: z
      .object({
        /** Clicking a camera: put it on Preview (then Cut / Auto), or straight on screen. */
        click: z.enum(['preview', 'program']).default('preview'),
        transition: InputTransitionSchema.default({ kind: 'fade', durationMs: 600 }),
        pip: z
          .object({
            corner: z.enum(['tl', 'tr', 'bl', 'br']).default('br'),
            size: z.number().min(0.15).max(0.5).default(0.3),
          })
          .default({ corner: 'br', size: 0.3 }),
      })
      .default({
        click: 'preview',
        transition: { kind: 'fade', durationMs: 600 },
        pip: { corner: 'br', size: 0.3 },
      }),
    /** Each camera's settings, by device id (Settings › Video, the camera's "…" menu). */
    cameras: z.record(z.string().max(300), CameraSettingsSchema).default({}),
    /**
     * Themes an output uses instead of the main screens' (Themes workspace), per kind of slide.
     * Empty: the same as the main screens.
     */
    outputThemes: z
      .object({
        alternate: KindThemesSchema.default({}),
        stream: KindThemesSchema.default({}),
      })
      .default({ alternate: {}, stream: {} }),
    /**
     * The alternate (HDMI) output as a key feed for a video mixer: only the words and props,
     * over a flat colour the mixer removes (green or blue: chroma key; black: luma key).
     */
    keyFeed: z
      .object({ mode: z.enum(['off', 'green', 'blue', 'black']).default('off') })
      .default({ mode: 'off' }),
    /** NDI feeds (Settings › NDI). */
    ndi: z.object({ feeds: z.array(NdiFeedSchema).max(4).default([]) }).default({ feeds: [] }),
    /** The sound desk (channels, buses). Absent in older settings: made from `stream.sound`. */
    mixer: MixerSchema.optional(),
    /** Livestream and recording (the toolbar's Live button). Stream keys are kept elsewhere. */
    stream: StreamSettingsSchema.default(StreamSettingsSchema.parse({})),
    /** Custom stage screen layouts, and which one stage screens show (null: Classic). */
    stageLayouts: z.array(StageLayoutSchema).max(30).default([]),
    stageLayoutId: z.string().max(64).nullable().default(null),
    /** A slide going live over a camera keeps the camera underneath (off: the slide replaces it). */
    keepCameraUnderWords: z.boolean().default(false),
    /** Room audio: where it plays, and how long Fade out takes. */
    audio: z
      .object({
        /** Output device for the room ('' = the computer's default output). */
        roomOutput: z.string().max(300).default(''),
        fadeSec: z.number().min(0.5).max(15).default(3),
        /** Every new track starts at this volume (null: it keeps the last one's). */
        startVolume: z.number().min(0).max(1).nullable().default(null),
        /** At the end of a track from a playlist: play the next one, or stop. */
        afterTrack: z.enum(['next', 'stop']).default('next'),
        /** After a playlist's last track, start again from the top. */
        loopPlaylist: z.boolean().default(false),
        /** Clicking a track in the Audio tab: listen first on this computer, or play it in the room. */
        click: z.enum(['listen', 'room']).default('listen'),
      })
      .default({
        roomOutput: '',
        fadeSec: 3,
        startVolume: null,
        afterTrack: 'next',
        loopPlaylist: false,
        click: 'listen',
      }),
    screenMasks: z.array(ScreenMaskSchema).max(20).default([]),
    /** Each screen's fitting and colour, by display fingerprint (or the rehearsal window's id). */
    screenAdjust: z.record(z.string().max(300), ScreenAdjustSchema).default({}),
    edgeBlend: EdgeBlendSchema.default({
      enabled: false,
      overlap: 15,
      gamma: 2.2,
      order: [],
      windows: 2,
    }),
    /** Saved Looks (the toolbar's Looks button switches between them). */
    looks: z.array(LookSchema).max(20).default([]),
    /** Which mask each kind of screen uses (null: none). */
    maskFor: z
      .object({ main: z.string().max(64).nullable(), secondary: z.string().max(64).nullable() })
      .default({ main: null, secondary: null }),
    /** Custom clear groups: one button that clears exactly these layers. */
    clearGroups: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          name: z.string().min(1).max(40),
          layers: z.array(LookLayerSchema).min(1).max(LAYER_COUNT),
        }),
      )
      .max(12)
      .default([]),
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
    /** Sound desks and controllers (MIDI, OSC) driving Lampstand, and cues sent back to them. */
    surfaces: SurfacesSettingsSchema.default(SurfacesSettingsSchema.parse({})),
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

/** Fresh defaults (a copy: zod hands out the same default objects on every parse). */
export function defaultSettings(): Settings {
  return structuredClone(SettingsSchema.parse({}));
}
