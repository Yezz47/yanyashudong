const assert = require("node:assert");
const test = require("node:test");
const { createChatHandler } = require("../lib/chat-handler");
const { analyzeState } = require("../lib/state-analyzer");
const { recommendRoute, routePolicy } = require("../lib/policy-router");
const evaluationSet = require("./fixtures/state-analyzer-eval.json");

function state(text, mode) {
  return analyzeState([{ role: "user", content: text }], mode);
}

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

test("policy priority routes risk to SAFETY", () => {
  assert.equal(recommendRoute(state("我想自杀", "action")).route, "SAFETY");
  assert.equal(recommendRoute(state("我撑不下去了", "listen")).route, "SAFETY");
});

test("policy routes explicit action, listening and clarification needs", () => {
  assert.equal(recommendRoute(state("下一步怎么办", "action")).route, "ACT");
  assert.equal(recommendRoute(state("我只想被听见", "listen")).route, "LISTEN");
  assert.equal(recommendRoute(state("我想理解自己", "understand")).route, "CLARIFY");
  assert.equal(recommendRoute(state("发生了一些事", undefined)).route, "CLARIFY");
});

test("shadow mode separates recommended and effective routes", () => {
  const analysis = state("给我建议，下一步怎么办", "listen");
  const shadow = routePolicy(analysis, "listen", { enforced: false });
  assert.equal(shadow.recommended_route, "ACT");
  assert.equal(shadow.effective_route, "LISTEN");
  assert.equal(shadow.enforced, false);

  const enforced = routePolicy(analysis, "listen", { enforced: true });
  assert.equal(enforced.effective_route, "ACT");
});

test("invalid state is never recommended as a low-risk route", () => {
  const routing = routePolicy(null, "listen", { enforced: true });
  assert.equal(routing.recommended_route, "SAFETY");
  assert.equal(routing.effective_route, "SAFETY");
});

test("hard safety cannot be overridden by requested mode or shadow gate", () => {
  const analysis = state("请给我下一步建议", "action");
  const routing = routePolicy(analysis, "action", {
    enforced: false,
    hardSafetyTriggered: true
  });
  assert.equal(routing.recommended_route, "ACT");
  assert.equal(routing.effective_route, "SAFETY");
});

test("router failure fails safe when enforcement is enabled", async () => {
  let modelCalls = 0;
  const events = [];
  const handler = createChatHandler({
    apiKey: "unused",
    routerEnforced: true,
    telemetry: { track: (type) => events.push(type) },
    routePolicyImpl: () => {
      throw new Error("router unavailable");
    },
    fetchImpl: async () => {
      modelCalls += 1;
    }
  });
  const res = response();
  await handler(
    { method: "POST", body: { mode: "listen", messages: [{ role: "user", content: "今天还好" }] } },
    res
  );
  assert.equal(modelCalls, 0);
  assert.ok(events.includes("policy_router_failed"));
  assert.equal(res.headers["X-Yanya-Route"], "SAFETY");
});

test("policy routes the 50-case evaluation set consistently", () => {
  let correct = 0;
  for (const item of evaluationSet) {
    const expectedRoute =
      item.expected.risk !== "none"
        ? "SAFETY"
        : item.expected.intent === "action"
          ? "ACT"
          : item.expected.intent === "listen"
            ? "LISTEN"
            : "CLARIFY";
    const actual = recommendRoute(state(item.text, item.mode)).route;
    if (actual === expectedRoute) correct += 1;
  }
  assert.ok(correct / evaluationSet.length >= 0.95);
});
