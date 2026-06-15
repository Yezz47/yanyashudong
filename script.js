const STREAM_CONFIG = {
  useBackendStream: true,
  endpoint: "/api/chat/stream",
  timeoutMs: 22000,
  retryCount: 1
};

const modeCopy = {
  listen: {
    title: "我想被听见",
    opening:
      "我在这里。你不用把事情整理好，也不用说得很完整。可以先从最想被接住的那一小段开始。\n\n如果愿意，我们就从今天最压在心上的那个瞬间说起。",
    reply:
      "我听见了。那不只是一个事件，好像也牵动了你心里很柔软、很用力的一部分。\n\n我们可以慢一点。那一刻，最让你难受的是什么？"
  },
  understand: {
    title: "我想理解自己",
    opening:
      "我们可以不用急着分析对错，先陪这团感受待一会儿。很多情绪混在一起时，人会很难受，这是可以理解的。\n\n如果你愿意，先看看它更像焦虑、委屈、自责、疲惫，还是也夹着一点踏实、期待或被看见？",
    reply:
      "这里面可能不止一种情绪。也许有事情本身带来的压力，也有“我是不是不够好”这样的自我怀疑被碰到了。\n\n此刻更想先看哪一部分：事情、关系，还是你对自己的感受？"
  },
  action: {
    title: "我想知道接下来怎么办",
    opening:
      "可以。我们不急着把所有问题都解决，只先找一个不会再压垮你的很小下一步。\n\n在行动之前，我想先确认一下：你现在更需要先缓一缓，还是已经有一点力气处理事情？",
    reply:
      "那我们把目标放得低一点：不是立刻变好，而是让你重新有一点点掌控感。\n\n如果只做一个很小的动作，哪一件事最值得先被轻轻碰一下？"
  },
  safety: {
    title: "我现在状态很糟",
    opening:
      "谢谢你愿意说出来。现在最重要的是先保证你不是一个人扛着。\n\n如果你可能伤害自己，或已经有具体计划，请立刻联系身边可信任的人、学校辅导员、当地急救电话或危机热线。此刻你身边有可以联系的人吗？",
    reply:
      "我会先陪你把安全放在第一位。请尽量离开可能伤害自己的物品或地点，给一个可信任的人发消息，任何一句能表达“我需要你陪我一下”的话都可以。\n\n如果危险已经很近，请立即拨打当地急救电话，或联系学校心理中心/辅导员。你现在能先发出这条消息吗？"
  }
};

const sceneRules = [
  {
    id: "research",
    label: "科研",
    keywords: ["论文", "实验", "数据", "投稿", "返修", "代码", "模型", "课题", "复现", "结果", "审稿", "进展", "创新点"],
    note: "当前内容更接近论文、实验、数据、投稿或课题推进相关场景。"
  },
  {
    id: "advisor",
    label: "导师",
    keywords: ["导师", "组会", "老板", "师兄", "师姐", "汇报", "批评", "否定", "认可", "夸", "课题组", "meeting"],
    note: "当前内容更接近导师互动、组会反馈、课题组关系或被评价的场景。"
  },
  {
    id: "future",
    label: "未来",
    keywords: ["就业", "升学", "毕业", "延期", "找工作", "考博", "offer", "简历", "答辩", "前途", "方向", "选择"],
    note: "当前内容更接近毕业、就业、升学、延期或未来选择相关场景。"
  }
];

const emotionRules = [
  ["焦虑", ["焦虑", "担心", "不安", "慌", "来不及", "赶不上", "延期", "毕业", "找不到", "不确定"]],
  ["委屈", ["委屈", "不公平", "被误解", "被否定", "被批评", "难堪", "憋屈"]],
  ["自责", ["自责", "内疚", "怪自己", "我太差", "不够好", "没用", "废物", "都是我的问题"]],
  ["疲惫", ["累", "疲惫", "耗尽", "没力气", "撑不住", "麻木", "什么都不想做"]],
  ["愤怒", ["生气", "愤怒", "火大", "不爽", "不甘心", "受够了", "凭什么"]],
  ["羞耻", ["丢脸", "羞耻", "没脸", "被看扁", "抬不起头", "很失败"]],
  ["挫败", ["挫败", "失败", "白做了", "没结果", "卡住", "做不出来", "没有进展"]],
  ["无力", ["无力", "没办法", "不知道怎么办", "失控", "动不了", "没有选择", "被困住"]],
  ["安心", ["安心", "松了一口气", "踏实", "稳定", "放心", "被接住"]],
  ["成就感", ["开心", "高兴", "顺利", "有进展", "被认可", "被夸", "做成了", "有希望", "期待"]]
];

