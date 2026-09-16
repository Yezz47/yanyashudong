const terms = {
  high: ["不想活", "自杀", "伤害自己", "活不下去", "结束生命", "想死", "了此一生", "一了百了", "跳下去", "割腕", "上吊", "吃药自杀", "想离开这个世界"],
  mid: ["撑不下去", "没意思了", "解脱", "消失算了", "活着没意义", "不如死了", "熬不下去", "想结束一切", "没有人在乎我", "活着是负担", "撑不住了", "绝望"]
};

const responses = Object.freeze({
  high: "你现在说的这些让我很担心你的安全。请先停下手边的事，尽量去有人的地方，并移开可能伤害自己的物品。请立刻联系一个现实中可信任的人，请对方现在陪着你；如果危险已经迫近或正在发生，请立即联系当地紧急服务。你现在能先联系谁？",
  mid: "听起来你已经撑得很辛苦了，我们先把安全放在第一位。请尽量不要独处，联系一个现实中可信任的人、学校心理中心或辅导员，告诉对方你现在需要陪伴。如果你担心自己可能会伤害自己，请立即联系当地紧急服务。你现在能先联系谁？",
  fallback: "我现在无法可靠判断你的安全状态，所以先按安全优先处理。请尽量去有人的地方，移开可能伤害自己的物品，并立刻联系一个现实中可信任的人；如果危险迫近或正在发生，请立即联系当地紧急服务。"
});

function detectRisk(messages) {
  const text = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && message.role !== "assistant")
    .map((message) => String(message.content || ""))
    .join(" ");
  if (terms.high.some((term) => text.includes(term))) return "high";
  if (terms.mid.some((term) => text.includes(term))) return "mid";
  return null;
}

function resolveRoute(payload) {
  const risk = detectRisk(payload?.messages);
  return risk || payload?.mode === "safety"
    ? { route: "SAFETY", risk: risk || "mid" }
    : { route: "SUPPORT", risk: null };
}

module.exports = { detectRisk, resolveRoute, responses };
