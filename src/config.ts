import { z } from "zod";

const EnvSchema = z.object({
  // Adobe Firefly Services credentials
  FIREFLY_CLIENT_ID: z.string().min(1),
  FIREFLY_CLIENT_SECRET: z.string().min(1),

  // Edge auth — bearer token Cowork will send
  MCP_BEARER_TOKEN: z.string().min(32, "Use a random token >=32 chars"),

  // Server
  PORT: z.coerce.number().int().positive().default(6002),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Firefly job polling
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
