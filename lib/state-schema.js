const STATE_ENUMS = Object.freeze({
  scene: ["research", "advisor", "future", "mixed", "unknown"],
  intent: ["listen", "understand", "action", "safety", "unknown"],
  emotion: ["anxious", "wronged", "self_blame", "exhausted", "angry", "ashamed", "frustrated", "powerless", "positive", "mixed", "unknown"],
  need: ["listening", "clarity", "action", "safety", "unknown"],
  risk: ["high", "mid", "none", "unknown"]
});

const STATE_ANALYSIS_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "StateAnalysis",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "scene", "intent", "emotion", "need", "risk", "confidence", "rationale"],
  properties: {
    schema_version: { const: "1.0" },
    scene: { enum: STATE_ENUMS.scene },
    intent: { enum: STATE_ENUMS.intent },
    emotion: { enum: STATE_ENUMS.emotion },
    need: { enum: STATE_ENUMS.need },
    risk: { enum: STATE_ENUMS.risk },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["scene", "intent", "emotion", "need", "risk"],
      properties: Object.fromEntries(
        ["scene", "intent", "emotion", "need", "risk"].map((field) => [
          field,
          { type: "number", minimum: 0, maximum: 1 }
        ])
      )
    },
    rationale: {
      type: "object",
      additionalProperties: false,
      required: ["scene", "intent", "emotion", "need", "risk"],
      properties: Object.fromEntries(
        ["scene", "intent", "emotion", "need", "risk"].map((field) => [field, { type: "string", maxLength: 80 }])
      )
    }
  }
});

function validateStateAnalysis(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["analysis must be an object"] };
  }
  if (value.schema_version !== "1.0") errors.push("invalid schema_version");
  for (const field of ["scene", "intent", "emotion", "need", "risk"]) {
    if (!STATE_ENUMS[field].includes(value[field])) errors.push(`invalid ${field}`);
    const confidence = value.confidence?.[field];
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      errors.push(`invalid confidence.${field}`);
    }
    if (typeof value.rationale?.[field] !== "string" || value.rationale[field].length > 80) {
      errors.push(`invalid rationale.${field}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { STATE_ANALYSIS_SCHEMA, STATE_ENUMS, validateStateAnalysis };
