const RESPONSE_VALIDATOR_SCHEMA_VERSION = "1.0";
const MAX_RESPONSE_CHARS = 600;
const MAX_QUESTIONS = 2;
const STATUSES = new Set(["pass", "revise", "block"]);
const VIOLATIONS = new Set([
  "medical_diagnosis",
  "efficacy_promise",
  "fabricated_help_information",
  "dangerous_advice",
  "privacy_request",
  "lecturing_language",
  "too_many_questions",
  "response_too_long",
  "empty_response"
]);

const RESPONSE_VALIDATOR_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "status", "violations", "original_length", "output_text"],
  properties: {
    schema_version: { const: RESPONSE_VALIDATOR_SCHEMA_VERSION },
    status: { enum: [...STATUSES] },
    violations: { type: "array", uniqueItems: true, items: { enum: [...VIOLATIONS] } },
    original_length: { type: "integer", minimum: 0 },
    output_text: { type: "string", minLength: 1, maxLength: MAX_RESPONSE_CHARS }
  }
});

const BLOCKED_RESPONSE = "刚才那种说法不够可靠，我不想用不确定或越界的内容回应你。我们先回到你此刻最需要的支持：你更希望我先听你说，还是陪你理清一个小问题？";

const blockingRules = [
  ["medical_diagnosis", /(你|这)(就是|是|患有|得了|属于).{0,10}(抑郁症|焦虑症|双相|精神疾病|心理疾病)|确诊为.{0,10}(抑郁症|焦虑症|双相|精神疾病|心理疾病)/i],
  ["efficacy_promise", /(我能|保证|一定|肯定).{0,10}(治好|治愈|好起来|恢复正常)/i],
  ["fabricated_help_information", /(热线|电话|拨打|联系).{0,16}\d{3,4}[-\s]?\d{5,8}/i],
  ["dangerous_advice", /(不用|不要|立刻停止|停掉).{0,8}(吃药|服药|治疗)|伤害自己.{0,8}(可以|没关系)|自杀.{0,8}(方法|步骤)/i],
  ["privacy_request", /(告诉|提供|发给).{0,8}(真实姓名|学号|身份证|详细住址|手机号)/i]
];

const lecturingRule = /你应该|你必须|听我的|别想太多|这都是为了你好/g;

function questionCount(text) {
  return (text.match(/[？?]/g) || []).length;
}

function trimToLimit(text) {
  if (text.length <= MAX_RESPONSE_CHARS) return text;
  const slice = text.slice(0, MAX_RESPONSE_CHARS - 1);
  const boundary = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("！"), slice.lastIndexOf("？"), slice.lastIndexOf("\n"));
  return `${slice.slice(0, boundary >= 240 ? boundary + 1 : slice.length).trim()}…`;
}

function limitQuestions(text) {
  let seen = 0;
  return text.replace(/[？?]/g, (mark) => {
    seen += 1;
    return seen <= MAX_QUESTIONS ? mark : "。";
  });
}

function softenLecturing(text) {
  return text
    .replace(/你应该/g, "或许可以")
    .replace(/你必须/g, "如果愿意，可以先")
    .replace(/听我的/g, "如果你愿意")
    .replace(/别想太多/g, "我们可以先慢一点")
    .replace(/这都是为了你好/g, "选择权仍然在你");
}

function validateResponse(text) {
  const original = String(text || "").trim();
  const violations = [];
  if (!original) {
    return {
      schema_version: RESPONSE_VALIDATOR_SCHEMA_VERSION,
      status: "block",
      violations: ["empty_response"],
      original_length: 0,
      output_text: BLOCKED_RESPONSE
    };
  }

  for (const [code, pattern] of blockingRules) {
    if (pattern.test(original)) violations.push(code);
  }
  if (violations.length) {
    return {
      schema_version: RESPONSE_VALIDATOR_SCHEMA_VERSION,
      status: "block",
      violations,
      original_length: original.length,
      output_text: BLOCKED_RESPONSE
    };
  }

  if (lecturingRule.test(original)) violations.push("lecturing_language");
  lecturingRule.lastIndex = 0;
  if (questionCount(original) > MAX_QUESTIONS) violations.push("too_many_questions");
  if (original.length > MAX_RESPONSE_CHARS) violations.push("response_too_long");

  let outputText = original;
  if (violations.includes("lecturing_language")) outputText = softenLecturing(outputText);
  if (violations.includes("too_many_questions")) outputText = limitQuestions(outputText);
  if (violations.includes("response_too_long")) outputText = trimToLimit(outputText);
  return {
    schema_version: RESPONSE_VALIDATOR_SCHEMA_VERSION,
    status: violations.length ? "revise" : "pass",
    violations,
    original_length: original.length,
    output_text: outputText
  };
}

function validateResponseResult(result) {
  const errors = [];
  const keys = Object.keys(result || {});
  const expected = RESPONSE_VALIDATOR_OUTPUT_SCHEMA.required;
  if (!result || typeof result !== "object" || Array.isArray(result)) errors.push("result must be an object");
  if (keys.some((key) => !expected.includes(key))) errors.push("result has additional properties");
  if (expected.some((key) => !keys.includes(key))) errors.push("result is missing required properties");
  if (result?.schema_version !== RESPONSE_VALIDATOR_SCHEMA_VERSION) errors.push("invalid schema_version");
  if (!STATUSES.has(result?.status)) errors.push("invalid status");
  if (!Array.isArray(result?.violations) || result?.violations.some((item) => !VIOLATIONS.has(item)) || new Set(result?.violations).size !== result?.violations?.length) {
    errors.push("invalid violations");
  }
  if (!Number.isInteger(result?.original_length) || result.original_length < 0) errors.push("invalid original_length");
  if (typeof result?.output_text !== "string" || !result.output_text.trim() || result.output_text.length > MAX_RESPONSE_CHARS) errors.push("invalid output_text");
  if (result?.status === "pass" && result?.violations?.length) errors.push("pass cannot include violations");
  if (result?.status !== "pass" && !result?.violations?.length) errors.push("non-pass must include violations");
  return { valid: errors.length === 0, errors };
}

module.exports = {
  BLOCKED_RESPONSE,
  MAX_QUESTIONS,
  MAX_RESPONSE_CHARS,
  RESPONSE_VALIDATOR_OUTPUT_SCHEMA,
  validateResponse,
  validateResponseResult
};
