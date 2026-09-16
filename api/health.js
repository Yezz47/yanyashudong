const versions = require("./versions");
const { RETENTION_DAYS, SCHEMA_VERSION } = require("./telemetry");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify(
      {
        ok: true,
        runtime: "vercel",
        keyConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        versions,
        telemetry: {
          schemaVersion: SCHEMA_VERSION,
          retentionDays: RETENTION_DAYS,
          storesConversationContent: false
        },
        policyRouter: {
          enforced: process.env.POLICY_ROUTER_ENFORCED === "true"
        }
      },
      null,
      2
    )
  );
};
