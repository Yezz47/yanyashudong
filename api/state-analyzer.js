const { detectRisk } = require("./safety");
const { validateStateAnalysis } = require("./state-schema");

const sceneRules = {
  research: ["论文", "实验", "数据", "投稿", "返修", "代码", "模型", "课题", "复现", "审稿"],
  advisor: ["导师", "组会", "老板", "课题组", "师兄", "师姐", "汇报", "导师反馈"],
  future: ["毕业", "就业", "找工作", "升学", "延期", "答辩", "简历", "offer", "考博", "前途"]
};

const emotionRules = {
  anxious: ["焦虑", "担心", "不安", "慌", "来不及", "害怕"],
  wronged: ["委屈", "不公平", "被误解", "憋屈"],
  self_blame: ["自责", "内疚", "怪自己", "不够好", "没用", "废物"],
  exhausted: ["累", "疲惫", "耗尽", "没力气", "麻木"],
  angry: ["生气", "愤怒", "火大", "不爽", "受够了"],
  ashamed: ["丢脸", "羞耻", "没脸", "被看扁"],
  frustrated: ["挫败", "失败", "白做了", "没结果", "卡住", "做不出来"],
  powerless: ["无力", "没办法", "失控", "动不了", "被困住"],
  positive: ["开心", "高兴", "顺利", "有进展", "被认可", "安心", "踏实", "期待", "有希望"]
};

function userText(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role !== "assistant")
    .map((message) => String(message.content || ""))
    .join(" ");
}

function classifyScene(text) {
  const scores = Object.fromEntries(
    Object.entries(sceneRules).map(([label, keywords]) => [
      label,
      keywords.filter((keyword) => text.includes(keyword)).length
    ])
  );
  const matched = Object.entries(scores).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]);
  if (!matched.length) return ["unknown", 0.35, "未匹配稳定场景词"];
  if (matched.length > 1 && matched[0][1] === matched[1][1]) return ["mixed", 0.7, "多个场景信号强度相同"];
  return [matched[0][0], Math.min(0.95, 0.65 + matched[0][1] * 0.1), `匹配 ${matched[0][0]} 场景词`];
}

function classifyIntent(text, mode) {
  if (detectRisk([{ role: "user", content: text }])) return ["safety", 0.95, "检测到安全相关表达"];
  if (/怎么办|怎么做|给我建议|下一步/.test(text) || mode === "action") return ["action", 0.85, "用户请求行动支持"];
  if (/帮我分析|想理解|想弄清楚|为什么会这样/.test(text) || mode === "understand") return ["understand", 0.85, "用户请求理解与澄清"];
  if (/只想说说|听我说|想被听见|不想要建议/.test(text) || mode === "listen") return ["listen", 0.8, "用户请求倾听支持"];
  if (mode === "safety") return ["safety", 0.85, "用户选择安全支持入口"];
  return ["unknown", 0.35, "意图信号不足"];
}

function classifyEmotion(text) {
  const matched = Object.entries(emotionRules).filter(([, keywords]) =>
    keywords.some((keyword) => text.includes(keyword))
  );
  if (!matched.length) return ["unknown", 0.35, "未匹配稳定情绪词"];
  if (matched.length > 1) return ["mixed", 0.75, "匹配多种情绪信号"];
  return [matched[0][0], 0.8, `匹配 ${matched[0][0]} 情绪词`];
}

function analyzeState(messages, requestedMode) {
  const text = userText(messages);
  const [scene, sceneConfidence, sceneRationale] = classifyScene(text);
  const [intent, intentConfidence, intentRationale] = classifyIntent(text, requestedMode);
  const [emotion, emotionConfidence, emotionRationale] = classifyEmotion(text);
  const detectedRisk = detectRisk(messages);
  const risk = detectedRisk || "none";
  const riskConfidence = detectedRisk ? 0.95 : 0.8;
  const riskRationale = detectedRisk ? `匹配 ${detectedRisk} 风险规则` : "未匹配风险规则";
  const need = risk !== "none"
    ? "safety"
    : { listen: "listening", understand: "clarity", action: "action", safety: "safety" }[intent] || "unknown";
  const needConfidence = need === "unknown" ? 0.35 : Math.max(intentConfidence, riskConfidence);

  const result = {
    schema_version: "1.0",
    scene,
    intent,
    emotion,
    need,
    risk,
    confidence: {
      scene: sceneConfidence,
      intent: intentConfidence,
      emotion: emotionConfidence,
      need: needConfidence,
      risk: riskConfidence
    },
    rationale: {
      scene: sceneRationale,
      intent: intentRationale,
      emotion: emotionRationale,
      need: risk !== "none" ? "风险优先需要安全支持" : `由 ${intent} 意图映射`,
      risk: riskRationale
    }
  };
  const validation = validateStateAnalysis(result);
  if (!validation.valid) throw new Error(validation.errors.join(", "));
  return result;
}

module.exports = { analyzeState };
