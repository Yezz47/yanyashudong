const { createTelemetry, normalizeClientEvent } = require("../lib/telemetry");

const telemetry = createTelemetry();

module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const event = normalizeClientEvent(req.body || {});
  if (!event) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Invalid event");
    return;
  }

  telemetry.track(event.eventType, event.context, event.details);
  res.writeHead(204, { "Cache-Control": "no-store" });
  res.end();
};
