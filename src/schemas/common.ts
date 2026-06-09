import { z } from "zod";
import { isDateOnly } from "../utils/dates.js";

export const DateOnlySchema = z
  .string()
  .refine(isDateOnly, "Expected date in YYYY-MM-DD format.");

export const DateRangeSchema = z
  .object({
    from: DateOnlySchema,
    to: DateOnlySchema
  })
  .superRefine((value, context) => {
    if (isDateOnly(value.from) && isDateOnly(value.to) && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "`to` must be on or after `from`."
      });
    }
  });

export const JsonOptionSchema = z.object({
  json: z.boolean().default(false)
});
