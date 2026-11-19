import { z } from "zod";

export const CreativeKitSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  languageDefault: z.string().nullable(),
  tone: z.string().nullable(),
  audience: z.string().nullable(),
  brandOrCreatorName: z.string().nullable(),
  doSay: z.array(z.unknown()),
  dontSay: z.array(z.unknown()),
  visualNotes: z.string().nullable(),
  brandAssetIds: z.array(z.unknown()),
  referenceProfileIds: z.array(z.unknown()),
  generationDefaults: z.record(z.unknown()),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CreativeKit = z.infer<typeof CreativeKitSchema>;

/** Body for POST /api/projects/:id/creative-kit — creates the next kit version. */
export const CreateCreativeKitInputSchema = z.object({
  languageDefault: z.string().max(64).nullable().optional(),
  tone: z.string().max(120).nullable().optional(),
  audience: z.string().max(200).nullable().optional(),
  brandOrCreatorName: z.string().max(200).nullable().optional(),
  doSay: z.array(z.string().max(500)).optional(),
  dontSay: z.array(z.string().max(500)).optional(),
  visualNotes: z.string().max(4000).nullable().optional(),
  brandAssetIds: z.array(z.string().uuid()).optional(),
  referenceProfileIds: z.array(z.string().uuid()).optional(),
  generationDefaults: z.record(z.unknown()).optional(),
});
export type CreateCreativeKitInput = z.infer<typeof CreateCreativeKitInputSchema>;
