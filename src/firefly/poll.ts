import { env } from "../config.js";
import { log } from "../log.js";
import { fireflyRequest, FireflyError } from "./client.js";
import type {
  AsyncAcceptResponse,
  JobStatusResponse,
} from "./types.js";

const TERMINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "canceled",
  "cancelled",
  "timeout",
]);

/**
 * Poll /v3/status/{jobId} until the job reaches a terminal state or the
 * overall timeout elapses. Returns the final result on success; throws
 * FireflyError otherwise.
 */
export async function pollJob<R>(
  accept: AsyncAcceptResponse
): Promise<R> {
  const deadline = Date.now() + env.POLL_TIMEOUT_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    const status = await fireflyRequest<JobStatusResponse<R>>({
      method: "GET",
      path: `/v3/status/${encodeURIComponent(accept.jobId)}`,
    });

    if (TERMINAL_STATUSES.has(status.status)) {
      if (status.status === "succeeded" && status.result !== undefined) {
        return status.result;
      }
      throw new FireflyError(
        `Firefly job ${accept.jobId} ended with status=${status.status}${
          status.message ? `: ${status.message}` : ""
        }`,
        500,
        status,
        status.error_code
      );
    }

    attempt++;
    if (attempt % 10 === 0) {
      log.debug(
        { jobId: accept.jobId, attempt, status: status.status },
        "Still polling Firefly job"
      );
    }
    await sleep(env.POLL_INTERVAL_MS);
  }

  throw new FireflyError(
    `Firefly job ${accept.jobId} exceeded ${env.POLL_TIMEOUT_MS}ms poll timeout`,
    504,
    { jobId: accept.jobId },
    "poll_timeout"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
