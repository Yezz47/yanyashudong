const assert = require("node:assert");
const test = require("node:test");
const { ReadableStream } = require("node:stream/web");
const { createChatHandler } = require("../api/chat-handler");
const {
  EXPERIMENT,
  EXPERIMENT_ASSIGNMENT_SCHEMA,
  assignExperiment,
  formatExperimentForPrompt,
  validateExperimentAssignment
} = require("../api/experiment");
const { BAD_CASE_SCHEMA, analyzeFeedback, buildBadCases, validateBadCase } = require("../evaluation");

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

function sse(text) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    }
  });
}

function feedback(overrides = {}) {
  return {
    ts: Date.parse("2026-09-16T00:00:00.000Z"),
    scene: "科研",
    turns: 3,
    understood: "高",
    natural: "自然",
    helpful: "有帮助",
    willReturn: true,
    uncomfortable: "",
    requestedSupportMode: "listen",
    recommendedRoute: "LISTEN",
    effectiveRoute: "LISTEN",
    outcome: "model",
    experimentId: EXPERIMENT.id,
    experimentVariant: "open_question",
    promptVersion: "v2-warm",
    analyzerVersion: "state-analyzer-shadow-v1",
    routerVersion: "policy-router-shadow-v1",
    taskPlannerVersion: "task-planner-v1",
    shortTermMemoryVersion: "short-term-memory-v1",
    responseValidatorVersion: "response-validator-v1",
    experimentVersion: "experiment-assignment-v1",
    ...overrides
  };
}

test("experiment assignment is stable, closed and changes one declared variable", () => {
  const first = assignExperiment("session_12345678", "LISTEN");
  const second = assignExperiment("session_12345678", "ACT");
  assert.equal(EXPERIMENT_ASSIGNMENT_SCHEMA.additionalProperties, false);
  assert.equal(EXPERIMENT.variable, "closing_question_style");
  assert.deepEqual(EXPERIMENT.variants, ["open_question", "choice_question"]);
  assert.equal(first.variant, second.variant);
  assert.equal(first.eligible, true);
  assert.equal(validateExperimentAssignment(first).valid, true);
  assert.match(formatExperimentForPrompt(first), /只改变结尾问题形式/);
});

test("SAFETY is always excluded from the experience experiment", () => {
  for (const sessionId of ["session_12345678", "session_87654321", "invalid"]) {
    const assignment = assignExperiment(sessionId, "SAFETY");
    assert.equal(assignment.eligible, false);
    assert.equal(assignment.variant, "excluded");
    assert.equal(assignment.experiment_id, null);
    assert.equal(formatExperimentForPrompt(assignment), null);
  }
});

test("chat handler rejects any attempted SAFETY experiment enrollment", async () => {
  let modelCalls = 0;
  const handler = createChatHandler({
    apiKey: "unused",
    telemetry: { track() {} },
    assignExperimentImpl: () => ({
      schema_version: "1.0",
      experiment_id: EXPERIMENT.id,
      variable: EXPERIMENT.variable,
      variant: "choice_question",
      eligible: true,
      reason: "eligible_route"
    }),
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
  assert.equal(res.headers["X-Yanya-Experiment-Id"], "none");
  assert.equal(res.headers["X-Yanya-Experiment-Variant"], "excluded");
});

test("eligible chat receives a stable experiment header and one prompt constraint", async () => {
  let upstreamBody;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return { ok: true, status: 200, body: sse("我在听。你愿意从哪一小段说起？") };
    }
  });
  const res = response();
  await handler({
    method: "POST",
    body: { sessionId: "session_12345678", mode: "listen", messages: [{ role: "user", content: "论文让我有点累" }] }
  }, res);
  const promptText = upstreamBody.messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  assert.equal(res.headers["X-Yanya-Experiment-Id"], EXPERIMENT.id);
  assert.ok(EXPERIMENT.variants.includes(res.headers["X-Yanya-Experiment-Variant"]));
  assert.equal(res.headers["X-Yanya-Experiment-Version"], "experiment-assignment-v1");
  assert.match(promptText, /单变量体验实验约束/);
  assert.match(promptText, /不得改变安全/);
});

test("invalid experiment output fails closed as unassigned", async () => {
  let upstreamBody;
  const handler = createChatHandler({
    apiKey: "test-key",
    telemetry: { track() {} },
    assignExperimentImpl: () => ({ variant: "unsafe_variant" }),
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return { ok: true, status: 200, body: sse("我在听。") };
    }
  });
  const res = response();
  await handler({
    method: "POST",
    body: { sessionId: "session_12345678", mode: "listen", messages: [{ role: "user", content: "今天有点累" }] }
  }, res);
  assert.equal(res.headers["X-Yanya-Experiment-Id"], "none");
  assert.equal(res.headers["X-Yanya-Experiment-Variant"], "unassigned");
  assert.doesNotMatch(upstreamBody.messages.map((item) => item.content).join("\n"), /单变量体验实验约束/);
});

test("good feedback creates no Bad Case", () => {
  assert.deepEqual(buildBadCases(feedback()), []);
});

test("Bad Cases use closed categories and root-cause hypotheses", () => {
  const cases = buildBadCases(feedback({
    understood: "低",
    natural: "不自然",
    helpful: "无帮助",
    effectiveRoute: "ACT",
    uncomfortable: "回复里给了一个虚构热线号码"
  }));
  assert.equal(BAD_CASE_SCHEMA.additionalProperties, false);
  assert.deepEqual(cases.map((item) => item.category), [
    "misunderstood",
    "unnatural_tone",
    "unhelpful_action",
    "unsafe_response"
  ]);
  assert.ok(cases.every((item) => validateBadCase(item).valid));
  assert.equal(cases.at(-1).root_cause_hypothesis, "response_validation");
  assert.equal(cases.at(-1).severity, "high");
});

test("feedback analysis groups by scene, route, version and experiment variant", () => {
  const records = [
    feedback({ experimentVariant: "open_question" }),
    feedback({
      scene: "导师",
      understood: "低",
      effectiveRoute: "CLARIFY",
      experimentVariant: "choice_question",
      outcome: "local_fallback"
    })
  ];
  records.forEach((record) => {
    record.badCases = buildBadCases(record);
  });
  const analysis = analyzeFeedback(records);
  assert.equal(analysis.overall.total, 2);
  assert.equal(analysis.overall.high_understood_rate, 50);
  assert.equal(analysis.overall.negative_feedback_rate, 50);
  assert.equal(analysis.overall.fallback_rate, 50);
  assert.equal(analysis.by_scene["科研"].total, 1);
  assert.equal(analysis.by_route.CLARIFY.total, 1);
  assert.equal(analysis.by_recommended_route.LISTEN.total, 2);
  assert.equal(analysis.by_effective_route.CLARIFY.total, 1);
  assert.equal(analysis.by_experiment_variant.choice_question.total, 1);
  assert.equal(Object.keys(analysis.by_version).length, 1);
  assert.equal(analysis.bad_cases.category_counts.reliability_failure, 1);
});
