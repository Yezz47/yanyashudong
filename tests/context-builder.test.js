const assert = require("node:assert");
const test = require("node:test");
const { buildContext, RECENT_MESSAGE_LIMIT } = require("../lib/context-builder");
const { createChatHandler } = require("../lib/chat-handler");

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
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

test("short conversations pass through without a synthetic summary", () => {
  const messages = [
    { role: "user", content: "今天实验有点卡" },
    { role: "assistant", content: "听起来不太容易。" }
  ];
  const context = buildContext(messages);
  assert.equal(context.total_message_count, 2);
  assert.deepEqual(context.recentMessages, messages);
  assert.equal(context.summary.source_message_count, 0);
  assert.equal(context.summaryText, null);
});

test("long conversations keep only recent messages and summarize stable labels", () => {
  const messages = [
    { role: "user", content: "论文返修还没完成，我现在只想被听见，具体私密细节XYZ" },
    { role: "assistant", content: "我在听。" },
    { role: "user", content: "导师沟通也还没准备好。" },
    ...Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `最近消息 ${index}`
    }))
  ];
  const context = buildContext(messages);
  assert.equal(context.recentMessages.length, RECENT_MESSAGE_LIMIT);
  assert.equal(context.summary.source_message_count, 3);
  assert.deepEqual(context.summary.topics, ["科研", "导师"]);
  assert.deepEqual(context.summary.unfinished_tasks, ["论文或返修", "导师沟通或组会"]);
  assert.deepEqual(context.summary.explicit_preferences, ["少给建议，先倾听"]);
  assert.doesNotMatch(context.summaryText, /私密细节XYZ/);
});

test("completed work is not retained as an unfinished task", () => {
  const messages = [
    { role: "user", content: "论文已经完成，返修也做完了。" },
    ...Array.from({ length: RECENT_MESSAGE_LIMIT }, (_, index) => ({
      role: "assistant",
      content: `消息 ${index}`
    }))
  ];
  assert.deepEqual(buildContext(messages).summary.unfinished_tasks, []);
});

test("risk detection still scans messages older than the context window", async () => {
  let modelCalls = 0;
  const handler = createChatHandler({
    apiKey: "unused",
    telemetry: { track() {} },
    fetchImpl: async () => {
      modelCalls += 1;
    }
  });
  const messages = [
    { role: "user", content: "我想自杀" },
    ...Array.from({ length: RECENT_MESSAGE_LIMIT }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `后续消息 ${index}`
    }))
  ];
  const res = response();
  await handler({ method: "POST", body: { mode: "listen", messages } }, res);
  assert.equal(modelCalls, 0);
  assert.equal(res.headers["X-Yanya-Route"], "SAFETY");
});
