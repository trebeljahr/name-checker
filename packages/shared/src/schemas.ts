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

export const MAX_BULK_QUERIES = 100;

export const bulkCheckRequestSchema = z.object({
  queries: z.array(z.string().min(1).max(80)).min(1).max(MAX_BULK_QUERIES),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  concurrency: z.number().int().min(1).max(50).optional(),
});

export const batchCheckRequestSchema = z.object({
  queries: z.array(z.string().min(1).max(80)).min(1).max(100),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  concurrency: z.number().int().min(1).max(50).optional(),
  batchConcurrency: z.number().int().min(1).max(20).optional(),
});

export const findFreeNamesRequestSchema = z.object({
  queries: z.array(z.string().min(1).max(80)).min(1).max(100),
  requireAvailableProviders: z.array(z.string()).optional(),
  requireAvailableCategories: z.array(providerCategorySchema).optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  concurrency: z.number().int().min(1).max(50).optional(),
  batchConcurrency: z.number().int().min(1).max(20).optional(),
});

export const MAX_COMPARE_QUERIES = 10;

export const compareRequestSchema = z.object({
  queries: z.array(z.string().min(1).max(80)).min(1).max(MAX_COMPARE_QUERIES),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  concurrency: z.number().int().min(1).max(50).optional(),
  batchConcurrency: z.number().int().min(1).max(10).optional(),
});

export const checkStatusSchema = z.enum([
  "available",
  "taken",
  "partial",
  "manual_verify",
  "unknown",
  "error",
]);
