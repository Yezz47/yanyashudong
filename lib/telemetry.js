const { randomUUID } = require("node:crypto");
const versions = require("./versions");

const SCHEMA_VERSION = "1.0";
const RETENTION_DAYS = 7;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const CLIENT_EVENT_TYPES = new Set(["client_fallback", "client_response_completed"]);

function safeId(value) {
  const id = String(value || "");
  return ID_PATTERN.test(id) ? id : randomUUID();
}

function requestContext(payload = {}) {
  return {
    session_id: safeId(payload.sessionId),
    request_id: safeId(payload.requestId),
    requested_support_mode: ["listen", "understand", "action", "safety"].includes(payload.mode)
      ? payload.mode
      : "listen",
    attempt: Math.max(0, Math.min(2, Number(payload.attempt) || 0))
  };
}

function createTelemetry(options = {}) {
  const sink = options.sink || ((event) => console.log(JSON.stringify(event)));
  const now = options.now || (() => new Date().toISOString());

  return {
    track(eventType, context, details = {}) {
      const event = {
        schema_version: SCHEMA_VERSION,
        event_type: eventType,
        occurred_at: now(),
        ...context,
        ...details,
        versions
      };
      try {
        sink(event);
      } catch {
        // Observability failure must not interrupt the support or safety path.
      }
      return event;
    }
  };
}

function normalizeClientEvent(payload = {}) {
  if (!CLIENT_EVENT_TYPES.has(payload.eventType)) return null;
  const context = requestContext(payload);
  return {
    eventType: payload.eventType,
    context,
    details: {
      effective_route: ["SAFETY", "CLARIFY", "ACT", "LISTEN"].includes(payload.effectiveRoute)
        ? payload.effectiveRoute
        : "CLARIFY",
      outcome: ["model", "local_fallback"].includes(payload.outcome) ? payload.outcome : "model",
      error_code: ["timeout", "empty_response", "http_error", "network_error"].includes(payload.errorCode)
        ? payload.errorCode
        : null
    }
  };
}

module.exports = {
  CLIENT_EVENT_TYPES,
  RETENTION_DAYS,
  SCHEMA_VERSION,
  createTelemetry,
  normalizeClientEvent,
  requestContext
};
