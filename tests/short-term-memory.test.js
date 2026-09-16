const assert = require("node:assert");
const test = require("node:test");
const { ReadableStream } = require("node:stream/web");
const { createChatHandler } = require("../api/chat-handler");
const { createMemoryHandler } = require("../api/memory-handler");
const {
  SHORT_TERM_MEMORY_SCHEMA,
  buildMemoryCandidate,
  createShortTermMemory,
  validateShortTermMemory
} = require("../api/short-term-memory");

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

function sse(text) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    }
  });
}

test("memory stores only the declared structured fields", () => {
  const store = createShortTermMemory({ now: () => Date.parse("2026-09-16T00:00:00.000Z") });
  const memory = store.write("session_12345678", {
    current_topic: "科研",
    unfinished_tasks: ["论文或返修"],
    explicit_support_preferences: ["少给建议，先倾听"],
    last_effective_route: "LISTEN",
    raw_text: "姓名张三，学号123456"
  });
  assert.equal(SHORT_TERM_MEMORY_SCHEMA.additionalProperties, false);
  assert.equal(validateShortTermMemory(memory).valid, true);
  assert.deepEqual(Object.keys(memory), SHORT_TERM_MEMORY_SCHEMA.required);
  assert.doesNotMatch(JSON.stringify(memory), /张三|学号|raw_text/);
});

test("memory expires and evicts the oldest session at its capacity", () => {
  let now = Date.parse("2026-09-16T00:00:00.000Z");
  const store = createShortTermMemory({ now: () => now, ttlMs: 1000, maxSessions: 2 });
  const candidate = { current_topic: "科研", last_effective_route: "LISTEN" };
  store.write("session_00000001", candidate);
  store.write("session_00000002", candidate);
  store.write("session_00000003", candidate);
  assert.equal(store.read("session_00000001"), null);
  assert.equal(store.size(), 2);
  now += 1001;
  assert.equal(store.read("session_00000002"), null);
  assert.equal(store.size(), 0);
});

test("incremental memory retains pending work and removes it when completed", () => {
  const previous = {
    current_topic: "科研",
    unfinished_tasks: ["论文或返修"],
    explicit_support_preferences: [],
    last_effective_route: "ACT"
  };
  const continued = buildMemoryCandidate([{ role: "user", content: "今天想继续聊聊" }], "LISTEN", previous);
  assert.deepEqual(continued.unfinished_tasks, ["论文或返修"]);
  const completed = buildMemoryCandidate([{ role: "user", content: "论文已经完成了" }], "LISTEN", previous);
  assert.deepEqual(completed.unfinished_tasks, []);
});

test("chat injects validated memory into the next request without raw prior text", async () => {
  const bodies = [];
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 200, body: sse("我在听。") };
    }
  });
  const sessionId = "session_12345678";
  await handler({
    method: "POST",
    body: {
      sessionId,
      mode: "listen",
      messages: [{ role: "user", content: "论文返修还没完成，我只想说说，私密细节XYZ" }]
    }
  }, response());
  const secondResponse = response();
  await handler({
    method: "POST",
    body: { sessionId, mode: "understand", messages: [{ role: "user", content: "今天想继续聊聊" }] }
  }, secondResponse);

  const systemText = bodies[1].messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  assert.equal(secondResponse.headers["X-Yanya-Short-Term-Memory-Version"], "short-term-memory-v1");
  assert.match(systemText, /结构化短期记忆/);
  assert.match(systemText, /论文或返修/);
  assert.match(systemText, /少给建议，先倾听/);
  assert.match(systemText, /上次执行路线：LISTEN/);
  assert.equal(secondResponse.headers["X-Yanya-Route"], "CLARIFY");
  assert.doesNotMatch(systemText, /私密细节XYZ/);
});

test("memory failure does not interrupt the support path", async () => {
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    memoryStore: {
      read() {
        throw new Error("unavailable");
      }
    },
    fetchImpl: async () => ({ ok: true, status: 200, body: sse("我还在。") })
  });
  const res = response();
  await handler({
    method: "POST",
    body: { sessionId: "session_12345678", mode: "listen", messages: [{ role: "user", content: "今天有点累" }] }
  }, res);
  assert.equal(res.status, 200);
  assert.equal(res.headers["X-Yanya-Route"], "LISTEN");
});

test("safety routing never sends remembered context to the model", async () => {
  let modelCalls = 0;
  const store = createShortTermMemory();
  store.write("session_12345678", {
    current_topic: "科研",
    unfinished_tasks: ["论文或返修"],
    explicit_support_preferences: [],
    last_effective_route: "ACT"
  });
  const handler = createChatHandler({
    apiKey: "unused",
    telemetry: { track() {} },
    memoryStore: store,
    fetchImpl: async () => {
      modelCalls += 1;
    }
  });
  const res = response();
  await handler({
    method: "POST",
    body: { sessionId: "session_12345678", mode: "listen", messages: [{ role: "user", content: "我想自杀" }] }
  }, res);
  assert.equal(modelCalls, 0);
  assert.equal(res.headers["X-Yanya-Route"], "SAFETY");
});

test("memory clear endpoint removes exactly the requested session", () => {
  const store = createShortTermMemory();
  store.write("session_12345678", { current_topic: "科研", last_effective_route: "LISTEN" });
  store.write("session_87654321", { current_topic: "导师", last_effective_route: "CLARIFY" });
  const handler = createMemoryHandler(store, { track() {} });
  const res = response();
  handler({ method: "DELETE", body: { sessionId: "session_12345678" } }, res);
  assert.equal(res.status, 200);
  assert.equal(store.read("session_12345678"), null);
  assert.notEqual(store.read("session_87654321"), null);
});
