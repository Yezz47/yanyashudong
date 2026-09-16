// DeepSeek streaming adapter for YanYa Tree Hole.
// Keep API keys on the server:
//   $env:DEEPSEEK_API_KEY="your DeepSeek API key"
//   $env:DEEPSEEK_MODEL="deepseek-chat"
//   node server.example.js

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createChatHandler } = require("./api/chat-handler");
const { createMemoryHandler } = require("./api/memory-handler");
const { createShortTermMemory, DEFAULT_MAX_SESSIONS, DEFAULT_TTL_MS } = require("./api/short-term-memory");
const eventHandler = require("./api/events");
const versions = require("./api/versions");
const { createTelemetry, RETENTION_DAYS, SCHEMA_VERSION } = require("./api/telemetry");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const ROOT = __dirname;

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadLocalEnv();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-chat";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

const sharedTelemetry = createTelemetry();
const sharedMemory = createShortTermMemory();
const sharedChatHandler = createChatHandler({
  apiKey: DEEPSEEK_API_KEY,
  model: DEEPSEEK_MODEL,
  baseUrl: DEEPSEEK_BASE_URL,
  timeoutMs: UPSTREAM_TIMEOUT_MS,
  telemetry: sharedTelemetry,
  memoryStore: sharedMemory
});
const sharedMemoryHandler = createMemoryHandler(sharedMemory, sharedTelemetry);

async function handleChatStream(req, res) {
  req.body = JSON.parse(await collectBody(req));
  await sharedChatHandler(req, res);
}

async function handleEvent(req, res) {
  req.body = JSON.parse(await collectBody(req));
  eventHandler(req, res);
}

async function handleMemory(req, res) {
  req.body = JSON.parse(await collectBody(req));
  sharedMemoryHandler(req, res);
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const fullPath = path.normalize(path.join(ROOT, pathname));

  if (!fullPath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS"
      });
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat/stream") {
      await handleChatStream(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/events") {
      await handleEvent(req, res);
      return;
    }

    if (req.method === "DELETE" && req.url === "/api/memory/session") {
      await handleMemory(req, res);
      return;
    }

    if (req.method === "GET") {
      if (req.url === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          keyConfigured: Boolean(DEEPSEEK_API_KEY),
          model: DEEPSEEK_MODEL,
          baseUrl: DEEPSEEK_BASE_URL,
          host: HOST,
          port: PORT,
          envFileExists: fs.existsSync(path.join(ROOT, ".env")),
          versions,
          telemetry: {
            schemaVersion: SCHEMA_VERSION,
            retentionDays: RETENTION_DAYS,
            storesConversationContent: false
          },
          policyRouter: {
            enforced: process.env.POLICY_ROUTER_ENFORCED === "true"
          },
          shortTermMemory: {
            persistence: "process_memory_only",
            ttlMinutes: DEFAULT_TTL_MS / 60000,
            maxSessions: DEFAULT_MAX_SESSIONS
          }
        });
        return;
      }

      serveStatic(req, res);
      return;
    }

    sendText(res, 405, "Method not allowed");
  } catch (error) {
    sendText(res, 500, `服务端处理失败：${error.message || "Unknown error"}`);
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`YanYa Tree Hole listening on http://${displayHost}:${PORT}`);
  console.log(`Model: ${DEEPSEEK_MODEL}`);
});
