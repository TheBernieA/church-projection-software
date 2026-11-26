import { z } from 'zod';
import { IdSchema } from './common';

/**
 * A channel's processing in a form that belongs to no one device: a list of filters (bells,
 * shelves, notches, low and high cuts), a gate and a compressor. Lampstand's own channels, saved
 * presets, imported EQ files and sound desks all convert to and from it, and `fitProcessing`
 * adapts it to what a destination can do (see `processing.ts`).
 */
export const FILTER_KINDS = [
  'bell',
  'lowShelf',
  'highShelf',
  'notch',
  'lowCut',
  'highCut',
] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

export const FilterSchema = z.object({
  kind: z.enum(FILTER_KINDS),
  on: z.boolean().default(true),
  hz: z.number().min(10).max(24_000),
  /** Bells and shelves only. */
  db: z.number().min(-30).max(30).default(0),
  /** Width (bells, notches) or resonance; higher is narrower. */
  q: z.number().min(0.05).max(40).default(1),
  /** Cuts only: dB per octave. */
  slope: z.number().int().min(6).max(96).optional(),
});
export type Filter = z.infer<typeof FilterSchema>;

export const GateSettingsSchema = z.object({
  on: z.boolean(),
  thresholdDb: z.number().min(-100).max(0),
});
export const CompSettingsSchema = z.object({
  on: z.boolean(),
  thresholdDb: z.number().min(-80).max(20),
  ratio: z.number().min(1).max(100),
  attackMs: z.number().min(0).max(1000),
  releaseMs: z.number().min(1).max(10_000),
  makeupDb: z.number().min(-20).max(48),
});

export const ProcessingSchema = z.object({
  /** Off: the EQ's bands are bypassed (cuts still apply). */
  eqOn: z.boolean().default(true),
  filters: z.array(FilterSchema).max(32),
  gate: GateSettingsSchema.optional(),
  comp: CompSettingsSchema.optional(),
});
export type Processing = z.infer<typeof ProcessingSchema>;

/** What a preset holds: the EQ alone (with the cuts), or everything (gate and compressor too). */
export const PRESET_SCOPES = ['all', 'eq'] as const;
export type PresetScope = (typeof PRESET_SCOPES)[number];

/** A preset the operator saved (or imported), kept in settings. */
export const ProcessingPresetSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(60),
  scope: z.enum(PRESET_SCOPES),
  processing: ProcessingSchema,
  /** Where it came from, when imported ("Equalizer APO file", "X32 channel 4"). */
  source: z.string().max(80).optional(),
});
export type ProcessingPreset = z.infer<typeof ProcessingPresetSchema>;

export const MAX_PRESETS = 200;

/** A file of presets, to move them between computers or share them. */
export const PRESET_FILE_FORMAT = 'lampstand-processing-presets';
export const PresetFileSchema = z.object({
  format: z.literal(PRESET_FILE_FORMAT),
  version: z.literal(1),
  presets: z.array(ProcessingPresetSchema).max(500),
});
export type PresetFile = z.infer<typeof PresetFileSchema>;