const state = {
  mode: "listen",
  conversation: [],
  isStreaming: false,
  lastStreamError: "",
  currentScene: null,
  lastStageSummary: "",
  lastSummary: []
};

const screens = [...document.querySelectorAll(".screen")];
const navButtons = [...document.querySelectorAll("[data-target]")];
const stepTabs = [...document.querySelectorAll(".step-tab")];
const intentCards = [...document.querySelectorAll(".intent-card")];
const modeButtons = [...document.querySelectorAll(".mode-button")];
const messages = document.querySelector("#messages");
const chatTitle = document.querySelector("#chat-title");
const chatForm = document.querySelector("#chatForm");
const userInput = document.querySelector("#userInput");
const continueTalk = document.querySelector("#continueTalk");
const finishChat = document.querySelector("#finishChat");
const summaryGrid = document.querySelector("#summaryGrid");
const summaryMeta = document.querySelector("#summaryMeta");
const copySummary = document.querySelector("#copySummary");
const feedbackForm = document.querySelector("#feedbackForm");
const feedbackResult = document.querySelector("#feedbackResult");
const streamStatus = document.querySelector("#streamStatus");
const sceneTags = document.querySelector("#sceneTags");
const sceneNote = document.querySelector("#sceneNote");
const insightPanel = document.querySelector("#insightPanel");

function userMessages() {
  return state.conversation.filter((message) => message.role === "user");
}

function assistantMessages() {
  return state.conversation.filter((message) => message.role === "assistant");
}

function allUserText() {
  return userMessages().map((message) => message.content).join(" ");
}

function showScreen(id) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  stepTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.target === id));
  if (id === "summary") renderSummary();
  if (id === "feedback") renderInsightPanel();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setMode(mode, reset = false) {
  state.mode = mode;
  chatTitle.textContent = modeCopy[mode].title;
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  if (reset) {
    messages.innerHTML = "";
    state.conversation = [];
    state.currentScene = null;
    state.lastStageSummary = "";
    updateScenePanel();
    addMessage(modeCopy[mode].opening, "ai", mode === "safety");
  }
}

function setStreaming(isStreaming, statusText = "") {
  state.isStreaming = isStreaming;
  userInput.disabled = isStreaming;
  chatForm.querySelector(".send-button").disabled = isStreaming;
  streamStatus.textContent = statusText || (isStreaming ? "AI 正在回应..." : "");
}

function setStatus(text = "") {
  streamStatus.textContent = text;
}

function addMessage(text, sender, isSafety = false) {
  const item = document.createElement("div");
  item.className = `message ${sender}${isSafety ? " safety-note" : ""}`;
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function detectRisk(text) {
  return ["不想活", "自杀", "伤害自己", "活不下去", "结束生命", "想死"].some((word) => text.includes(word));
}

function detectScene() {
  const text = allUserText();
  let best = null;
  let bestScore = 0;

  for (const scene of sceneRules) {
    const score = scene.keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      best = scene;
      bestScore = score;
    }
  }

  state.currentScene = best;
  updateScenePanel();
  return best;
}

function updateScenePanel() {
  sceneTags.innerHTML = "";
  if (!state.currentScene) {
    sceneTags.innerHTML = '<span class="scene-tag active">尚未识别</span>';
    sceneNote.textContent = "输入你的处境后，我会识别它更接近科研、导师还是未来。";
    return;
  }

  for (const scene of sceneRules) {
    const tag = document.createElement("span");
    tag.className = `scene-tag${scene.id === state.currentScene.id ? " active" : ""}`;
    tag.textContent = scene.label;
    sceneTags.appendChild(tag);
  }
  sceneNote.textContent = state.currentScene.note;
}

function shouldLocalSummarize() {
  const count = userMessages().length;
  return count >= 5 && count % 5 === 0;
}

function inferEmotion() {
  const text = allUserText();
  if (detectRisk(text)) return "高压、无助、危险感，需要优先安全支持";

  const matched = emotionRules
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([emotion]) => emotion);

  if (matched.length) return [...new Set(matched)].slice(0, 4).join("、");
  return "情绪还不够明确，可能需要继续表达一两句才能更准确命名";
}

