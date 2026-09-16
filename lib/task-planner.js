const { STATE_ENUMS, validateStateAnalysis } = require("./state-schema");

const TASK_PLANNER_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "scene", "intent", "risk", "user_text"],
  properties: {
    schema_version: { const: "1.0" },
    scene: { enum: STATE_ENUMS.scene },
    intent: { enum: STATE_ENUMS.intent },
    risk: { enum: STATE_ENUMS.risk },
    user_text: { type: "string", minLength: 1, maxLength: 1000 }
  }
});

const TASK_PLANNER_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "status", "task_type", "action", "clarification"],
  properties: {
    schema_version: { const: "1.0" },
    status: { enum: ["ok", "needs_clarification", "blocked"] },
    task_type: { enum: ["research", "advisor", "future", "general", "unknown"] },
    action: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "instruction", "duration_minutes", "completion_signal"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 40 },
            instruction: { type: "string", minLength: 1, maxLength: 180 },
            duration_minutes: { type: "integer", minimum: 5, maximum: 15 },
            completion_signal: { type: "string", minLength: 1, maxLength: 80 }
          }
        }
      ]
    },
    clarification: { anyOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: 100 }] }
  }
});

function latestUserText(messages) {
  return [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.role !== "assistant" && String(message.content || "").trim())
    ?.content?.toString()
    .trim() || "";
}

function buildPlanningInput(state, messages) {
  const validState = validateStateAnalysis(state).valid;
  return {
    schema_version: "1.0",
    scene: validState ? state.scene : "unknown",
    intent: validState ? state.intent : "unknown",
    risk: validState ? state.risk : "unknown",
    user_text: latestUserText(messages)
  };
}

function validatePlanningInput(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: ["input must be an object"] };
  if (input.schema_version !== "1.0") errors.push("invalid schema_version");
  if (!STATE_ENUMS.scene.includes(input.scene)) errors.push("invalid scene");
  if (!STATE_ENUMS.intent.includes(input.intent)) errors.push("invalid intent");
  if (!STATE_ENUMS.risk.includes(input.risk)) errors.push("invalid risk");
  if (typeof input.user_text !== "string" || !input.user_text.trim() || input.user_text.length > 1000) {
    errors.push("invalid user_text");
  }
  return { valid: errors.length === 0, errors };
}

function validatePlanningOutput(output) {
  const errors = [];
  if (!output || typeof output !== "object" || Array.isArray(output)) return { valid: false, errors: ["output must be an object"] };
  if (output.schema_version !== "1.0") errors.push("invalid schema_version");
  if (!["ok", "needs_clarification", "blocked"].includes(output.status)) errors.push("invalid status");
  if (!["research", "advisor", "future", "general", "unknown"].includes(output.task_type)) errors.push("invalid task_type");
  if (output.status === "ok") {
    const action = output.action;
    if (!action || typeof action !== "object" || Array.isArray(action)) errors.push("missing action");
    if (!action || typeof action.title !== "string" || !action.title || action.title.length > 40) errors.push("invalid action.title");
    if (!action || typeof action.instruction !== "string" || !action.instruction || action.instruction.length > 180) errors.push("invalid action.instruction");
    if (!action || !Number.isInteger(action.duration_minutes) || action.duration_minutes < 5 || action.duration_minutes > 15) {
      errors.push("invalid action.duration_minutes");
    }
    if (!action || typeof action.completion_signal !== "string" || !action.completion_signal || action.completion_signal.length > 80) {
      errors.push("invalid action.completion_signal");
    }
    if (output.clarification !== null) errors.push("ok output must not include clarification");
  } else {
    if (output.action !== null) errors.push("non-ok output must not include action");
    if (typeof output.clarification !== "string" || !output.clarification || output.clarification.length > 100) {
      errors.push("invalid clarification");
    }
  }
  return { valid: errors.length === 0, errors };
}

