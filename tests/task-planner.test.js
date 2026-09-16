const assert = require("node:assert");
const test = require("node:test");
const { ReadableStream } = require("node:stream/web");
const { createChatHandler } = require("../lib/chat-handler");
const { analyzeState } = require("../lib/state-analyzer");
const {
  TASK_PLANNER_INPUT_SCHEMA,
  TASK_PLANNER_OUTPUT_SCHEMA,
  buildPlanningInput,
  planTask,
  validatePlanningInput,
  validatePlanningOutput
} = require("../lib/task-planner");

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

function messages(text) {
  return [{ role: "user", content: text }];
}

test("planner input and output conform to explicit schemas", () => {
  const text = "论文返修下一步怎么办";
  const input = buildPlanningInput(analyzeState(messages(text), "action"), messages(text));
  assert.equal(TASK_PLANNER_INPUT_SCHEMA.additionalProperties, false);
  assert.equal(TASK_PLANNER_OUTPUT_SCHEMA.additionalProperties, false);
  assert.equal(validatePlanningInput(input).valid, true);

  const output = planTask(input);
  assert.equal(validatePlanningOutput(output).valid, true);
  assert.equal(output.status, "ok");
  assert.equal(output.task_type, "research");
  assert.ok(output.action.duration_minutes <= 15);
  assert.equal(Array.isArray(output.action), false);
});

test("planner asks for clarification instead of inventing a generic plan", () => {
  const text = "我不知道下一步怎么办";
  const input = buildPlanningInput(analyzeState(messages(text), "action"), messages(text));
  const output = planTask(input);
  assert.equal(output.status, "needs_clarification");
  assert.equal(output.action, null);
  assert.match(output.clarification, /具体对象/);
});

test("planner blocks all known or unknown risk states", () => {
  for (const risk of ["high", "mid", "unknown"]) {
    const output = planTask({
      schema_version: "1.0",
      scene: "research",
      intent: "action",
      risk,
      user_text: "论文下一步怎么办"
    });
    assert.equal(output.status, "blocked");
    assert.equal(output.action, null);
  }
});

test("invalid planner input and output are rejected", () => {
  assert.equal(validatePlanningInput({}).valid, false);
  assert.equal(
    validatePlanningOutput({
      schema_version: "1.0",
      status: "ok",
      task_type: "general",
      action: { title: "虚假计划", instruction: "做很多事", duration_minutes: 60, completion_signal: "全部完成" },
      clarification: null
    }).valid,
    false
  );
});

test("high risk never invokes the task planner or ordinary model", async () => {
  let plannerCalls = 0;
  let modelCalls = 0;
  const handler = createChatHandler({
    apiKey: "unused",
    telemetry: { track() {} },
    planTaskImpl: () => {
      plannerCalls += 1;
    },
    fetchImpl: async () => {
      modelCalls += 1;
    }
  });
  const res = response();
  await handler({ method: "POST", body: { mode: "action", messages: messages("论文压力让我想自杀") } }, res);
  assert.equal(plannerCalls, 0);
  assert.equal(modelCalls, 0);
  assert.equal(res.headers["X-Yanya-Route"], "SAFETY");
});

test("successful ACT injects one validated low-burden plan", async () => {
  let upstreamBody;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return { ok: true, status: 200, body: sse("我们只做这一小步。") };
    }
  });
  const res = response();
  await handler({ method: "POST", body: { mode: "action", messages: messages("论文返修下一步怎么办") } }, res);
  const prompts = upstreamBody.messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  assert.equal(res.headers["X-Yanya-Route"], "ACT");
  assert.equal(res.headers["X-Yanya-Task-Planner-Version"], "task-planner-v1");
  assert.match(prompts, /Task Planning Tool/);
  assert.match(prompts, /预计时长：15 分钟/);
});

test("insufficient information changes ACT to CLARIFY without a fabricated plan", async () => {
  let upstreamBody;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return { ok: true, status: 200, body: sse("你想先推进哪一类事情？") };
    }
  });
  const res = response();
  await handler({ method: "POST", body: { mode: "action", messages: messages("我不知道下一步怎么办") } }, res);
  const prompts = upstreamBody.messages.map((item) => item.content).join("\n");
  assert.equal(res.headers["X-Yanya-Route"], "CLARIFY");
  assert.match(prompts, /没有生成行动计划/);
  assert.doesNotMatch(prompts, /预计时长：/);
});

test("invalid tool output degrades to CLARIFY and forbids fabricated results", async () => {
  let upstreamBody;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    planTaskImpl: () => ({ status: "ok", action: { title: "未校验结果" } }),
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return { ok: true, status: 200, body: sse("我先确认一下具体事项。") };
    }
  });
  const res = response();
  await handler({ method: "POST", body: { mode: "action", messages: messages("论文下一步怎么办") } }, res);
  const prompts = upstreamBody.messages.map((item) => item.content).join("\n");
  assert.equal(res.headers["X-Yanya-Route"], "CLARIFY");
  assert.match(prompts, /调用失败/);
  assert.match(prompts, /不要虚构工具结果/);
  assert.doesNotMatch(prompts, /未校验结果/);
});

test("non-ACT routes do not invoke the task planner", async () => {
  let plannerCalls = 0;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    planTaskImpl: () => {
      plannerCalls += 1;
    },
    fetchImpl: async () => ({ ok: true, status: 200, body: sse("我在听。") })
  });
  const res = response();
  await handler({ method: "POST", body: { mode: "listen", messages: messages("今天实验让我很累") } }, res);
  assert.equal(plannerCalls, 0);
  assert.equal(res.headers["X-Yanya-Route"], "LISTEN");
});
