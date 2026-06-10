import { z } from "zod";

const OptionalEnvString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional()
);

export const AscEnvSchema = z.object({
  ASC_ISSUER_ID: OptionalEnvString,
  ASC_KEY_ID: OptionalEnvString,
  ASC_PRIVATE_KEY_PATH: OptionalEnvString,
  ASC_PRIVATE_KEY: OptionalEnvString,
  ASC_VENDOR_NUMBER: OptionalEnvString,
  ASC_API_BASE_URL: OptionalEnvString,
  ASC_REPORTS_DIR: OptionalEnvString
});

export type AscEnv = z.infer<typeof AscEnvSchema>;
