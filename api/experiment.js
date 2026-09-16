const EXPERIMENT_VERSION = "experiment-assignment-v1";
const EXPERIMENT = Object.freeze({
  id: "closing-question-style-v1",
  variable: "closing_question_style",
  variants: Object.freeze(["open_question", "choice_question"]),
  eligible_routes: Object.freeze(["LISTEN", "CLARIFY", "ACT"])
});
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

const EXPERIMENT_ASSIGNMENT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "experiment_id", "variable", "variant", "eligible", "reason"],
  properties: {
    schema_version: { const: "1.0" },
    experiment_id: { type: ["string", "null"], enum: [null, EXPERIMENT.id] },
    variable: { type: ["string", "null"], enum: [null, EXPERIMENT.variable] },
    variant: { enum: ["open_question", "choice_question", "excluded", "unassigned"] },
    eligible: { type: "boolean" },
    reason: { enum: ["eligible_route", "safety_route", "invalid_session", "ineligible_route"] }
  }
});

function stableBucket(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assignExperiment(sessionId, effectiveRoute) {
  if (effectiveRoute === "SAFETY") {
    return {
      schema_version: "1.0",
      experiment_id: null,
      variable: null,
      variant: "excluded",
      eligible: false,
      reason: "safety_route"
    };
  }
  if (!SESSION_ID_PATTERN.test(String(sessionId || ""))) {
    return {
      schema_version: "1.0",
      experiment_id: null,
      variable: null,
      variant: "unassigned",
      eligible: false,
      reason: "invalid_session"
    };
  }
  if (!EXPERIMENT.eligible_routes.includes(effectiveRoute)) {
    return {
      schema_version: "1.0",
      experiment_id: null,
      variable: null,
      variant: "excluded",
      eligible: false,
      reason: "ineligible_route"
    };
  }
  return {
    schema_version: "1.0",
    experiment_id: EXPERIMENT.id,
    variable: EXPERIMENT.variable,
    variant: EXPERIMENT.variants[stableBucket(`${EXPERIMENT.id}:${sessionId}`) % EXPERIMENT.variants.length],
    eligible: true,
    reason: "eligible_route"
  };
}

function validateExperimentAssignment(assignment) {
  const errors = [];
  const keys = Object.keys(assignment || {});
  const expected = EXPERIMENT_ASSIGNMENT_SCHEMA.required;
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) errors.push("assignment must be an object");
  if (keys.some((key) => !expected.includes(key))) errors.push("assignment has additional properties");
  if (expected.some((key) => !keys.includes(key))) errors.push("assignment is missing required properties");
  if (assignment?.schema_version !== "1.0") errors.push("invalid schema_version");
  if (![null, EXPERIMENT.id].includes(assignment?.experiment_id)) errors.push("invalid experiment_id");
  if (![null, EXPERIMENT.variable].includes(assignment?.variable)) errors.push("invalid variable");
  if (![...EXPERIMENT.variants, "excluded", "unassigned"].includes(assignment?.variant)) errors.push("invalid variant");
  if (typeof assignment?.eligible !== "boolean") errors.push("invalid eligible");
  if (!["eligible_route", "safety_route", "invalid_session", "ineligible_route"].includes(assignment?.reason)) errors.push("invalid reason");
  if (assignment?.eligible && (!assignment.experiment_id || !assignment.variable || !EXPERIMENT.variants.includes(assignment.variant))) errors.push("invalid eligible assignment");
  if (!assignment?.eligible && (assignment?.experiment_id !== null || assignment?.variable !== null)) errors.push("excluded assignment must not name an experiment");
  return { valid: errors.length === 0, errors };
}

function formatExperimentForPrompt(assignment) {
  if (!validateExperimentAssignment(assignment).valid || !assignment.eligible) return null;
  const closingRule = assignment.variant === "choice_question"
    ? "本轮结尾只使用一个可拒绝的二选一轻问题。"
    : "本轮结尾只使用一个可拒绝的开放式轻问题。";
  return [
    "以下是单变量体验实验约束，只改变结尾问题形式，不得改变安全、诊断、隐私、行动数量或其他回复规则。",
    closingRule
  ].join("\n");
}

module.exports = {
  EXPERIMENT,
  EXPERIMENT_ASSIGNMENT_SCHEMA,
  EXPERIMENT_VERSION,
  assignExperiment,
  formatExperimentForPrompt,
  validateExperimentAssignment
};