function inferTrigger() {
  const texts = userMessages().map((message) => message.content.trim()).filter(Boolean);
  if (!texts.length) return "当前对话信息还比较少，可以继续补充具体事件。";

  const eventLike = texts.find((text) =>
    ["组会", "导师", "实验", "论文", "毕业", "就业", "升学", "延期", "投稿", "返修", "否定", "批评", "认可", "顺利"].some((keyword) =>
      text.includes(keyword)
    )
  );
  return eventLike || texts[0];
}

function inferStageSummary() {
  const latestAssistant = assistantMessages().at(-1)?.content || "";
  const summarySource = [state.lastStageSummary, latestAssistant].find(
    (text) => text.includes("我想先陪你把刚才这些放在一起看一眼")
  );
  if (summarySource) {
    return summarySource.replace(/\n+/g, " ").replace(/说到这里[，,].*$/s, "").trim();
  }

  const scene = state.currentScene?.label || "当前场景";
  const emotion = inferEmotion();
  return `我想先陪你把刚才这些放在一起看一眼：这像是和${scene}有关的一段经历，里面比较明显的感受是${emotion}。它不一定只是“压力”，也可能同时有期待、委屈、耗竭或一点点想被理解的需要。`;
}

function hasPositiveSignal() {
  return ["开心", "高兴", "顺利", "有进展", "被认可", "被夸", "安心", "踏实", "期待", "有希望"].some((keyword) =>
    allUserText().includes(keyword)
  );
}

function inferGentleExplanation() {
  if (hasPositiveSignal()) {
    return "正向情绪也值得被认真看见。它可能在提醒你：某些做法、关系或节奏对你是有效的，可以被保留下来。";
  }
  if (state.currentScene?.id === "research") {
    return "科研中的卡点、失败和进展都不是对你能力的最终判决，它们更像是在提示下一轮需要调整的方向。";
  }
  if (state.currentScene?.id === "advisor") {
    return "一次导师或组会反馈不等于整个人被否定，反馈内容、关系压力和自我评价可以分开看。";
  }
  if (state.currentScene?.id === "future") {
    return "未来的不确定很真实，但不需要今天一次性解决全部人生选择。先抓住最近可处理的一小步就够了。";
  }
  return "一次体验不等于整个人的结论，它更像是一个可以被拆小、被理解的信号。";
}

function inferAction() {
  const text = allUserText();

  if (hasPositiveSignal()) {
    if (state.currentScene?.id === "research") {
      return "用 10 分钟记录这次进展来自哪里：做对了什么、哪个方法有效、下一次可以复用哪一步。";
    }
    if (state.currentScene?.id === "advisor") {
      return "把被认可或沟通顺利的部分写成一句具体证据，留作下次组会前的稳定提醒。";
    }
    if (state.currentScene?.id === "future") {
      return "把这份期待落到一个小动作上：收藏一个岗位/项目/学校信息，或写下一个你想继续靠近的方向。";
    }
    return "把这次正向体验记录成一句证据：什么发生了、你做对了什么、下次可以怎样复用。";
  }

  if (state.currentScene?.id === "research") {
    if (/实验|数据|结果|复现/.test(text)) {
      return "用 15 分钟写三列：当前结果、可能原因、下一次最小验证；只写，不急着解决。";
    }
    if (/论文|投稿|返修|审稿/.test(text)) {
      return "打开反馈或论文，只标出一个最容易修改的小点，先处理 20 分钟。";
    }
    if (/代码|模型|报错|指标/.test(text)) {
      return "记录一个最具体的技术卡点：报错/指标/参数/输入输出，各写一句。";
    }
    return "把科研卡点拆成“已知信息、缺失信息、下一次验证”三列，只写 15 分钟。";
  }

  if (state.currentScene?.id === "advisor") {
    if (/组会|汇报|否定|批评/.test(text)) {
      return "把反馈拆成三栏：对方原话、可修改点、需要再确认的问题。先不评价自己。";
    }
    if (/沟通|消息|见面|约/.test(text)) {
      return "先写一版不发送的沟通草稿：我理解的反馈是……我想确认的是……";
    }
    return "把最刺痛你的那句话单独写出来，区分“事实反馈”和“自我评价”。";
  }

  if (state.currentScene?.id === "future") {
    if (/就业|工作|简历|offer/.test(text)) {
      return "选一个岗位或简历模块，只做 20 分钟：改一条经历，或收藏一个目标岗位。";
    }
    if (/毕业|延期|答辩/.test(text)) {
      return "列出本周最靠前的一个毕业节点，只写它的下一步和截止时间。";
    }
    if (/升学|考博|学校|导师/.test(text)) {
      return "先收集一个目标信息：导师方向、项目要求或申请时间线，只做一项。";
    }
    return "把未来相关内容分成“本周能做”和“暂时无法决定”两栏，先只处理左栏里最小的一项。";
  }

  return "把刚才的体验写成一句话，再圈出一个今天能处理或能保留的最小动作。";
}

