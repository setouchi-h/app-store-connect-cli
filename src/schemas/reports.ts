import { z } from "zod";
import { DateRangeSchema } from "./common.js";

export const FetchReportOptionsSchema = DateRangeSchema.extend({
  appId: z.string().trim().min(1, "app-id is required.")
});

export const SummarizeOptionsSchema = DateRangeSchema;

export type FetchReportOptions = z.infer<typeof FetchReportOptionsSchema>;
export type SummarizeOptions = z.infer<typeof SummarizeOptionsSchema>;

export const SalesReportRowSchema = z.record(z.string(), z.string());

export type SalesReportRow = z.infer<typeof SalesReportRowSchema>;
