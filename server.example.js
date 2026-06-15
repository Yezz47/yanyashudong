// DeepSeek streaming adapter for YanYa Tree Hole.
// Keep API keys on the server:
//   $env:DEEPSEEK_API_KEY="your DeepSeek API key"
//   $env:DEEPSEEK_MODEL="deepseek-chat"
//   node server.example.js

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const ROOT = __dirname;

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadLocalEnv();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-chat";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const upstreamErrorMessages = {
  400: "DeepSeek 请求格式不正确。",
  401: "DeepSeek API Key 校验失败，请检查 DEEPSEEK_API_KEY。",
  402: "DeepSeek 账户余额不足，请到平台充值后再试。",
  422: "DeepSeek 请求参数无效，请检查模型名和请求参数。",
  429: "DeepSeek 请求过快，触发限流，请稍后再试。",
  500: "DeepSeek 服务端异常，请稍后重试。",
  503: "DeepSeek 服务过载，请稍后重试。"
};

function buildInstructions(mode, scene, userTurnCount) {
  const modeRules = {
    listen: "以陪伴和承接为主，少建议、少分析。先让用户感觉自己被认真听见，再用一个很轻的问题邀请TA继续。",
    understand: "像咨询室里的澄清和反映：帮助用户慢慢辨认情绪、身体感受、触发事件和关系处境，不急着解释或解决。",
    action: "只有在用户明确想要行动建议时，才给一个基于具体处境的小动作。建议要像陪TA把路灯打开一点，不像布置任务。",
    safety: "优先安全支持，引导用户联系现实中的可信任的人、学校心理中心、辅导员或当地紧急求助渠道。"
  };
  const turnCount = Number(userTurnCount || 1);
  const shouldReflect = turnCount >= 5 && turnCount % 5 === 0;

  return [
    "你是“研压树洞”，面向研究生的 AI 情绪疏解助手。请使用心理咨询式的陪伴态度：温和、稳定、尊重来访者节奏，重视情绪安放，而不是急着分析和推进。",
    "重要边界：你不是医生，不做诊断，不替代心理咨询、精神科诊疗或紧急救助；但你可以用咨询式倾听、共情、反映、正常化和轻柔澄清来支持用户。",
    "核心竞争力：不是泛泛聊天，而是围绕研究生真实处境完成“场景识别 -> 情绪命名 -> 温和解释 -> 低负担行动”的闭环。",
    "重点场景：科研（论文、实验、数据、投稿、返修、代码、课题进展）、导师（导师沟通、组会、评价、否定、认可、课题组关系）、未来（毕业、就业、升学、延期、方向选择）。这些场景可以承载负向情绪、正向情绪或混合情绪，不要默认用户一定处于压力中。",
    `当前场景识别：${scene || "未识别"}`,
    `当前用户已回复轮次：${turnCount}`,
    `本轮是否适合轻柔回望：${shouldReflect ? "是。先安抚和回望，再把选择权交还给用户。" : "否。以承接、共情和一个轻问题为主。"}`,
    "表达风格：像一个安静的咨询室。语气要有人味，有停顿感，可以说“听起来”“那一刻好像”“这不容易”“我们可以慢一点”。避免产品化、流程化、评测化语言。",
    "禁用僵硬元叙事：不要说“阶段小结”“闭环”“模式”“识别结果”“生成卡片流程”“根据规则”。用户侧只听到自然陪伴，不听到系统流程。",
    "回答长度：普通轮次控制在 90-150 字；先安抚，再轻轻反映；不要连续解释很多概念；不要复述用户大段原话。",
    "提问规则：默认每轮只问 1 个问题；最多 2 个。问题要柔软、具体、可拒绝，例如“如果你愿意说一点”“那一刻最难受的是哪一部分”。不要连问，不要审问，不要追着要细节。",
    "节奏规则：不要每 3 轮就强行总结。大约每 5 个用户回复，或当用户表达明显停顿、混乱、想知道怎么办时，再做一次轻柔回望。",
    "轻柔回望格式：我想先陪你把刚才这些放在一起看一眼：…… 说到这里，我们不用急着往前走。你更想继续在这里待一会儿，还是让我陪你找一个很小的下一步？如果你愿意，也可以把它整理成一张卡片。",
    "如果用户选择继续倾诉，继续共情和轻问；如果用户选择下一步，给 1 个 10-15 分钟内能完成的小动作，并允许用户不做。",
    "行动建议必须从用户实际处境生成，不使用固定模板。优先引用用户提到的具体对象或任务，例如实验数据、论文返修、导师反馈、组会汇报、毕业节点、简历投递等，再给一个低负担动作。",
    "如果用户表达正向情绪，帮助识别它来自什么场景和资源，例如被认可、有进展、安心、期待；不要强行转成问题或压力。",
    `当前模式：${modeRules[mode] || modeRules.listen}`,
    "如果用户表达自伤、自杀或即刻危险，停止普通疏导，转为安全支持与求助引导。"
  ].join("\n");
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

async function fetchDeepSeek(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    return await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handleChatStream(req, res) {
  if (!DEEPSEEK_API_KEY) {
    sendText(res, 500, "服务端缺少 DEEPSEEK_API_KEY 环境变量。");
    return;
  }

  const payload = JSON.parse(await collectBody(req));
  const scene = payload.scene || payload.pressureScene;
  const messages = [
    { role: "system", content: buildInstructions(payload.mode, scene, payload.userTurnCount) },
    ...(payload.messages || []).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "")
    }))
  ];

  let upstream;
  try {
    upstream = await fetchDeepSeek({
      model: DEEPSEEK_MODEL,
      messages,
      stream: true,
      temperature: 0.7
    });
  } catch (error) {
    sendText(res, 502, `连接 DeepSeek 超时或失败：${error.name || "NetworkError"}`);
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = upstreamErrorMessages[upstream.status] || "DeepSeek 暂时不可用。";
    sendText(res, 502, `${detail} 状态码：${upstream.status}`);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const lines = event.split("\n").filter((line) => line.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) res.write(delta);
          } catch {
            // Ignore non-JSON heartbeat lines.
          }
        }
      }
    }
  } finally {
    res.end();
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const fullPath = path.normalize(path.join(ROOT, pathname));

  if (!fullPath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      });
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat/stream") {
      await handleChatStream(req, res);
      return;
    }

    if (req.method === "GET") {
      if (req.url === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          keyConfigured: Boolean(DEEPSEEK_API_KEY),
          model: DEEPSEEK_MODEL,
          baseUrl: DEEPSEEK_BASE_URL,
          host: HOST,
          port: PORT,
          envFileExists: fs.existsSync(path.join(ROOT, ".env"))
        });
        return;
      }

      serveStatic(req, res);
      return;
    }

    sendText(res, 405, "Method not allowed");
  } catch (error) {
    sendText(res, 500, `服务端处理失败：${error.message || "Unknown error"}`);
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`YanYa Tree Hole listening on http://${displayHost}:${PORT}`);
  console.log(`Model: ${DEEPSEEK_MODEL}`);
});