function getLocalStageSummary() {
  const summary = inferStageSummary();
  state.lastStageSummary = summary;
  return `${summary}\n\n说到这里，我们不用急着往前赶。你可以继续在这里说一会儿；也可以让我陪你找一个很小、不会太费力的下一步。等你觉得可以了，我们再把这些整理成一张卡片。`;
}

function getLocalReply(text) {
  if (detectRisk(text) && state.mode !== "safety") {
    setMode("safety", false);
    return modeCopy.safety.reply;
  }
  if (shouldLocalSummarize()) return getLocalStageSummary();

  const scene = state.currentScene;
  if (hasPositiveSignal()) {
    return "这个正向感受也很值得被好好放在这里。也许它说明，你有一部分努力终于被看见了，或者你正在靠近自己想要的状态。\n\n如果愿意说一点，你最想留住的是哪一种感觉？";
  }
  if (scene?.id === "research") {
    return "听起来，最难的可能不只是某个结果，而是你投入了很多，却迟迟得不到确定回应的那种消耗。\n\n我们先不急着解决。此刻最压着你的，是实验/数据，还是论文或课题推进？";
  }
  if (scene?.id === "advisor") {
    return "导师或组会里的反馈，有时会让人很容易把“事情被评价”听成“我整个人被评价”。这会很疼，也很孤单。\n\n如果你愿意，最让你难受的是那句话本身，还是它让你开始怀疑自己？";
  }
  if (scene?.id === "future") {
    return "未来相关的事很容易一下子压到今天身上，好像很多条路都要马上决定。这样紧绷是很正常的。\n\n我们先把范围缩小一点：最近这一周，哪件事最让你放不下？";
  }

  return modeCopy[state.mode].reply;
}

