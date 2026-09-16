const assert = require("node:assert");
const test = require("node:test");
const { ReadableStream } = require("node:stream/web");
const { createChatHandler } = require("../api/chat-handler");
const { detectRisk } = require("../api/safety");
const quietTelemetry = { track() {} };

function response() {
  return {
    status: null,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = String(value);
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    write(chunk) {
      this.body += chunk;
    },
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

function sse(text = "") {
  const payload = text
    ? `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
    : "data: [DONE]\n\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    }
  });
}

test("high risk is forced to SAFETY without calling the model", async () => {
  let calls = 0;
  const handler = createChatHandler({
    apiKey: "",
    telemetry: quietTelemetry,
    fetchImpl: async () => {
      calls += 1;
    }
  });
  const res = response();
  await handler(
    { method: "POST", body: { mode: "action", messages: [{ role: "user", content: "我想自杀" }] } },
    res
  );
  assert.equal(calls, 0);
  assert.equal(res.status, 200);
  assert.equal(res.headers["X-Yanya-Route"], "SAFETY");
  assert.equal(res.headers["X-Yanya-Risk-Level"], "high");
  assert.match(res.body, /可信任的人/);
  assert.match(res.body, /当地紧急服务/);
});

test("assistant text cannot trigger user risk routing", () => {
  assert.equal(detectRisk([{ role: "assistant", content: "如果你想自杀，请联系帮助" }]), null);
});

test("normal input reaches the shared prompt and streams output", async () => {
  let requestBody;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: quietTelemetry,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, body: sse("我在这里。") };
    }
  });
  const res = response();
  await handler(
    { method: "POST", body: { mode: "listen", messages: [{ role: "user", content: "论文进展有点慢" }] } },
    res
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers["X-Yanya-Route"], "LISTEN");
  assert.equal(res.headers["X-Yanya-Prompt-Version"], "v2-warm");
  assert.match(requestBody.messages[0].content, /研压树洞/);
  assert.equal(res.body, "我在这里。");
});

test("upstream timeout or network failure returns a degradable 502", async () => {
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: quietTelemetry,
    fetchImpl: async () => {
      const error = new Error("timeout");
      error.name = "AbortError";
      throw error;
    }
  });
  const res = response();
  await handler({ method: "POST", body: { messages: [{ role: "user", content: "有点累" }] } }, res);
  assert.equal(res.status, 502);
  assert.match(res.body, /AbortError/);
});

test("empty upstream response returns a degradable 502", async () => {
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: quietTelemetry,
    fetchImpl: async () => ({ ok: true, status: 200, body: sse() })
  });
  const res = response();
  await handler({ method: "POST", body: { messages: [{ role: "user", content: "今天还好" }] } }, res);
  assert.equal(res.status, 502);
  assert.match(res.body, /空响应/);
});
