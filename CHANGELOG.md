# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Initial release

### Added
- MCP server exposing 9 tools over the Adobe Firefly Services API:
  `generate_image`, `generate_similar`, `expand_image`, `fill_image`,
  `object_composite`, `generate_video`, `upload_image`, `list_custom_models`,
  `get_job_status`
- Adobe IMS OAuth2 server-to-server authentication with in-memory token
  caching and proactive refresh 5 minutes before expiry
- Streamable HTTP transport via the official MCP TypeScript SDK
- Bearer-token edge authentication with constant-time comparison
- Async job polling hidden from callers — configurable interval and timeout
- Docker multi-stage build, non-root runtime, healthcheck
- Docker Compose template with Traefik labels for TLS termination
- Structured logging via Pino with automatic credential redaction

### Known limitations
- Streamable HTTP transport only (no stdio, no SSE)
- In-memory token cache — does not scale horizontally without modification
- No built-in retry on transient Firefly 5xx errors
- No test coverage
