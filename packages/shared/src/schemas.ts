import { z } from "zod";
import { CATEGORIES } from "./constants.js";

export const providerCategorySchema = z.enum(CATEGORIES);

const queryString = z.string().min(1).max(80);
const timeoutMs = z.number().int().min(1000).max(60_000).optional();
const concurrency = z.number().int().min(1).max(50).optional();

export const checkRequestSchema = z.object({
  query: queryString,
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs,
  concurrency,
});

export const MAX_BULK_QUERIES = 100;
export const MAX_COMPARE_QUERIES = 10;

export const bulkCheckRequestSchema = z.object({
  queries: z.array(queryString).min(1).max(MAX_BULK_QUERIES),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs,
  concurrency,
});

export const batchCheckRequestSchema = bulkCheckRequestSchema.extend({
  batchConcurrency: z.number().int().min(1).max(20).optional(),
});

export const findFreeNamesRequestSchema = z.object({
  queries: z.array(queryString).min(1).max(MAX_BULK_QUERIES),
  requireAvailableProviders: z.array(z.string()).optional(),
  requireAvailableCategories: z.array(providerCategorySchema).optional(),
  timeoutMs,
  concurrency,
  batchConcurrency: z.number().int().min(1).max(20).optional(),
});

export const compareRequestSchema = z.object({
  queries: z.array(queryString).min(1).max(MAX_COMPARE_QUERIES),
  categories: z.array(providerCategorySchema).optional(),
  providers: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  timeoutMs,
  concurrency,
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
