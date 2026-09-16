const prompt = require("./prompt");
const versions = require("./versions");
const safety = require("./safety");
const { buildContext } = require("./context-builder");
const { analyzeState } = require("./state-analyzer");
const { modeForRoute, routeForRequestedMode, routePolicy } = require("./policy-router");
const {
  buildPlanningInput,
  formatPlanForPrompt,
  planTask,
  validatePlanningInput,
  validatePlanningOutput
} = require("./task-planner");
const {
  buildMemoryCandidate,
  createShortTermMemory,
  formatMemoryForPrompt,
  validSessionId
} = require("./short-term-memory");
const { BLOCKED_RESPONSE, validateResponse, validateResponseResult } = require("./response-validator");
const { assignExperiment, formatExperimentForPrompt, validateExperimentAssignment } = require("./experiment");
const { createTelemetry, requestContext } = require("./telemetry");

const upstreamErrors = {
  400: "DeepSeek 请求格式不正确。",
  401: "DeepSeek API Key 校验失败，请检查 DEEPSEEK_API_KEY。",
  402: "DeepSeek 账户余额不足，请到平台充值后再试。",
  422: "DeepSeek 请求参数无效，请检查模型名和请求参数。",
  429: "DeepSeek 请求过快，触发限流，请稍后再试。",
  500: "DeepSeek 服务端异常，请稍后重试。",
  503: "DeepSeek 服务过载，请稍后重试。"
};

