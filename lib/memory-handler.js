const { validSessionId } = require("./short-term-memory");

function createMemoryHandler(memoryStore, telemetry) {
  return function memoryHandler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method !== "DELETE") {
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    }
    const sessionId = req.body?.sessionId;
    if (!validSessionId(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: false, error: "invalid_session_id" }));
    }
    const cleared = memoryStore.clear(sessionId);
    telemetry?.track?.("short_term_memory_cleared", { session_id: sessionId }, { outcome: cleared ? "cleared" : "not_found" });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ ok: true, cleared }));
  };
}

module.exports = { createMemoryHandler };
