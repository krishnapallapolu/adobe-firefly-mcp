import { env } from "../config.js";
import { log } from "../log.js";

const IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";

const FIREFLY_SCOPES = [
  "openid",
  "AdobeID",
  "session",
  "additional_info",
  "read_organizations",
  "firefly_api",
  "ff_apis",
].join(",");

interface IMSTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  // Unix ms at which this token should be considered stale (before actual expiry)
  refreshAt: number;
}

let cache: CachedToken | null = null;
// Re-fetch 5 minutes before actual expiry to avoid mid-request expiration
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Returns a valid Adobe IMS access token. Caches the token in-memory and
 * transparently refreshes before expiry. Callers should not cache the
 * returned value — always call this function.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && now < cache.refreshAt) {
    return cache.token;
  }

  log.debug("Fetching new Adobe IMS access token");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.FIREFLY_CLIENT_ID,
    client_secret: env.FIREFLY_CLIENT_SECRET,
    scope: FIREFLY_SCOPES,
  });

  const res = await fetch(IMS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "<no body>");
    log.error({ status: res.status, errText }, "IMS token request failed");
    throw new Error(
      `Adobe IMS token request failed: ${res.status} ${res.statusText}`
    );
  }

  const json = (await res.json()) as IMSTokenResponse;
  const expiresInMs = json.expires_in * 1000;
  cache = {
    token: json.access_token,
    refreshAt: now + expiresInMs - REFRESH_WINDOW_MS,
  };
  log.info({ expiresInSec: json.expires_in }, "Obtained new IMS access token");
  return json.access_token;
}

/** For tests / manual rotation. */
export function clearTokenCache(): void {
  cache = null;
}
