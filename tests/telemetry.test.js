const assert = require("node:assert");
const test = require("node:test");
const { createChatHandler } = require("../api/chat-handler");
const { createTelemetry, normalizeClientEvent } = require("../api/telemetry");

function response() {
  return {
    status: null,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status) {
      this.status = status;
    },
    write(chunk) {
      this.body += chunk;
    },
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

test("events reconstruct a safety request without storing conversation content", async () => {
  const events = [];
  const telemetry = createTelemetry({
    sink: (event) => events.push(event),
    now: () => "2026-09-15T00:00:00.000Z"
  });
  const handler = createChatHandler({
    apiKey: "unused",
    telemetry,
    fetchImpl: async () => {
      throw new Error("model must not run");
    }
  });
  const secretText = "我想自杀，姓名张三，学号123456";
  const res = response();

  await handler(
    {
      method: "POST",
      body: {
        sessionId: "session_12345678",
        requestId: "request_12345678",
        mode: "action",
        attempt: 1,
        messages: [{ role: "user", content: secretText }]
      }
    },
    res
  );

  assert.deepEqual(events.map((event) => event.event_type), [
    "request_received",
    "risk_analyzed",
    "state_analyzed_shadow",
    "policy_routed_shadow",
    "short_term_memory_loaded",
    "short_term_memory_updated",
    "experiment_assigned",
    "route_selected",
    "request_completed"
  ]);
  assert.ok(events.every((event) => event.session_id === "session_12345678"));
  assert.ok(events.every((event) => event.request_id === "request_12345678"));
  assert.equal(events.at(-1).effective_route, "SAFETY");
  assert.doesNotMatch(JSON.stringify(events), /张三|学号123456|我想自杀/);
});

test("client events only accept the privacy-safe event contract", () => {
  assert.equal(normalizeClientEvent({ eventType: "message_content" }), null);
  const event = normalizeClientEvent({
    eventType: "client_fallback",
    sessionId: "session_12345678",
    requestId: "request_12345678",
    mode: "listen",
    effectiveRoute: "LISTEN",
    outcome: "local_fallback",
    errorCode: "timeout",
    content: "不应进入事件"
  });
  assert.equal(event.details.outcome, "local_fallback");
  assert.equal(event.details.effective_route, "LISTEN");
  assert.equal("content" in event.details, false);
});

test("telemetry sink failure does not interrupt the product path", () => {
  const telemetry = createTelemetry({
    sink: () => {
      throw new Error("logger unavailable");
    }
  });
  assert.doesNotThrow(() => telemetry.track("request_received", { session_id: "session_12345678" }));
});

test("shadow analyzer failure does not change the effective safety route", async () => {
  const events = [];
  const handler = createChatHandler({
    apiKey: "unused",
    telemetry: { track: (type) => events.push(type) },
    analyzeStateImpl: () => {
      throw new Error("invalid output");
    },
    fetchImpl: async () => {
      throw new Error("model must not run");
    }
  });
  const res = response();
  await handler(
    { method: "POST", body: { messages: [{ role: "user", content: "我想自杀" }] } },
    res
  );
  assert.ok(events.includes("state_analyzer_failed"));
  assert.equal(res.headers["X-Yanya-Route"], "SAFETY");
});
