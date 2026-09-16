(function exposeEvaluation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YanyaEvaluation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEvaluation() {
  const CATEGORIES = new Set([
    "unsafe_response",
    "misunderstood",
    "unnatural_tone",
    "unhelpful_action",
    "reliability_failure",
    "uncomfortable_expression"
  ]);
  const ROOT_CAUSES = new Set([
    "state_analysis",
    "policy_routing",
    "task_planning",
    "response_validation",
    "model_generation",
    "upstream_reliability",
    "unknown"
  ]);
  const SEVERITIES = new Set(["low", "mid", "high"]);
  const ROUTES = new Set(["SAFETY", "CLARIFY", "ACT", "LISTEN"]);
  const BAD_CASE_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version", "id", "created_at", "category", "root_cause_hypothesis", "severity",
      "scene", "effective_route", "outcome", "experiment_id", "experiment_variant", "version_key", "description"
    ],
    properties: {
      schema_version: { const: "1.0" },
      id: { type: "string" },
      created_at: { type: "string", format: "date-time" },
      category: { enum: [...CATEGORIES] },
      root_cause_hypothesis: { enum: [...ROOT_CAUSES] },
      severity: { enum: [...SEVERITIES] },
      scene: { type: "string" },
      effective_route: { enum: [...ROUTES] },
      outcome: { enum: ["model", "local_fallback"] },
      experiment_id: { type: "string" },
      experiment_variant: { type: "string" },
      version_key: { type: "string" },
      description: { type: "string", maxLength: 300 }
    }
  });

  function text(value, fallback = "unknown") {
    const normalized = String(value || "").trim();
    return normalized ? normalized.slice(0, 300) : fallback;
  }

  function versionKey(record) {
    return [
      `prompt=${text(record.promptVersion)}`,
      `analyzer=${text(record.analyzerVersion)}`,
      `router=${text(record.routerVersion)}`,
      `planner=${text(record.taskPlannerVersion)}`,
      `memory=${text(record.shortTermMemoryVersion)}`,
      `validator=${text(record.responseValidatorVersion)}`,
      `experiment=${text(record.experimentVersion)}`
    ].join("|");
  }

  function createBadCase(record, index, category, rootCause, severity, description) {
    const candidateTimestamp = Number(record.ts);
    const timestamp = Number.isFinite(candidateTimestamp) && Number.isFinite(new Date(candidateTimestamp).getTime())
      ? candidateTimestamp
      : Date.now();
    return {
      schema_version: "1.0",
      id: `badcase_${timestamp}_${index}`,
      created_at: new Date(timestamp).toISOString(),
      category,
      root_cause_hypothesis: rootCause,
      severity,
      scene: text(record.scene, "未识别"),
      effective_route: ROUTES.has(record.effectiveRoute) ? record.effectiveRoute : "CLARIFY",
      outcome: record.outcome === "local_fallback" ? "local_fallback" : "model",
      experiment_id: text(record.experimentId, "none"),
      experiment_variant: text(record.experimentVariant, "unassigned"),
      version_key: versionKey(record),
      description: text(description, "未提供自由文本")
    };
  }

  function buildBadCases(record = {}) {
    const candidates = [];
    if (record.outcome === "local_fallback") {
      candidates.push(["reliability_failure", "upstream_reliability", "mid", "请求降级为本地回复"]);
    }
    if (record.understood === "低") {
      candidates.push(["misunderstood", "state_analysis", "mid", "被理解感评分为低"]);
    }
    if (record.natural === "不自然") {
      candidates.push(["unnatural_tone", "model_generation", "low", "自然度评分为不自然"]);
    }
    if (record.helpful === "无帮助" && record.effectiveRoute === "ACT") {
      candidates.push(["unhelpful_action", "task_planning", "mid", "行动路线的建议帮助度为无帮助"]);
    }
    const uncomfortable = text(record.uncomfortable, "");
    if (uncomfortable) {
      const unsafe = /诊断|抑郁症|焦虑症|治好|保证|热线|号码|停药|自伤|自杀方法|身份证|学号|手机号/.test(uncomfortable);
      candidates.push(unsafe
        ? ["unsafe_response", "response_validation", "high", uncomfortable]
        : ["uncomfortable_expression", "model_generation", "mid", uncomfortable]);
    }
    return candidates.map((candidate, index) => createBadCase(record, index, ...candidate));
  }

  function validateBadCase(item) {
    const errors = [];
    const keys = Object.keys(item || {});
    const expected = BAD_CASE_SCHEMA.required;
    if (!item || typeof item !== "object" || Array.isArray(item)) errors.push("bad case must be an object");
    if (keys.some((key) => !expected.includes(key))) errors.push("bad case has additional properties");
    if (expected.some((key) => !keys.includes(key))) errors.push("bad case is missing required properties");
    if (item?.schema_version !== "1.0") errors.push("invalid schema_version");
    if (!CATEGORIES.has(item?.category)) errors.push("invalid category");
    if (!ROOT_CAUSES.has(item?.root_cause_hypothesis)) errors.push("invalid root cause");
    if (!SEVERITIES.has(item?.severity)) errors.push("invalid severity");
    if (!ROUTES.has(item?.effective_route)) errors.push("invalid route");
    if (!["model", "local_fallback"].includes(item?.outcome)) errors.push("invalid outcome");
    for (const key of ["id", "scene", "experiment_id", "experiment_variant", "version_key"]) {
      if (typeof item?.[key] !== "string" || !item[key].trim()) errors.push(`invalid ${key}`);
    }
    if (typeof item?.description !== "string" || item.description.length > 300) errors.push("invalid description");
    if (!Number.isFinite(Date.parse(item?.created_at))) errors.push("invalid created_at");
    return { valid: errors.length === 0, errors };
  }

  function metric(records) {
    const total = records.length;
    const cases = records.flatMap((record) => Array.isArray(record.badCases) ? record.badCases : buildBadCases(record));
    const percent = (count) => total ? Math.round((count / total) * 100) : 0;
    return {
      total,
      high_understood_rate: percent(records.filter((record) => record.understood === "高").length),
      return_rate: percent(records.filter((record) => record.willReturn).length),
      negative_feedback_rate: percent(records.filter((record) => (Array.isArray(record.badCases) ? record.badCases : buildBadCases(record)).length > 0).length),
      fallback_rate: percent(records.filter((record) => record.outcome === "local_fallback").length),
      bad_case_count: cases.length
    };
  }

  function group(records, keyOf) {
    const groups = {};
    for (const record of records) {
      const key = text(keyOf(record));
      (groups[key] ||= []).push(record);
    }
    return Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, metric(items)]));
  }

  function countBy(items, key) {
    const counts = {};
    for (const item of items) counts[item[key]] = (counts[item[key]] || 0) + 1;
    return counts;
  }

  function analyzeFeedback(records) {
    const list = Array.isArray(records) ? records.filter((record) => record && typeof record === "object") : [];
    const cases = list.flatMap((record) => Array.isArray(record.badCases) ? record.badCases : buildBadCases(record));
    return {
      schema_version: "1.0",
      overall: metric(list),
      by_scene: group(list, (record) => record.scene || "未识别"),
      by_route: group(list, (record) => record.effectiveRoute || "CLARIFY"),
      by_recommended_route: group(list, (record) => record.recommendedRoute || "CLARIFY"),
      by_effective_route: group(list, (record) => record.effectiveRoute || "CLARIFY"),
      by_version: group(list, versionKey),
      by_experiment_variant: group(list, (record) => record.experimentVariant || "unassigned"),
      bad_cases: {
        category_counts: countBy(cases, "category"),
        root_cause_counts: countBy(cases, "root_cause_hypothesis"),
        severity_counts: countBy(cases, "severity")
      }
    };
  }

  return { BAD_CASE_SCHEMA, analyzeFeedback, buildBadCases, validateBadCase, versionKey };
});
