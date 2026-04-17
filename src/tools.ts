import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fireflyRequest, FireflyError } from "./firefly/client.js";
import { pollJob } from "./firefly/poll.js";
import type {
  AsyncAcceptResponse,
  ImageJobResult,
  JobStatusResponse,
  StorageImageResponse,
  VideoJobResult,
} from "./firefly/types.js";
import { log } from "./log.js";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const SizeSchema = z.object({
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
});

const PromptSchema = z.string().min(1).max(1024);
const NegativePromptSchema = z.string().max(1024).optional();
const NumVariationsSchema = z.number().int().min(1).max(4).optional();
const SeedsSchema = z.array(z.number().int()).min(1).max(4).optional();
const ContentClassSchema = z.enum(["photo", "art"]).optional();
const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2}-[A-Z]{2}$/)
  .optional()
  .describe("IETF BCP 47 locale, e.g. en-AE, ar-AE");

const ImageSourceSchema = z
  .object({
    uploadId: z.string().uuid().optional(),
    url: z.string().url().optional(),
  })
  .refine((v) => Boolean(v.uploadId) !== Boolean(v.url), {
    message: "Provide exactly one of uploadId or url",
  });

const StylePresetsSchema = z
  .object({
    presets: z.array(z.string()).min(1).optional(),
    strength: z.number().int().min(1).max(100).optional(),
    imageReference: z.object({ source: ImageSourceSchema }).optional(),
  })
  .optional();

const StructureReferenceSchema = z
  .object({
    strength: z.number().int().min(0).max(100).optional(),
    imageReference: z.object({ source: ImageSourceSchema }),
  })
  .optional();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatImageResult(r: ImageJobResult) {
  const lines = [
    `Generated ${r.outputs.length} image(s) at ${r.size.width}x${r.size.height}.`,
    ...r.outputs.map(
      (o, i) => `  [${i + 1}] seed=${o.seed}  url=${o.image.url}`
    ),
  ];
  if (r.promptHasBlockedArtists) {
    lines.push("⚠ Prompt referenced blocked artists — output does not match full prompt.");
  }
  if (r.promptHasDeniedWords) {
    lines.push("⚠ Prompt contained denied words — output does not match full prompt.");
  }
  lines.push("(Output URLs expire in 1 hour.)");
  return lines.join("\n");
}

function formatVideoResult(r: VideoJobResult) {
  return [
    `Generated ${r.outputs.length} video(s) at ${r.size.width}x${r.size.height}.`,
    ...r.outputs.map(
      (o, i) => `  [${i + 1}] seed=${o.seed}  url=${o.video.url}`
    ),
    "(Output URLs expire in 1 hour.)",
  ].join("\n");
}