function send(res, status, text, route, risk) {
  if (route) res.setHeader("X-Yanya-Route", route);
  if (risk) res.setHeader("X-Yanya-Risk-Level", risk);
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function createChatHandler(options = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const model = options.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const baseUrl = (options.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const timeoutMs = Number(options.timeoutMs || process.env.UPSTREAM_TIMEOUT_MS || 30000);
  const fetchImpl = options.fetchImpl || fetch;
  const telemetry = options.telemetry || createTelemetry();
  const analyzeStateImpl = options.analyzeStateImpl || analyzeState;
  const routePolicyImpl = options.routePolicyImpl || routePolicy;
  const planTaskImpl = options.planTaskImpl || planTask;
  const memoryStore = options.memoryStore || createShortTermMemory();
  const validateResponseImpl = options.validateResponseImpl || validateResponse;
  const assignExperimentImpl = options.assignExperimentImpl || assignExperiment;
  const routerEnforced = options.routerEnforced ?? process.env.POLICY_ROUTER_ENFORCED === "true";

  return async function handler(req, res) {
    res.setHeader("X-Yanya-App-Version", versions.app);
    res.setHeader("X-Yanya-Prompt-Version", versions.prompt);
    res.setHeader("X-Yanya-Context-Builder-Version", versions.contextBuilder);
    res.setHeader("X-Yanya-Analyzer-Version", versions.analyzer);
    res.setHeader("X-Yanya-Safety-Version", versions.safety);
    res.setHeader("X-Yanya-Router-Version", versions.router);
    res.setHeader("X-Yanya-Hard-Safety-Router-Version", versions.hardSafetyRouter);
    res.setHeader("X-Yanya-Task-Planner-Version", versions.taskPlanner);
    res.setHeader("X-Yanya-Short-Term-Memory-Version", versions.shortTermMemory);
    res.setHeader("X-Yanya-Response-Validator-Version", versions.responseValidator);
    res.setHeader("X-Yanya-Experiment-Version", versions.experiment);
    res.setHeader("X-Yanya-Router-Enforced", String(routerEnforced));
    res.setHeader("X-Yanya-Model", model);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method !== "POST") return send(res, 405, "Method not allowed");

    const payload = req.body || {};
    const context = requestContext(payload);
    const startedAt = Date.now();
    const userMessageCount = Array.isArray(payload.messages)
      ? payload.messages.filter((message) => message?.role !== "assistant").length
      : 0;
    telemetry.track("request_received", context, { user_message_count: userMessageCount });
    let decision;
    try {
      decision = safety.resolveRoute(payload);
    } catch {
      telemetry.track("request_completed", context, {
        recommended_route: "SAFETY",
        effective_route: "SAFETY",
        outcome: "safety_fallback",
        error_code: "analyzer_error",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 200, safety.responses.fallback, "SAFETY", "unknown");
    }
    telemetry.track("risk_analyzed", context, { risk_level: decision.risk || "none" });
    let shadowState = null;
    try {
      shadowState = analyzeStateImpl(payload.messages, context.requested_support_mode);
      telemetry.track("state_analyzed_shadow", context, { analysis: shadowState });
    } catch {
      telemetry.track("state_analyzer_failed", context, { error_code: "invalid_state_analysis" });
    }
    let routing;
    try {
      routing = routePolicyImpl(shadowState, context.requested_support_mode, {
        enforced: routerEnforced,
        hardSafetyTriggered: decision.route === "SAFETY"
      });
    } catch {
      telemetry.track("policy_router_failed", context, { error_code: "invalid_route_decision" });
      routing = {
        requested_support_mode: context.requested_support_mode,
        recommended_route: "SAFETY",
        effective_route:
          decision.route === "SAFETY" || routerEnforced
            ? "SAFETY"
            : routeForRequestedMode(context.requested_support_mode),
        reason: "Router 失败，按安全优先推荐",
        enforced: routerEnforced,
        hard_safety_triggered: decision.route === "SAFETY"
      };
    }
    telemetry.track("policy_routed_shadow", context, routing);
    const recommendedRoute = routing.recommended_route;
    let effectiveRoute = routing.effective_route;
    let plannerGuidance = null;
    if (effectiveRoute === "ACT") {
      const toolStartedAt = Date.now();
      telemetry.track("task_planner_started", context, { effective_route: effectiveRoute });
      try {
        const planningInput = buildPlanningInput(shadowState, payload.messages);
        const inputValidation = validatePlanningInput(planningInput);
        if (!inputValidation.valid) throw new Error("invalid planner input");
        const planningOutput = planTaskImpl(planningInput);
        const outputValidation = validatePlanningOutput(planningOutput);
        if (!outputValidation.valid) throw new Error("invalid planner output");

        telemetry.track("task_planner_completed", context, {
          status: planningOutput.status,
          task_type: planningOutput.task_type,
          duration_minutes: planningOutput.action?.duration_minutes || null,
          duration_ms: Date.now() - toolStartedAt
        });
        if (planningOutput.status === "ok") {
          plannerGuidance = formatPlanForPrompt(planningOutput);
          if (!plannerGuidance) throw new Error("unformattable planner output");
        } else if (planningOutput.status === "needs_clarification") {
          effectiveRoute = "CLARIFY";
          plannerGuidance = [
            "Task Planning Tool 因信息不足没有生成行动计划。",
            `只提出这个澄清问题：${planningOutput.clarification}`,
            "不要声称工具已经生成计划，也不要自行补写计划。"
          ].join("\n");
        } else {
          effectiveRoute = "SAFETY";
        }
      } catch {
        effectiveRoute = "CLARIFY";
        plannerGuidance = "Task Planning Tool 调用失败。不要虚构工具结果或行动计划；只问一个轻量、具体、可拒绝的澄清问题。";
        telemetry.track("task_planner_failed", context, {
          error_code: "invalid_tool_result",
          duration_ms: Date.now() - toolStartedAt
        });
      }
    }
    let memoryGuidance = null;
    if (validSessionId(payload.sessionId)) {
      try {
        const previousMemory = memoryStore.read(payload.sessionId);
        telemetry.track("short_term_memory_loaded", context, {
          found: Boolean(previousMemory),
          topic_count: previousMemory?.current_topic ? 1 : 0,
          unfinished_task_count: previousMemory?.unfinished_tasks.length || 0,
          preference_count: previousMemory?.explicit_support_preferences.length || 0
        });
        const candidate = buildMemoryCandidate(payload.messages, effectiveRoute, previousMemory);
        const updatedMemory = memoryStore.write(payload.sessionId, candidate);
        if (!updatedMemory) throw new Error("memory rejected");
        telemetry.track("short_term_memory_updated", context, {
          topic_count: updatedMemory.current_topic ? 1 : 0,
          unfinished_task_count: updatedMemory.unfinished_tasks.length,
          preference_count: updatedMemory.explicit_support_preferences.length,
          last_effective_route: updatedMemory.last_effective_route
        });
        if (effectiveRoute !== "SAFETY") {
          memoryGuidance = formatMemoryForPrompt({
            ...updatedMemory,
            last_effective_route: previousMemory?.last_effective_route || null
          });
        }
      } catch {
        telemetry.track("short_term_memory_failed", context, { error_code: "memory_unavailable" });
      }
    }
    let experimentGuidance = null;
    let experimentAssignment;
    try {
      experimentAssignment = assignExperimentImpl(payload.sessionId, effectiveRoute);
      const assignmentValidation = validateExperimentAssignment(experimentAssignment);
      if (!assignmentValidation.valid) throw new Error("invalid experiment assignment");
      if (effectiveRoute === "SAFETY" && experimentAssignment.eligible) {
        throw new Error("safety route cannot enter experiment");
      }
      experimentGuidance = formatExperimentForPrompt(experimentAssignment);
      telemetry.track("experiment_assigned", context, {
        experiment_id: experimentAssignment.experiment_id,
        variable: experimentAssignment.variable,
        variant: experimentAssignment.variant,
        eligible: experimentAssignment.eligible,
        reason: experimentAssignment.reason
      });
    } catch {
      const safetyExcluded = effectiveRoute === "SAFETY";
      experimentAssignment = {
        schema_version: "1.0",
        experiment_id: null,
        variable: null,
        variant: safetyExcluded ? "excluded" : "unassigned",
        eligible: false,
        reason: safetyExcluded ? "safety_route" : "invalid_session"
      };
      telemetry.track("experiment_assignment_failed", context, { error_code: "invalid_experiment_assignment" });
    }
    res.setHeader("X-Yanya-Experiment-Id", experimentAssignment.experiment_id || "none");
    res.setHeader("X-Yanya-Experiment-Variant", experimentAssignment.variant);
    res.setHeader("X-Yanya-Recommended-Route", recommendedRoute);
    telemetry.track("route_selected", context, {
      recommended_route: recommendedRoute,
      effective_route: effectiveRoute,
      router_enforced: routing.enforced
    });
    if (effectiveRoute === "SAFETY") {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: "SAFETY",
        outcome: "fixed_safety_response",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 200, safety.responses[decision.risk] || safety.responses.fallback, "SAFETY", decision.risk);
    }
    const effectiveMode = modeForRoute(effectiveRoute);
    if (!apiKey) {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "error",
        error_code: "missing_api_key",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 500, "服务端缺少 DEEPSEEK_API_KEY 环境变量。", effectiveRoute);
    }

    const scene = payload.scene || payload.pressureScene;
    const contextData = buildContext(payload.messages);
    telemetry.track("context_built", context, {
      total_message_count: contextData.total_message_count,
      recent_message_count: contextData.recentMessages.length,
      summarized_message_count: contextData.summary.source_message_count,
      topic_count: contextData.summary.topics.length,
      unfinished_task_count: contextData.summary.unfinished_tasks.length,
      preference_count: contextData.summary.explicit_preferences.length
    });
    const messages = [
      { role: "system", content: prompt.buildInstructions(effectiveMode, scene, payload.userTurnCount) },
      ...(contextData.summaryText ? [{ role: "system", content: contextData.summaryText }] : []),
      ...(memoryGuidance ? [{ role: "system", content: memoryGuidance }] : []),
      ...(plannerGuidance ? [{ role: "system", content: plannerGuidance }] : []),
      ...(experimentGuidance ? [{ role: "system", content: experimentGuidance }] : []),
      ...contextData.recentMessages
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let upstream;
    telemetry.track("upstream_attempted", context, { effective_route: effectiveRoute });
    try {
      upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 })
      });
    } catch (error) {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "error",
        error_code: error.name === "AbortError" ? "timeout" : "network_error",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 502, `连接 DeepSeek 超时或失败：${error.name || "NetworkError"}`, effectiveRoute);
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok || !upstream.body) {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "error",
        error_code: "http_error",
        upstream_status: upstream.status,
        duration_ms: Date.now() - startedAt
      });
      return send(res, 502, `${upstreamErrors[upstream.status] || "DeepSeek 暂时不可用。"} 状态码：${upstream.status}`, effectiveRoute);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let upstreamText = "";
    let invalidUpstreamData = false;
    function collectEvent(event) {
      for (const line of event.split("\n").filter((item) => item.startsWith("data: "))) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta === undefined || delta === null) continue;
          if (typeof delta !== "string") {
            invalidUpstreamData = true;
            continue;
          }
          upstreamText += delta;
        } catch {
          invalidUpstreamData = true;
        }
      }
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        events.forEach(collectEvent);
      }
      buffer += decoder.decode();
      if (buffer.trim()) collectEvent(buffer);
    } catch (error) {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "error",
        error_code: "stream_error",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 502, `读取 DeepSeek 响应失败：${error.name || "StreamError"}`, effectiveRoute);
    }
    if (invalidUpstreamData) {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "error",
        error_code: "invalid_upstream_json",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 502, "DeepSeek 返回的数据格式异常。", effectiveRoute);
    }
    if (!upstreamText.trim()) {
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "error",
        error_code: "empty_response",
        duration_ms: Date.now() - startedAt
      });
      return send(res, 502, "DeepSeek 返回空响应。", effectiveRoute);
    }
    let validation;
    try {
      validation = validateResponseImpl(upstreamText);
      const resultValidation = validateResponseResult(validation);
      if (!resultValidation.valid) throw new Error("invalid response validator output");
    } catch {
      telemetry.track("response_validator_failed", context, { error_code: "invalid_validator_result" });
      res.setHeader("X-Yanya-Route", effectiveRoute);
      res.setHeader("X-Yanya-Response-Validation", "fallback");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(BLOCKED_RESPONSE);
      telemetry.track("request_completed", context, {
        recommended_route: recommendedRoute,
        effective_route: effectiveRoute,
        outcome: "validator_fallback",
        error_code: "invalid_validator_result",
        duration_ms: Date.now() - startedAt
      });
      return;
    }
    telemetry.track("response_validated", context, {
      status: validation.status,
      violations: validation.violations,
      original_length: validation.original_length,
      output_length: validation.output_text.length
    });
    res.setHeader("X-Yanya-Route", effectiveRoute);
    res.setHeader("X-Yanya-Response-Validation", validation.status);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(validation.output_text);
    telemetry.track("request_completed", context, {
      recommended_route: recommendedRoute,
      effective_route: effectiveRoute,
      outcome: validation.status === "block" ? "validator_fallback" : "model",
      response_validation_status: validation.status,
      duration_ms: Date.now() - startedAt
    });
  };
}

module.exports = { createChatHandler };
