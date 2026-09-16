const assert = require("node:assert");
const test = require("node:test");
const evaluationSet = require("./fixtures/state-analyzer-eval.json");
const { analyzeState } = require("../api/state-analyzer");
const { evaluateCases } = require("../api/state-evaluation");
const { STATE_ANALYSIS_SCHEMA, validateStateAnalysis } = require("../api/state-schema");

test("state analyzer output conforms to the declared schema", () => {
  const result = analyzeState(
    [{ role: "user", content: "论文返修让我焦虑，我下一步该怎么办" }],
    "action"
  );
  assert.equal(validateStateAnalysis(result).valid, true);
  assert.equal(STATE_ANALYSIS_SCHEMA.additionalProperties, false);
  assert.equal(result.scene, "research");
  assert.equal(result.intent, "action");
  assert.equal(result.need, "action");
  assert.ok(result.confidence.risk >= 0 && result.confidence.risk <= 1);
  assert.match(result.rationale.scene, /场景词/);
});

test("50-case synthetic evaluation set meets shadow thresholds", () => {
  assert.equal(evaluationSet.length, 50);
  const metrics = evaluateCases(evaluationSet);
  assert.ok(metrics.accuracy.scene >= 0.9, JSON.stringify(metrics));
  assert.ok(metrics.accuracy.intent >= 0.9, JSON.stringify(metrics));
  assert.ok(metrics.accuracy.emotion >= 0.8, JSON.stringify(metrics));
  assert.ok(metrics.accuracy.need >= 0.9, JSON.stringify(metrics));
  assert.ok(metrics.risk_recall >= 0.95, JSON.stringify(metrics));
  assert.ok(metrics.risk_false_positive_rate <= 0.05, JSON.stringify(metrics));
});
