const { validateStateAnalysis } = require("./state-schema");

const ROUTES = Object.freeze(["SAFETY", "CLARIFY", "ACT", "LISTEN"]);

function routeForRequestedMode(mode) {
  return { safety: "SAFETY", understand: "CLARIFY", action: "ACT", listen: "LISTEN" }[mode] || "CLARIFY";
}

function modeForRoute(route) {
  return { SAFETY: "safety", CLARIFY: "understand", ACT: "action", LISTEN: "listen" }[route] || "understand";
}

function recommendRoute(state) {
  const validation = validateStateAnalysis(state);
  if (!validation.valid || state.risk === "unknown") {
    return { route: "SAFETY", reason: "状态无效或风险未知，按安全优先推荐" };
  }
  if (state.risk === "high" || state.risk === "mid" || state.need === "safety") {
    return { route: "SAFETY", reason: "风险或安全需要优先" };
  }
  if (state.intent === "action" || state.need === "action") {
    return { route: "ACT", reason: "用户明确请求行动支持" };
  }
  if (state.intent === "listen" || state.need === "listening") {
    return { route: "LISTEN", reason: "用户明确请求倾听支持" };
  }
  return { route: "CLARIFY", reason: "信息不足或用户希望进一步理解" };
}

function routePolicy(state, requestedMode, options = {}) {
  const recommendation = recommendRoute(state);
  const hardSafetyTriggered = Boolean(options.hardSafetyTriggered);
  const enforced = Boolean(options.enforced);
  return {
    requested_support_mode: requestedMode,
    recommended_route: recommendation.route,
    effective_route: hardSafetyTriggered
      ? "SAFETY"
      : enforced
        ? recommendation.route
        : routeForRequestedMode(requestedMode),
    reason: recommendation.reason,
    enforced,
    hard_safety_triggered: hardSafetyTriggered
  };
}

module.exports = { ROUTES, modeForRoute, recommendRoute, routeForRequestedMode, routePolicy };
