import { z } from 'zod';
import { FILTER_KINDS } from './processing';

/**
 * A sound desk profile: where a desk keeps each channel's EQ, cuts, gate and compressor in its
 * network control protocol, and how it scales their values. Profiles are data, so a desk Lampstand
 * doesn't know yet only needs a profile file (Settings › Audio › Sound desk › Import profile), not
 * new code. Addresses are templates: `{ch}` is the channel number, `{band}` the EQ band (both
 * formatted as the profile says).
 */

/** An OSC address (a template), checked so it can only ever be an address. */
const Address = z
  .string()
  .min(2)
  .max(120)
  .regex(/^\/[A-Za-z0-9_/{}.-]+$/);

/** An on/off control (sent as int 0/1, or float). */
export const DeskSwitchSchema = z.object({
  address: Address,
  type: z.enum(['i', 'f']).default('i'),
});

/**
 * A value control. `lin` and `log` map min…max (a log scale may run high to low, as an X32's Q
 * does); `normalized`: the desk takes 0…1 for that range (else the value itself). `steps`: the desk
 * takes the index of the nearest of these values.
 */
export const DeskParamSchema = z.object({
  address: Address,
  scale: z.enum(['lin', 'log', 'steps']),
  min: z.number().default(0),
  max: z.number().default(1),
  steps: z.array(z.number()).max(64).optional(),
  normalized: z.boolean().default(true),
  type: z.enum(['f', 'i']).default('f'),
});
export type DeskParam = z.infer<typeof DeskParamSchema>;

export const DeskProfileSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  /** Shown beside the profile (where it came from, what's been tested). */
  note: z.string().max(300).optional(),
  transport: z.literal('osc-udp'),
  port: z.number().int().min(1).max(65_535),
  channels: z.number().int().min(1).max(128),
  /** Channel 4 as "04" (pad2) or "4" (plain) in addresses; bands likewise. */
  channelFormat: z.enum(['pad2', 'plain']).default('pad2'),
  bandFormat: z.enum(['pad2', 'plain']).default('plain'),
  /** Asked to check the desk answers (any reply counts). */
  probe: Address,
  /** The channel's name, if the desk has one to read. */
  channelName: Address.optional(),
  eq: z.object({
    on: DeskSwitchSchema,
    bands: z.number().int().min(1).max(16),
    /** Each band's shape, as the number the desk uses for each kind it has (none: bells). */
    type: z
      .object({
        address: Address,
        kinds: z.partialRecord(z.enum(FILTER_KINDS), z.number().int().min(0).max(31)),
      })
      .optional(),
    hz: DeskParamSchema,
    db: DeskParamSchema,
    q: DeskParamSchema,
  }),
  lowCut: z
    .object({
      on: DeskSwitchSchema,
      hz: DeskParamSchema,
      slopes: z.array(z.number().int().min(6).max(96)).min(1).max(8).default([12]),
    })
    .optional(),
  highCut: z
    .object({
      on: DeskSwitchSchema,
      hz: DeskParamSchema,
      slopes: z.array(z.number().int().min(6).max(96)).min(1).max(8).default([12]),
    })
    .optional(),
  gate: z.object({ on: DeskSwitchSchema, threshold: DeskParamSchema }).optional(),
  comp: z
    .object({
      on: DeskSwitchSchema,
      threshold: DeskParamSchema,
      ratio: DeskParamSchema,
      attack: DeskParamSchema,
      release: DeskParamSchema,
      makeup: DeskParamSchema,
    })
    .optional(),
});
export type DeskProfile = z.infer<typeof DeskProfileSchema>;

/** Where the desk is, and which profile speaks to it. */
export const DeskSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  profile: z.string().max(60).default('behringer-x32'),
  host: z
    .string()
    .trim()
    .max(253)
    .regex(/^[A-Za-z0-9.:\-[\]]*$/)
    .default(''),
  /** 0: the profile's own port. */
  port: z.number().int().min(0).max(65_535).default(0),
});
export type DeskSettings = z.infer<typeof DeskSettingsSchema>;

/** A file holding a desk profile (Settings › Audio › Sound desk › Import profile). */
export const DESK_PROFILE_FORMAT = 'lampstand-desk-profile';
export const DeskProfileFileSchema = z.object({
  format: z.literal(DESK_PROFILE_FORMAT),
  version: z.literal(1),
  profile: DeskProfileSchema,
});
