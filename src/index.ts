import express from "express";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { env } from "./config.js";
import { log } from "./log.js";
import { requireBearer } from "./auth/bearer.js";
import { registerTools } from "./tools.js";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(pinoHttp({ logger: log }));

// Healthcheck (unauthenticated) — for Docker / Traefik readiness probes
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, svc: "firefly-mcp" });
});

// Per-session transports. Cowork opens one session per connector per
// conversation; we reuse the same McpServer instance across all sessions.
const transports: Record<string, StreamableHTTPServerTransport> = {};

function buildServer(): McpServer {
  const server = new McpServer({
    name: "adobe-firefly",
    version: "0.1.0",
  });
  registerTools(server);
  return server;
}

// Singleton — the same handler set serves every session
const mcpServer = buildServer();

app.post("/mcp", requireBearer, async (req, res) => {
  try {
    const sessionId = req.header("mcp-session-id");
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport!;
          log.info({ sessionId: id }, "MCP session initialized");
        },
      });
      transport.onclose = () => {
        if (transport?.sessionId) {
          delete transports[transport.sessionId];
          log.info({ sessionId: transport.sessionId }, "MCP session closed");
        }
      };
      await mcpServer.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "No valid session or init request" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    log.error({ err: e }, "MCP request handling failed");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      });
    }
  }
});

// GET/DELETE on /mcp are used by clients to resume or terminate sessions
const sessionOnlyHandler = async (
  req: express.Request,
  res: express.Response
) => {
  const sessionId = req.header("mcp-session-id");
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session id");
    return;
  }
  await transport.handleRequest(req, res);
};

app.get("/mcp", requireBearer, sessionOnlyHandler);
app.delete("/mcp", requireBearer, sessionOnlyHandler);

app.listen(env.PORT, env.HOST, () => {
  log.info(
    { host: env.HOST, port: env.PORT },
    "firefly-mcp listening (Streamable HTTP)"
  );
});

// Graceful shutdown
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    log.info({ sig }, "Shutting down");
    process.exit(0);
  });
}