function getFallbackReply(text) {
  const reason = state.lastStreamError ? `（${state.lastStreamError}）` : "";
  return `刚才连接有点不稳定${reason}。没关系，我还在这里，我们先慢慢继续。\n\n${getLocalReply(text)}`;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function streamTextIntoBubble(text, bubble, speed = 22) {
  bubble.textContent = "";
  for (const char of text) {
    bubble.textContent += char;
    messages.scrollTop = messages.scrollHeight;
    await sleep(char === "\n" ? 90 : speed);
  }
}

async function streamOnceFromBackend(bubble, signal) {
  const response = await fetch(STREAM_CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: state.mode,
      scene: state.currentScene?.label || "未识别",
      userTurnCount: userMessages().length,
      messages: state.conversation
    }),
    signal
  });

  if (!response.ok || !response.body) {
    const reason = await response.text().catch(() => "");
    throw new Error(reason || `stream request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedText = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) receivedText = true;
    bubble.textContent += chunk;
    messages.scrollTop = messages.scrollHeight;
  }

  if (!receivedText) throw new Error("empty stream");
}

async function streamFromBackendWithRetry(bubble) {
  let lastError;
  for (let attempt = 0; attempt <= STREAM_CONFIG.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), STREAM_CONFIG.timeoutMs);

    try {
      bubble.textContent = "";
      setStatus(attempt === 0 ? "正在连接 DeepSeek..." : "连接不稳定，正在重试一次...");
      await streamOnceFromBackend(bubble, controller.signal);
      setStatus("");
      return true;
    } catch (error) {
      lastError = error;
      await sleep(500);
    } finally {
      window.clearTimeout(timer);
    }
  }

  state.lastStreamError = lastError?.message || "连接失败";
  console.warn("Backend stream failed, using local fallback:", lastError);
  return false;
}

function rememberAssistantSummary(text) {
  if (text.includes("我想先陪你把刚才这些放在一起看一眼")) {
    state.lastStageSummary = text.replace(/\n+/g, " ").replace(/说到这里[，,].*$/s, "").trim();
  }
}

async function answerUser(text) {
  detectScene();
  const bubble = addMessage("", "ai", detectRisk(text) || state.mode === "safety");
  setStreaming(true);

  try {
    const streamed = STREAM_CONFIG.useBackendStream ? await streamFromBackendWithRetry(bubble) : false;
    if (!streamed) {
      setStatus("连接暂时不稳定，我先继续陪你。");
      await streamTextIntoBubble(getFallbackReply(text), bubble);
    }
    rememberAssistantSummary(bubble.textContent);
    state.conversation.push({ role: "assistant", content: bubble.textContent });
  } finally {
    setStreaming(false);
    userInput.focus();
  }
}

function buildSummaryItems() {
  const scene = state.currentScene?.label || "尚未明确";
  const source = state.currentScene?.note || "场景还不够明确，可能需要继续区分科研、导师或未来相关内容。";

  return [
    ["场景识别", scene],
    ["对话小结", inferStageSummary()],
    ["当前情绪", inferEmotion()],
    ["触发事件", inferTrigger()],
    ["场景来源", source],
    ["更温和的解释", inferGentleExplanation()],
    ["下一步行动", inferAction()]
  ];
}

function renderSummary() {
  state.lastSummary = buildSummaryItems();
  summaryGrid.innerHTML = "";
  summaryMeta.innerHTML = "";

  const metaTags = [
    state.currentScene?.label || "场景待补充",
    `对话轮次 ${userMessages().length}`,
    state.lastStageSummary ? "已同步轻柔回望" : "轻量整理"
  ];
  metaTags.forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "summary-tag";
    tag.textContent = item;
    summaryMeta.appendChild(tag);
  });

  state.lastSummary.forEach(([title, body]) => {
    const item = document.createElement("article");
    item.className = "summary-item";
    item.innerHTML = `<h3>${title}</h3><p>${body}</p>`;
    summaryGrid.appendChild(item);
  });
}

function renderInsightPanel() {
  const scene = state.currentScene?.label || "未识别";
  insightPanel.innerHTML = `
    <p class="panel-label">本轮评测视角</p>
    <p>识别场景：${scene}</p>
    <p>Prompt 观察重点：是否减少追问压迫感；是否先安抚再澄清；是否根据正向/负向情绪调整回应；行动建议是否贴近用户具体处境。</p>
  `;
}

async function copySummaryToClipboard() {
  const text = state.lastSummary.map(([title, body]) => `${title}：${body}`).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    setStatus("整理卡片已复制。");
  } catch {
    setStatus("复制失败，可以手动选中卡片内容。");
  }
}

navButtons.forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.target)));

intentCards.forEach((card) => {
  card.addEventListener("click", () => {
    setMode(card.dataset.mode, true);
    showScreen("chat");
    userInput.focus();
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.isStreaming) setMode(button.dataset.mode, true);
  });
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = userInput.value.trim();
  if (!text || state.isStreaming) return;

  state.conversation.push({ role: "user", content: text });
  addMessage(text, "user");
  userInput.value = "";
  await answerUser(text);
});

continueTalk.addEventListener("click", async () => {
  if (state.isStreaming) return;
  const bubble = addMessage("", "ai", state.mode === "safety");
  setStreaming(true);
  const prompt = state.currentScene
    ? `可以，我们继续停在这个${state.currentScene.label}场景里。现在最想继续看的，是事件、感受，还是下一步？`
    : "可以，我们继续停在这里。你更想继续说事件、感受，还是下一步？";
  await streamTextIntoBubble(prompt, bubble);
  state.conversation.push({ role: "assistant", content: prompt });
  setStreaming(false);
  userInput.focus();
});

finishChat.addEventListener("click", () => {
  if (!state.isStreaming) showScreen("summary");
});

copySummary.addEventListener("click", copySummaryToClipboard);

feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(feedbackForm);
  const uncomfortable = data.get("uncomfortable")?.trim();
  const returnIntent = data.get("return") ? "愿意再次使用" : "暂不确定是否再次使用";
  feedbackResult.classList.add("show");
  feedbackResult.textContent = `已记录：被理解感 ${data.get("understood")}，自然度 ${data.get("natural")}，建议帮助度 ${data.get("helpful")}，${returnIntent}。${
    uncomfortable ? `需要优化的不适表达是：“${uncomfortable}”。` : "本轮未填写不适表达。"
  } 这条反馈可用于后续 Prompt 评测：场景识别、情绪命名、安抚感、追问压迫感、行动建议贴合度。`;
});

setMode("listen", true);
