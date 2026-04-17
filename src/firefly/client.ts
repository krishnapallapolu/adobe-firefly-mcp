import { env } from "../config.js";
import { log } from "../log.js";
import { getAccessToken } from "../auth/ims.js";

export const FIREFLY_BASE_URL = "https://firefly-api.adobe.io";

export class FireflyError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public errorCode?: string
  ) {
    super(message);
    this.name = "FireflyError";
  }
}

interface FireflyRequestOptions {
  method?: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  binaryBody?: { data: Buffer; contentType: string };
  headers?: Record<string, string>;
  modelVersion?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "x-api-key": env.FIREFLY_CLIENT_ID,
  };
}

export async function fireflyRequest<T = unknown>(
  opts: FireflyRequestOptions
): Promise<T> {
  const url = `${FIREFLY_BASE_URL}${opts.path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await authHeaders()),
    ...(opts.headers ?? {}),
  };
  if (opts.modelVersion) {
    headers["x-model-version"] = opts.modelVersion;
  }

  let body: Uint8Array | string | undefined;
  if (opts.binaryBody) {
    headers["Content-Type"] = opts.binaryBody.contentType;
    body = new Uint8Array(opts.binaryBody.data);
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method ?? "POST",
    headers,
    body,
  });

  const rawText = await res.text();
  let parsed: unknown = undefined;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  }

  if (!res.ok) {
    const errorCode =
      typeof parsed === "object" && parsed !== null && "error_code" in parsed
        ? String((parsed as { error_code: unknown }).error_code)
        : undefined;
    log.warn(
      { status: res.status, errorCode, path: opts.path },
      "Firefly request failed"
    );
    throw new FireflyError(
      `Firefly ${opts.method ?? "POST"} ${opts.path} failed: ${res.status}`,
      res.status,
      parsed,
      errorCode
    );
  }

  return parsed as T;
}
