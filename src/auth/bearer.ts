import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config.js";

/**
 * Require a bearer token on every MCP request. Uses constant-time compare to
 * resist timing attacks. Cowork sends this in the Authorization header when
 * configured via connector Advanced Settings.
 */
export const requireBearer: RequestHandler = (req, res, next) => {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "missing_bearer" });
    return;
  }
  const presented = Buffer.from(match[1] ?? "");
  const expected = Buffer.from(env.MCP_BEARER_TOKEN!);
  if (
    presented.length !== expected.length ||
    !timingSafeEqual(presented, expected)
  ) {
    res.status(401).json({ error: "invalid_bearer" });
    return;
  }
  next();
};