function action(title, instruction, durationMinutes, completionSignal, taskType) {
  return {
    schema_version: "1.0",
    status: "ok",
    task_type: taskType,
    action: {
      title,
      instruction,
      duration_minutes: durationMinutes,
      completion_signal: completionSignal
    },
    clarification: null
  };
}

function finalizeOutput(output) {
  const validation = validatePlanningOutput(output);
  if (!validation.valid) throw new Error(validation.errors.join(", "));
  return output;
}

function planTask(input) {
  const inputValidation = validatePlanningInput(input);
  if (!inputValidation.valid) throw new Error(inputValidation.errors.join(", "));
  if (input.risk !== "none") {
    return finalizeOutput({
      schema_version: "1.0",
      status: "blocked",
      task_type: "unknown",
      action: null,
      clarification: "现在先不制定任务计划，我们需要优先确认你的安全和现实支持。"
    });
  }
  if (input.intent !== "action") {
    return finalizeOutput({
      schema_version: "1.0",
      status: "needs_clarification",
      task_type: input.scene === "unknown" || input.scene === "mixed" ? "unknown" : input.scene,
      action: null,
      clarification: "你更希望我陪你继续梳理，还是一起找一个很小的下一步？"
    });
  }

  const text = input.user_text;
  let result;
  if (/实验|数据|复现|模型|指标/.test(text)) {
    result = action("写下最小验证", "用 15 分钟写三行：当前结果、一个可能原因、下一次最小验证。只写下来，不要求现在解决。", 15, "三行内容已经写下", "research");
  } else if (/论文|投稿|返修|审稿/.test(text)) {
    result = action("标出一个修改点", "打开论文或反馈，用 15 分钟只标出一个最容易处理的修改点，并写一句准备怎样改。", 15, "一个修改点和一句处理思路已标出", "research");
  } else if (/代码|报错|参数|输入|输出/.test(text)) {
    result = action("记录一个技术卡点", "用 10 分钟记录报错、输入、输出和最近一次改动，各写一句，不要求立刻修好。", 10, "四项卡点信息已经记录", "research");
  } else if (/导师|组会|汇报|沟通|反馈|课题组/.test(text)) {
    result = action("写一版沟通草稿", "用 10 分钟写三句不发送的草稿：我理解的反馈、我已完成的部分、我想确认的问题。", 10, "三句草稿已经写完", "advisor");
  } else if (/就业|找工作|简历|offer|岗位/.test(text)) {
    result = action("处理一个求职小项", "用 15 分钟只修改一条简历经历，或收藏一个符合方向的岗位；二选一即可。", 15, "一条经历已修改或一个岗位已收藏", "future");
  } else if (/毕业|延期|答辩|升学|考博|申请/.test(text)) {
    result = action("确认最近节点", "用 10 分钟写下最近的一个节点、截止时间和唯一下一步，不展开完整计划。", 10, "节点、时间和下一步已经写下", "future");
  } else {
    result = {
      schema_version: "1.0",
      status: "needs_clarification",
      task_type: "unknown",
      action: null,
      clarification: "你想先推进的具体对象是什么：一项科研任务、一次沟通，还是毕业或求职事项？"
    };
  }

  return finalizeOutput(result);
}

function formatPlanForPrompt(output) {
  const validation = validatePlanningOutput(output);
  if (!validation.valid || output.status !== "ok") return null;
  return [
    "以下是已通过 Schema 校验的 Task Planning Tool 结果。只提供这一项，不增加第二项任务。",
    `标题：${output.action.title}`,
    `执行：${output.action.instruction}`,
    `预计时长：${output.action.duration_minutes} 分钟`,
    `完成标志：${output.action.completion_signal}`
  ].join("\n");
}

module.exports = {
  TASK_PLANNER_INPUT_SCHEMA,
  TASK_PLANNER_OUTPUT_SCHEMA,
  buildPlanningInput,
  formatPlanForPrompt,
  planTask,
  validatePlanningInput,
  validatePlanningOutput
};