function asError(e: unknown): string {
  if (e instanceof FireflyError) {
    return `Firefly error${e.errorCode ? ` [${e.errorCode}]` : ""} (HTTP ${e.status}): ${e.message}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // generate_image
  // -------------------------------------------------------------------------
  server.tool(
    "generate_image",
    "Generate images from a text prompt using Adobe Firefly. Returns pre-signed URLs valid for 1 hour.",
    {
      prompt: PromptSchema,
      negativePrompt: NegativePromptSchema,
      numVariations: NumVariationsSchema,
      seeds: SeedsSchema,
      contentClass: ContentClassSchema,
      promptBiasingLocaleCode: LocaleSchema,
      size: SizeSchema.optional(),
      modelVersion: z
        .string()
        .optional()
        .describe(
          "x-model-version header. Known: image3, image4_standard, image4_ultra, image4_custom. Default: image4_ultra."
        ),
      customModelId: z.string().optional(),
      style: StylePresetsSchema,
      structure: StructureReferenceSchema,
      visualIntensity: z.number().int().min(2).max(10).optional(),
    },
    async (args) => {
      try {
        const { modelVersion, ...body } = args;
        const accept = await fireflyRequest<AsyncAcceptResponse>({
          path: "/v3/images/generate-async",
          body,
          modelVersion: modelVersion ?? "image4_ultra",
        });
        const result = await pollJob<ImageJobResult>(accept);
        return { content: [{ type: "text", text: formatImageResult(result) }] };
      } catch (e) {
        log.error({ err: e }, "generate_image failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // generate_similar
  // -------------------------------------------------------------------------
  server.tool(
    "generate_similar",
    "Generate images similar to a reference image (uploadId or URL).",
    {
      image: z.object({ source: ImageSourceSchema }),
      numVariations: NumVariationsSchema,
      seeds: SeedsSchema,
      size: SizeSchema.optional(),
      modelVersion: z.string().optional(),
    },
    async (args) => {
      try {
        const { modelVersion, ...body } = args;
        const accept = await fireflyRequest<AsyncAcceptResponse>({
          path: "/v3/images/generate-similar-async",
          body,
          modelVersion: modelVersion ?? "image4_ultra",
        });
        const result = await pollJob<ImageJobResult>(accept);
        return { content: [{ type: "text", text: formatImageResult(result) }] };
      } catch (e) {
        log.error({ err: e }, "generate_similar failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // expand_image
  // -------------------------------------------------------------------------
  server.tool(
    "expand_image",
    "Expand (outpaint) an image to a new size or aspect ratio, optionally guided by a prompt.",
    {
      image: z.object({ source: ImageSourceSchema }),
      mask: z.object({ source: ImageSourceSchema }).optional(),
      prompt: PromptSchema.optional(),
      numVariations: NumVariationsSchema,
      seeds: SeedsSchema,
      size: SizeSchema.optional(),
      placement: z
        .object({
          alignment: z
            .object({
              horizontal: z.enum(["center", "left", "right"]).optional(),
              vertical: z.enum(["center", "top", "bottom"]).optional(),
            })
            .optional(),
          inset: z
            .object({
              top: z.number().int().optional(),
              right: z.number().int().optional(),
              bottom: z.number().int().optional(),
              left: z.number().int().optional(),
            })
            .optional(),
        })
        .optional(),
    },
    async (args) => {
      try {
        const accept = await fireflyRequest<AsyncAcceptResponse>({
          path: "/v3/images/expand-async",
          body: args,
        });
        const result = await pollJob<ImageJobResult>(accept);
        return { content: [{ type: "text", text: formatImageResult(result) }] };
      } catch (e) {
        log.error({ err: e }, "expand_image failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // fill_image
  // -------------------------------------------------------------------------
  server.tool(
    "fill_image",
    "Generative fill (inpainting) inside a masked region of an image.",
    {
      image: z.object({ source: ImageSourceSchema }),
      mask: z.object({
        source: ImageSourceSchema,
        invert: z.boolean().optional(),
      }),
      prompt: PromptSchema.optional(),
      negativePrompt: NegativePromptSchema,
      numVariations: NumVariationsSchema,
      seeds: SeedsSchema,
      size: SizeSchema.optional(),
      promptBiasingLocaleCode: LocaleSchema,
    },
    async (args) => {
      try {
        const accept = await fireflyRequest<AsyncAcceptResponse>({
          path: "/v3/images/fill-async",
          body: args,
        });
        const result = await pollJob<ImageJobResult>(accept);
        return { content: [{ type: "text", text: formatImageResult(result) }] };
      } catch (e) {
        log.error({ err: e }, "fill_image failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // object_composite
  // -------------------------------------------------------------------------
  server.tool(
    "object_composite",
    "Composite a product/object image into a generated scene described by a prompt.",
    {
      image: z.object({ source: ImageSourceSchema }),
      mask: z.object({ source: ImageSourceSchema }).optional(),
      prompt: PromptSchema,
      contentClass: ContentClassSchema,
      numVariations: NumVariationsSchema,
      seeds: SeedsSchema,
      size: SizeSchema.optional(),
      style: StylePresetsSchema,
    },
    async (args) => {
      try {
        const accept = await fireflyRequest<AsyncAcceptResponse>({
          path: "/v3/images/generate-object-composite-async",
          body: args,
        });
        const result = await pollJob<ImageJobResult>(accept);
        return { content: [{ type: "text", text: formatImageResult(result) }] };
      } catch (e) {
        log.error({ err: e }, "object_composite failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // generate_video
  // -------------------------------------------------------------------------
  server.tool(
    "generate_video",
    "Generate a 5-second video from a text prompt (and optional keyframe image).",
    {
      prompt: z.string().min(1),
      seeds: z.array(z.number().int()).length(1).optional(),
      bitRateFactor: z.number().int().min(0).max(63).optional(),
      sizes: z
        .array(
          z.object({
            width: z.number().int().min(1).max(8192),
            height: z.number().int().min(1).max(8192),
          })
        )
        .optional(),
      image: z
        .object({
          conditions: z.array(
            z.object({
              source: ImageSourceSchema,
              placement: z.object({
                position: z.number().min(0).max(1),
              }),
            })
          ),
        })
        .optional(),
      videoSettings: z
        .object({
          cameraMotion: z
            .enum([
              "camera pan left",
              "camera pan right",
              "camera zoom in",
              "camera zoom out",
              "camera tilt up",
              "camera tilt down",
              "camera locked down",
              "camera handheld",
            ])
            .optional(),
          promptStyle: z
            .enum([
              "anime",
              "3d",
              "fantasy",
              "cinematic",
              "claymation",
              "line art",
              "stop motion",
              "2d",
              "vector art",
              "black and white",
            ])
            .optional(),
          shotAngle: z
            .enum([
              "aerial shot",
              "eye_level shot",
              "high angle shot",
              "low angle shot",
              "top-down shot",
            ])
            .optional(),
          shotSize: z
            .enum([
              "close-up shot",
              "extreme close-up",
              "medium shot",
              "long shot",
              "extreme long shot",
            ])
            .optional(),
        })
        .optional(),
    },
    async (args) => {
      try {
        const accept = await fireflyRequest<AsyncAcceptResponse>({
          path: "/v3/videos/generate",
          body: args,
          modelVersion: "video1_standard",
        });
        const result = await pollJob<VideoJobResult>(accept);
        return { content: [{ type: "text", text: formatVideoResult(result) }] };
      } catch (e) {
        log.error({ err: e }, "generate_video failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // upload_image
  // -------------------------------------------------------------------------
  server.tool(
    "upload_image",
    "Upload a PNG/JPEG/WEBP image to Firefly storage (max 15MB). Returns an uploadId valid for 7 days that you can pass to fill/expand/similar/composite tools.",
    {
      // base64-encoded binary to keep the MCP protocol happy
      imageBase64: z
        .string()
        .min(1)
        .describe("Base64-encoded image bytes (raw, no data: prefix)"),
      contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    },
    async (args) => {
      try {
        const data = Buffer.from(args.imageBase64, "base64");
        if (data.length > 15 * 1024 * 1024) {
          throw new FireflyError(
            "Image exceeds 15MB upload limit",
            413,
            null,
            "payload_too_large"
          );
        }
        const resp = await fireflyRequest<StorageImageResponse>({
          path: "/v2/storage/image",
          binaryBody: { data, contentType: args.contentType },
        });
        const ids = resp.images.map((i) => i.id);
        return {
          content: [
            {
              type: "text",
              text: `Uploaded. uploadId(s): ${ids.join(", ")}\nValid for 7 days.`,
            },
          ],
        };
      } catch (e) {
        log.error({ err: e }, "upload_image failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // list_custom_models
  // -------------------------------------------------------------------------
  server.tool(
    "list_custom_models",
    "List Firefly custom models available to this account.",
    {
      publishedState: z
        .enum([
          "all",
          "ready",
          "published",
          "unpublished",
          "queued",
          "training",
          "failed",
          "cancelled",
        ])
        .optional(),
      sortBy: z
        .enum(["assetName", "createdDate", "modifiedDate"])
        .optional(),
      start: z.string().optional(),
      limit: z.string().optional(),
    },
    async (args) => {
      try {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(args)) {
          if (v !== undefined) qs.set(k, String(v));
        }
        const path = `/v3/custom-models${qs.toString() ? `?${qs}` : ""}`;
        const resp = await fireflyRequest<{
          custom_models: Array<{
            assetId: string;
            assetName: string;
            displayName?: string;
            trainingMode?: string;
            conceptId?: string;
            publishedState?: string;
            samplePrompt?: string;
          }>;
          total_count: number;
        }>({ method: "GET", path });

        if (resp.custom_models.length === 0) {
          return {
            content: [{ type: "text", text: "No custom models found." }],
          };
        }
        const lines = [
          `Found ${resp.total_count} custom model(s):`,
          ...resp.custom_models.map(
            (m) =>
              `  • ${m.displayName ?? m.assetName}  [id=${m.assetId}  mode=${m.trainingMode ?? "?"}  state=${m.publishedState ?? "?"}]${m.conceptId ? `  concept="${m.conceptId}"` : ""}`
          ),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        log.error({ err: e }, "list_custom_models failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_job_status (escape hatch for debugging)
  // -------------------------------------------------------------------------
  server.tool(
    "get_job_status",
    "Fetch the raw status of a Firefly async job by jobId. Normally unnecessary — other tools poll internally.",
    { jobId: z.string().min(1) },
    async ({ jobId }) => {
      try {
        const resp = await fireflyRequest<JobStatusResponse>({
          method: "GET",
          path: `/v3/status/${encodeURIComponent(jobId)}`,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(resp, null, 2) },
          ],
        };
      } catch (e) {
        log.error({ err: e }, "get_job_status failed");
        return {
          isError: true,
          content: [{ type: "text", text: asError(e) }],
        };
      }
    }
  );
}
