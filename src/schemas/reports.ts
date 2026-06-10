import { z } from "zod";
import { DateRangeSchema } from "./common.js";

export const FetchReportOptionsSchema = DateRangeSchema;

export type FetchReportOptions = z.infer<typeof FetchReportOptionsSchema>;
