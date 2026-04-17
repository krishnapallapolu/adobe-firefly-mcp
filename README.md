# adobe-firefly-mcp

> An unofficial [Model Context Protocol](https://modelcontextprotocol.io) server for the Adobe Firefly Services API. Use Firefly image and video generation from Claude Desktop, Claude Cowork, Cursor, or any MCP client.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-green.svg)](https://modelcontextprotocol.io)

> **Disclaimer:** This project is not affiliated with, endorsed by, or sponsored by Adobe Inc. "Adobe" and "Firefly" are trademarks of Adobe Inc. This is an independent open-source wrapper around Adobe's publicly documented Firefly Services REST API.

---

## Prerequisites — read this first

**Access to the Adobe Firefly Services API is restricted to Adobe enterprise customers.** Per Adobe's documentation and support community, this means:

- An **Adobe Creative Cloud for Enterprise ETLA contract** (Adobe's FAQ cites a minimum of 100 seats; some community threads reference 50 on older contracts)
- Typical commitment: **~$1,000/month minimum, 3-year term**, 4–8 week sales cycle
- The account provisioning API credentials needs **System Administrator** or **Developer** role in the Adobe Admin Console

If you are an individual developer, freelancer, or small team without an enterprise ETLA, you **will not** be able to use this server — the Adobe IMS token endpoint will reject your credentials. There is currently no self-serve tier for the Firefly Services API.

**Why this project exists anyway:** For teams that do have enterprise access, getting a production-ready integration to MCP clients typically requires 80–120 hours of engineering work (OAuth server-to-server, async job polling, transport setup, deployment). This project provides that integration as an open reference implementation.

---

## Features

- **9 MCP tools** covering the full Firefly image + video surface:
  - `generate_image` — text-to-image (Firefly Image Model 3/4/5, custom models)
  - `generate_similar` — variations from a reference image
  - `expand_image` — outpainting / aspect-ratio change
  - `fill_image` — generative inpainting with mask
  - `object_composite` — composite a product into a generated scene
  - `generate_video` — 5-second video from prompt + optional keyframes
  - `upload_image` — upload PNG/JPEG/WEBP, get an `uploadId`
  - `list_custom_models` — enumerate trained custom models
  - `get_job_status` — raw async job polling (debug only)
- **OAuth2 server-to-server** auth against Adobe IMS with in-memory token caching and proactive refresh
- **Streamable HTTP transport** — the current MCP spec, works with Claude Desktop, Cowork, Cursor, and any remote-capable MCP client
- **Async polling is hidden from the caller** — one tool call in, one final result out. No manual `jobId` juggling.
- **Bearer-token edge auth** with constant-time compare — safe to expose on the public internet
- **Docker + Traefik** deployment templates included
- **Zero Adobe SDK dependency** — pure `fetch` + the official MCP SDK, nothing else

## Quick start (local)

Requires Node.js ≥ 20.

```bash
git clone https://github.com/krishnapallapolu/adobe-firefly-mcp.git
cd adobe-firefly-mcp
npm install
cp .env.example .env
# Fill in FIREFLY_CLIENT_ID, FIREFLY_CLIENT_SECRET, MCP_BEARER_TOKEN
npm run dev
```

Health check:

```bash
curl http://localhost:6002/healthz
# → {"ok":true,"svc":"firefly-mcp"}
```

### Generate the bearer token

```bash
openssl rand -hex 32
```

Put the output in `MCP_BEARER_TOKEN`. This is what MCP clients will present in the `Authorization: Bearer ...` header.

### Get Firefly credentials

1. Log into the [Adobe Developer Console](https://developer.adobe.com/console) with a user that has System Administrator or Developer role on your enterprise org
2. Create a new project
3. Add the **Firefly - Firefly Services** API
4. Choose **OAuth Server-to-Server** authentication (default)
5. Assign appropriate product profiles
6. Copy the Client ID → `FIREFLY_CLIENT_ID`
7. Copy the Client Secret → `FIREFLY_CLIENT_SECRET`

## Connecting to MCP clients

### Claude Desktop / Cowork (remote connector)

Settings → Connectors → **Add custom connector**:

| Field | Value |
|---|---|
| Name | `adobe-firefly` |
| URL | `https://your-host.example.com/mcp` |
| Authorization header | `Bearer <your MCP_BEARER_TOKEN>` |

Remote connectors require your server to be reachable from Anthropic's cloud infrastructure. You'll need to deploy somewhere publicly accessible (see [Deployment](#deployment) below). Local stdio transport is not currently supported by this project.

### Cursor

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "adobe-firefly": {
      "url": "https://your-host.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <your MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

## Deployment

### Docker Compose + Traefik

The included `docker-compose.yml` assumes:

- A Traefik instance already running with an external Docker network (default name: `traefik_public`)
- A certresolver configured (default name: `letsencrypt`)
- A DNS record pointing your chosen hostname to the server

```bash
# Set your hostname in docker-compose.yml (search for "Host(`...`)")
docker compose up -d --build
docker compose logs -f firefly-mcp
```

Verify:

```bash
curl https://your-host.example.com/healthz
```

### Other platforms

The server is a standard Node.js Express app and should deploy to anywhere that supports Node.js 20+: AWS ECS, Google Cloud Run, Fly.io, Railway, Render, etc. The Dockerfile is multi-stage and produces a ~150MB image running as non-root.

### Restricting access

If you're only using this from Claude Desktop / Cowork, consider restricting inbound traffic to [Anthropic's IP ranges](https://support.claude.com/en/articles/anthropic-ip-addresses) at your firewall or load balancer level. The bearer token protects against drive-by abuse, but defense-in-depth matters when you're running paid API credentials.

## Configuration

All configuration via environment variables. See `.env.example` for the full list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREFLY_CLIENT_ID` | yes | — | From Adobe Developer Console |
| `FIREFLY_CLIENT_SECRET` | yes | — | From Adobe Developer Console |
| `MCP_BEARER_TOKEN` | yes | — | Shared secret between server and MCP client. Min 32 chars. |
| `PORT` | no | `6002` | HTTP listen port |
| `HOST` | no | `0.0.0.0` | HTTP listen address |
| `LOG_LEVEL` | no | `info` | Pino log level: trace/debug/info/warn/error/fatal |
| `POLL_INTERVAL_MS` | no | `1500` | How often to poll Firefly job status |
| `POLL_TIMEOUT_MS` | no | `180000` | Max wait for a single Firefly job (ms) |

## Notes & caveats

- **Output URLs expire in 1 hour.** Firefly returns pre-signed URLs. If you need persistence, pipe the URL into downstream storage (S3, GCS, etc.) before it expires.
- **Input URL allowlist.** When passing a `url` source (instead of `uploadId`), Adobe only accepts URLs from `amazonaws.com`, `windows.net`, `dropboxusercontent.com`, `storage.googleapis.com`. For anything else, upload via `upload_image` and pass the returned `uploadId`.
- **Model versions.** The public OpenAPI spec enumerates `image3`, `image3_custom`, `image4_standard`, `image4_ultra`, `image4_custom`. Image Model 5 is mentioned in Adobe marketing but not yet in the public spec. The `modelVersion` parameter is typed as a loose string so new versions work as soon as Adobe enables them on your tenant — no code change needed.
- **Token cache** is in-process. Fine for a single container. For horizontal scaling, move the IMS token cache to Redis with a distributed lock around refresh.
- **Generative credits.** Every successful generation consumes credits from your enterprise quota. Monitor usage via the Adobe Admin Console.
- **Streamable HTTP only.** This server doesn't implement stdio or SSE transport. SSE is being deprecated in the MCP ecosystem; stdio is only useful for Claude Desktop's local `claude_desktop_config.json` mechanism, which isn't available in Cowork or claude.ai anyway.

## Architecture

```
┌──────────────────┐    HTTPS + Bearer    ┌──────────────────────┐
│  MCP Client      │─────────────────────▶│  firefly-mcp         │
│  (Cowork, etc.) │                      │  ┌────────────────┐  │
└──────────────────┘                      │  │ StreamableHTTP │  │
                                          │  │ Transport      │  │
                                          │  └────────────────┘  │
                                          │  ┌────────────────┐  │
                                          │  │ IMS Token      │  │
                                          │  │ Cache (5m ttl) │  │
                                          │  └────────┬───────┘  │
                                          └───────────┼──────────┘
                                                      │
                                  OAuth2 client_credentials
                                                      ▼
                                          ┌──────────────────────┐
                                          │ Adobe IMS            │
                                          │ ims-na1.adobelogin…  │
                                          └──────────────────────┘
                                                      │
                                          Bearer + x-api-key
                                                      ▼
                                          ┌──────────────────────┐
                                          │ Firefly Services API │
                                          │ firefly-api.adobe.io │
                                          │                      │
                                          │ async: 202 + jobId   │
                                          │   → poll /status     │
                                          │     (hidden from     │
                                          │      MCP caller)     │
                                          └──────────────────────┘
```

## Contributing

PRs welcome. A few notes:

- Keep dependencies minimal — the current tree is MCP SDK, Express, Pino, Zod, and nothing else. New deps need justification.
- Strict TypeScript mode is on. `npm run typecheck` must pass.
- Tool definitions live in `src/tools.ts`. New endpoints from the Firefly OpenAPI spec go there, with types in `src/firefly/types.ts`.

### Roadmap / ideas for contributors

- [ ] Translate API support (`/v3/images/translate-async` when Adobe exposes it publicly)
- [ ] Upscale / enhance API
- [ ] Custom Model training endpoints (vs. just listing)
- [ ] Per-request generative credit tracking in responses
- [ ] Redis-backed token cache for horizontal scaling
- [ ] OAuth 2.0 Dynamic Client Registration (DCR) instead of static bearer, for multi-tenant deployments

## References

- [Adobe Firefly Services API docs](https://developer.adobe.com/firefly-services/docs/firefly-api/)
- [Adobe Firefly Services OpenAPI spec](https://raw.githubusercontent.com/AdobeDocs/ffs-firefly-api/main/static/firefly-api.json) — the contract this server is built against
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

[MIT](LICENSE) — do whatever you want, no warranty.
