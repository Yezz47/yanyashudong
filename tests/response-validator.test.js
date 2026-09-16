const assert = require("node:assert");
const test = require("node:test");
const { ReadableStream } = require("node:stream/web");
const { createChatHandler } = require("../lib/chat-handler");
const {
  BLOCKED_RESPONSE,
  MAX_QUESTIONS,
  MAX_RESPONSE_CHARS,
  RESPONSE_VALIDATOR_OUTPUT_SCHEMA,
  validateResponse,
  validateResponseResult
} = require("../lib/response-validator");

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

function sseDeltas(deltas) {
  const payload = deltas.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join("") + "data: [DONE]\n\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    }
  });
}

function handlerWithBody(body, options = {}) {
  return createChatHandler({
    apiKey: "test-key",
    telemetry: options.telemetry || { track() {} },
    validateResponseImpl: options.validateResponseImpl,
    fetchImpl: options.fetchImpl || (async () => ({ ok: true, status: 200, body }))
  });
}

async function run(handler) {
  const res = response();
  await handler({ method: "POST", body: { mode: "listen", messages: [{ role: "user", content: "论文进展让我有点累" }] } }, res);
  return res;
}

test("validator output follows a closed schema", () => {
  const result = validateResponse("听起来这段时间确实不容易。你愿意说说最压着你的部分吗？");
  assert.equal(RESPONSE_VALIDATOR_OUTPUT_SCHEMA.additionalProperties, false);
  assert.equal(validateResponseResult(result).valid, true);
  assert.equal(result.status, "pass");
});

test("validator blocks diagnosis, promises, invented contacts, dangerous advice and privacy requests", () => {
  const cases = [
    ["你患有抑郁症。", "medical_diagnosis"],
    ["我保证你一定会好起来。", "efficacy_promise"],
    ["请拨打安心热线 400-1234567。", "fabricated_help_information"],
    ["你可以立刻停掉服药。", "dangerous_advice"],
    ["请提供你的真实姓名。", "privacy_request"]
  ];
  for (const [text, violation] of cases) {
    const result = validateResponse(text);
    assert.equal(result.status, "block");
    assert.ok(result.violations.includes(violation));
    assert.equal(result.output_text, BLOCKED_RESPONSE);
  }
});

test("validator revises lecturing, excessive questions and overlong replies", () => {
  const text = `你必须振作。为什么？然后呢？还有呢？${"这段说明很长。".repeat(100)}`;
  const result = validateResponse(text);
  assert.equal(result.status, "revise");
  assert.ok(result.violations.includes("lecturing_language"));
  assert.ok(result.violations.includes("too_many_questions"));
  assert.ok(result.violations.includes("response_too_long"));
  assert.doesNotMatch(result.output_text, /你必须/);
  assert.ok((result.output_text.match(/[？?]/g) || []).length <= MAX_QUESTIONS);
  assert.ok(result.output_text.length <= MAX_RESPONSE_CHARS);
  assert.equal(validateResponseResult(result).valid, true);
});

test("split unsafe model output is blocked before any original text reaches the client", async () => {
  const events = [];
  const handler = handlerWithBody(sseDeltas(["你患有", "抑郁症。"]), {
    telemetry: { track: (type, _context, details) => events.push({ type, details }) }
  });
  const res = await run(handler);
  assert.equal(res.status, 200);
  assert.equal(res.headers["X-Yanya-Response-Validation"], "block");
  assert.equal(res.headers["X-Yanya-Response-Validator-Version"], "response-validator-v1");
  assert.equal(res.body, BLOCKED_RESPONSE);
  assert.doesNotMatch(res.body, /抑郁症/);
  assert.ok(events.some((event) => event.type === "response_validated" && event.details.status === "block"));
});

test("invalid validator output fails closed without leaking model text", async () => {
  const handler = handlerWithBody(sseDeltas(["未校验的模型原文"]), {
    validateResponseImpl: () => ({ status: "pass", output_text: "未校验的模型原文" })
  });
  const res = await run(handler);
  assert.equal(res.status, 200);
  assert.equal(res.headers["X-Yanya-Response-Validation"], "fallback");
  assert.equal(res.body, BLOCKED_RESPONSE);
  assert.doesNotMatch(res.body, /未校验的模型原文/);
});

test("malformed upstream JSON returns an explicit degradable error", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: {not-json}\n\ndata: [DONE]\n\n"));
      controller.close();
    }
  });
  const res = await run(handlerWithBody(body));
  assert.equal(res.status, 502);
  assert.match(res.body, /数据格式异常/);
});

test("stream interruption returns 502 without releasing partial model output", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "不完整原文" } }] })}\n\n`));
      controller.error(new Error("stream interrupted"));
    }
  });
  const res = await run(handlerWithBody(body));
  assert.equal(res.status, 502);
  assert.match(res.body, /读取 DeepSeek 响应失败/);
  assert.doesNotMatch(res.body, /不完整原文/);
});

test("rate limiting keeps an explicit retryable error", async () => {
  const handler = handlerWithBody(null, {
    fetchImpl: async () => ({ ok: false, status: 429, body: null })
  });
  const res = await run(handler);
  assert.equal(res.status, 502);
  assert.match(res.body, /请求过快/);
  assert.match(res.body, /429/);
});
