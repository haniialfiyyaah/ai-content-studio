import { z } from "zod";
import {
  ContentModeSchema,
  ProductionModeSchema,
  ProjectStatusSchema,
} from "./enums";

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  objective: z.string().nullable(),
  contentMode: ContentModeSchema,
  status: ProjectStatusSchema,
  timezone: z.string().min(1),
  defaultProductionMode: ProductionModeSchema,
  defaultModelId: z.string().nullable(),
  preferredDestinations: z.unknown(),
  creativeContextVersion: z.number().int().positive(),
  settingsVersion: z.number().int().positive(),
  activatedAt: z.string().datetime().nullable(),
  pausedAt: z.string().datetime().nullable(),
  stoppedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  objective: z.string().max(4000).optional(),
  contentMode: ContentModeSchema.default("independent"),
  timezone: z.string().default("UTC"),
  defaultProductionMode: ProductionModeSchema.default("hybrid"),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const PatchProjectInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  objective: z.string().max(4000).nullable().optional(),
  contentMode: ContentModeSchema.optional(),
  timezone: z.string().optional(),
  defaultProductionMode: ProductionModeSchema.optional(),
  preferredDestinations: z.unknown().optional(),
});
export type PatchProjectInput = z.infer<typeof PatchProjectInputSchema>;

/** Optimistic-lock body shared by activate / pause / resume / stop. */
export const ProjectLifecycleInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
});
export type ProjectLifecycleInput = z.infer<typeof ProjectLifecycleInputSchema>;
