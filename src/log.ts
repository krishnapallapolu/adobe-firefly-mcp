import pino from "pino";
import { env } from "./config.js";

export const log = pino({
  level: env.LOG_LEVEL,
  base: { svc: "firefly-mcp" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-api-key']",
      '*.FIREFLY_CLIENT_SECRET',
      '*.access_token',
    ],
    censor: "[REDACTED]",
  },
});
