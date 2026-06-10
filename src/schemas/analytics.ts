import { z } from "zod";
import {
  ANALYTICS_ACCESS_TYPES,
  ANALYTICS_GRANULARITIES
} from "../appstore/analytics.js";
import { DateRangeSchema } from "./common.js";

export const AppIdSchema = z.string().trim().min(1, "App ID is required.");

export const AnalyticsAccessTypeSchema = z.enum(ANALYTICS_ACCESS_TYPES);

export const AnalyticsGranularitySchema = z.enum(ANALYTICS_GRANULARITIES);

export const EnsureAnalyticsRequestOptionsSchema = z.object({
  app: AppIdSchema.optional(),
  accessType: AnalyticsAccessTypeSchema.default("ONGOING")
});

export type EnsureAnalyticsRequestOptions = z.infer<typeof EnsureAnalyticsRequestOptionsSchema>;

export const ListAnalyticsRequestsOptionsSchema = z.object({
  app: AppIdSchema.optional()
});

export type ListAnalyticsRequestsOptions = z.infer<typeof ListAnalyticsRequestsOptionsSchema>;

export const ListAnalyticsReportsOptionsSchema = z.object({
  app: AppIdSchema.optional(),
  accessType: AnalyticsAccessTypeSchema.default("ONGOING"),
  category: z.string().trim().min(1).optional()
});

export type ListAnalyticsReportsOptions = z.infer<typeof ListAnalyticsReportsOptionsSchema>;

export const FetchAnalyticsOptionsSchema = z
  .object({
    app: AppIdSchema.optional(),
    report: z.string().trim().min(1, "Report name is required."),
    accessType: AnalyticsAccessTypeSchema.default("ONGOING"),
    granularity: AnalyticsGranularitySchema.default("DAILY")
  })
  .and(DateRangeSchema);

export type FetchAnalyticsOptions = z.infer<typeof FetchAnalyticsOptionsSchema>;
