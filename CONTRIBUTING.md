# Contributing to adobe-firefly-mcp

Thanks for your interest in improving this project. A few notes to make contributing easier.

## Ground rules

- **Be kind.** This is a small project, not a high-stakes codebase. Assume good intent.
- **Keep it minimal.** The goal is a tight, focused MCP wrapper around Firefly Services. If a feature can live in a downstream workflow (e.g. persisting outputs to S3), it probably shouldn't be added here.
- **No Adobe SDK.** We use plain `fetch` against the documented REST API. This keeps the project small, transparent, and easy to audit for anyone handling enterprise API credentials.

## Development setup

Requires Node.js ≥ 20.

```bash
git clone https://github.com/krishnapallapolu/adobe-firefly-mcp.git
cd adobe-firefly-mcp
npm install
cp .env.example .env
# Fill in your credentials
npm run dev
```

## Before submitting a PR

```bash
npm run typecheck   # must pass — strict TypeScript
npm run build       # must produce a clean build
```

If you add a new MCP tool, smoke test it against your own Firefly account and include example input in the PR description.

## Project structure

```
src/
  index.ts              Express app + MCP transport + session management
  config.ts             Environment variable parsing (Zod)
  log.ts                Pino logger with credential redaction
  tools.ts              All MCP tool registrations (schemas + handlers)
  auth/
    ims.ts              Adobe IMS OAuth2 token client + cache
    bearer.ts           Edge auth middleware
  firefly/
    client.ts           Firefly REST API client (fetch wrapper)
    types.ts            TypeScript types mirroring the OpenAPI spec
    poll.ts             Async job polling loop
```

New Firefly endpoints go into `tools.ts` with supporting types in `firefly/types.ts`. If you need a new shared helper, think twice before adding it; this project is intentionally flat.

## What I'll accept

- Bug fixes (with a clear explanation of what was wrong)
- New Firefly API endpoints as they become publicly documented
- Documentation improvements
- Better error messages
- Test coverage (there's none currently — PRs adding tests very welcome)

## What I'm less likely to accept

- New dependencies (current deps: MCP SDK, Express, Pino, Zod, nothing else)
- Alternative transports (stdio, SSE — the spec is moving away from these)
- Client-specific workarounds (if Claude Desktop has a bug, file it upstream)
- Features that require significant state management (database, Redis, queue) — those belong in a fork, not here

## Reporting security issues

Please don't open a public issue for anything that could compromise users' Adobe API credentials or MCP bearer tokens. Email the maintainer directly or use GitHub's private vulnerability reporting.

## License

By contributing, you agree your contributions are licensed under MIT.
