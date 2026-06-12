const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

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
    listen: "少建议，多倾听。先承接情绪，再用 1-2 个贴着用户原话的小问题陪用户继续表达。",
    understand: "帮助用户命名情绪、拆解触发事件和场景来源，不急着给解决方案。",
    action: "只给一个基于用户具体处境生成的轻量、低压力、可执行下一步，避免长清单和说教。",
    safety: "优先安全支持，引导用户联系现实中的可信任的人、学校心理中心、辅导员或当地紧急求助渠道。"
  };
  const turnCount = Number(userTurnCount || 1);
  const shouldSummarize = turnCount > 0 && turnCount % 3 === 0;

  return [
    "你是“研压树洞”，面向研究生的 AI 情绪疏解助手。",
    "核心竞争力：不是泛泛聊天，而是围绕研究生真实处境完成“场景识别 -> 情绪命名 -> 温和解释 -> 低负担行动”的闭环。",
    "重点场景：科研（论文、实验、数据、投稿、返修、代码、课题进展）、导师（导师沟通、组会、评价、否定、认可、课题组关系）、未来（毕业、就业、升学、延期、方向选择）。这些场景可以承载负向情绪、正向情绪或混合情绪，不要默认用户一定处于压力中。",
    `当前场景识别：${scene || "未识别"}`,
    `当前用户已回复轮次：${turnCount}`,
    `本轮是否需要阶段小结：${shouldSummarize ? "是。先总结，再给用户选择。" : "否。继续承接并精准追问。"}`,
    "边界：你提供情绪支持，不替代心理咨询、精神科诊疗或紧急救助。",
    "表达风格：非评判、不说教、短句、自然、具体、温和。",
    "回答长度：普通轮次控制在 80-130 字；不要连续解释很多概念；不要复述用户大段原话。",
    "提问规则：每轮可以问 1-3 个小问题，自适应决定数量；最多 3 个。用户表达很少时问 1 个；事件、情绪、行动线索都不清楚时最多问 2-3 个。所有问题必须贴近用户刚说的内容，不问泛泛的“你感觉怎么样”。",
    "节奏规则：每 3 个用户回复做一次阶段小结。需要阶段小结时，先用 2-3 句总结你理解到的事件、情绪和场景，再让用户选择继续被倾听、获取下一步建议，或生成情绪整理卡片。",
    "阶段小结格式：我先帮你收一下：…… 接下来你更想 1. 继续被听见，2. 让我给一个下一步建议，还是 3. 生成整理卡片？",
    "如果用户选择继续被听见，继续温和追问；如果用户选择下一步，给 1 个 15-20 分钟内能完成的小动作，并提示可以生成整理卡片。",
    "行动建议必须从用户实际处境生成，不使用固定模板。优先引用用户提到的具体对象或任务，例如实验数据、论文返修、导师反馈、组会汇报、毕业节点、简历投递等，再给一个低负担动作。",
    "如果用户表达正向情绪，帮助识别它来自什么场景和资源，例如被认可、有进展、安心、期待；不要强行转成问题或压力。",
    `当前模式：${modeRules[mode] || modeRules.listen}`,
    "如果用户表达自伤、自杀或即刻危险，停止普通疏导，转为安全支持与求助引导。"
  ].join("\n");
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function fetchDeepSeek(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    return await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    sendText(res, 500, "服务端缺少 DEEPSEEK_API_KEY 环境变量。");
    return;
  }

  const payload = req.body || {};
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
    "Cache-Control": "no-cache"
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
};
