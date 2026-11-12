import { z } from 'zod';

export const IdSchema = z.string().min(1).max(64);

export const EntityMetaSchema = z.object({
  id: IdSchema,
  schemaVersion: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Reserved for future accounts/sync (§6.5). Not used in v1. */
  ownerId: z.string().optional(),
  orgId: z.string().optional(),
});
export type EntityMeta = z.infer<typeof EntityMetaSchema>;

export const ColorSchema = z
  .string()
  .max(64)
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/, 'Invalid color');
