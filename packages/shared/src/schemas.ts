import { z } from "zod";

export const providerCategorySchema = z.enum([
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
]);

export const checkRequestSchema = z.object({
  query: z.string().min(1).max(80),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  concurrency: z.number().int().min(1).max(50).optional(),
});

export const checkStatusSchema = z.enum([
  "available",
  "taken",
  "partial",
  "manual_verify",
  "unknown",
  "error",
]);
