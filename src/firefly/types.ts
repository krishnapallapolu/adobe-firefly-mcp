// Types hand-derived from the Adobe Firefly OpenAPI spec (firefly-api.json).
// Kept intentionally minimal — only properties this MCP server consumes or
// forwards.

export interface AsyncAcceptResponse {
  jobId: string;
  statusUrl: string;
  cancelUrl: string;
}

export type JobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "cancel_pending"
  | "cancelled"
  | "timeout";

export interface Size {
  width: number;
  height: number;
}

export interface OutputImage {
  seed: number;
  image: { url: string };
}

export interface VideoOutput {
  seed: number;
  video: { url: string };
}

export interface ImageJobResult {
  size: Size;
  outputs: OutputImage[];
  contentClass?: "photo" | "art";
  promptHasBlockedArtists?: boolean;
  promptHasDeniedWords?: boolean;
}

export interface VideoJobResult {
  size: Size;
  outputs: VideoOutput[];
}

export interface JobStatusResponse<
  R = ImageJobResult | VideoJobResult | unknown,
> {
  jobId: string;
  status: JobStatus;
  progress?: number;
  result?: R;
  error_code?: string;
  message?: string;
}

export interface StorageImageResponse {
  images: { id: string }[];
}

// Model versions currently in the public OpenAPI. `image5` is mentioned in
// Adobe marketing but not yet enumerated — we pass the header through as a
// raw string so new versions work without code changes.
export type ImageModelVersion =
  | "image3"
  | "image3_custom"
  | "image4_standard"
  | "image4_ultra"
  | "image4_custom"
  | (string & {});

export type VideoModelVersion = "video1_standard" | (string & {});
