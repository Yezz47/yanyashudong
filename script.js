const CHARACTER_STATES = {
  idle: {
    asset: "assets/treehole-idle-v3.png",
    alt: "安静待机的小树洞",
    copy: "我在这里，等你慢慢开口",
    subcopy: "不用准备好，想到什么就说什么。"
  },
  listening: {
    asset: "assets/treehole-listening-v3.png",
    alt: "认真倾听的小树洞",
    copy: "我正在听你说",
    subcopy: "想到哪里，就说到哪里。"
  },
  thinking: {
    asset: "assets/treehole-thinking-v3.png",
    alt: "低头思考的小树洞",
    copy: "我在想怎么回应你",
    subcopy: "想把你的话接稳一点。"
  },
  companion: {
    asset: "assets/treehole-companion-v3.png",
    alt: "靠近陪伴的小树洞",
    copy: "陪你慢慢理一理",
    subcopy: "我们一次只看一小块。"
  },
  suggestion: {
    asset: "assets/treehole-suggestion-v3.png",
    alt: "拿着小纸条给出建议的小树洞",
    copy: "要不要一起想想怎么办？",
    subcopy: "决定权一直在你手里。"
  }
};

const SUPPORT = {
  listen: {
    apiMode: "listen",
    state: "listening",
    placeholder: "继续说吧，我在听……",
    nudge: "好，我们先不急着解决。你可以继续说，我会好好听着。",
    fallback: "听起来这件事已经压在你心里一阵了。先不用把它讲得很完整——此刻最堵在心口的，是哪一小部分？"
  },
  organize: {
    apiMode: "understand",
    state: "companion",
    placeholder: "我们从最乱的地方开始理……",
    nudge: "可以。我们不急着下结论，先一起看看：事情本身、你的担心，还有别人对你的期待，哪一块最重？",
    fallback: "我们先把它轻轻分开看：已经发生的事、你最担心会发生的事，以及你现在能碰到的一小步。你想先从哪一块说起？"
  },
  suggest: {
    apiMode: "action",
    state: "suggestion",
    placeholder: "告诉我最想先解决的那一件事……",
    nudge: "好，我们一起想，但不一下子给自己很多任务。先找一个今天就能完成、负担最小的动作。",
    fallback: "如果现在只做一件最轻的小事，我建议先写下明天组会必须说明的三点：已经试过什么、目前卡在哪里、下一步准备验证什么。我们也可以一起把这三点补完整。"
  }
};

const appState = {
  route: "home",
  support: "listen",
  companion: "idle",
  conversation: [
    { role: "user", content: "我明天就要组会了，但是实验现在还是没结果，真的烦死了。" },
    { role: "assistant", content: "听起来你现在最难受的，可能不只是实验没结果。组会马上就到了，但事情好像不在掌控里，这种卡住的感觉确实很磨人。先不用急着想怎么解决，我在听。" }
  ],
  sessionId: getSessionId(),
  busy: false
};

const pages = [...document.querySelectorAll(".page")];
const navItems = [...document.querySelectorAll(".nav-item")];
const homeForm = document.querySelector("#homeForm");
const homeInput = document.querySelector("#homeInput");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const messages = document.querySelector("#messages");

function getSessionId() {
  const stored = window.sessionStorage.getItem("treehole-session");
  if (stored) return stored;
  const id = window.crypto?.randomUUID?.() || `treehole-${Date.now()}`;
  window.sessionStorage.setItem("treehole-session", id);
  return id;
}

function setGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const node = document.querySelector(".time-greeting");
  if (node) node.textContent = `${greeting}，今天过得怎么样？`;
}

function setRoute(route) {
  appState.route = route;
  pages.forEach((page) => page.classList.toggle("active", page.id === route));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.route === route));
  if (route === "home") {
    setCompanionState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    setCompanionState(SUPPORT[appState.support].state);
    window.requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
      chatInput.focus();
    });
  }
}

function setCompanionState(stateName) {
  const state = CHARACTER_STATES[stateName] || CHARACTER_STATES.idle;
  appState.companion = stateName;

  document.querySelectorAll("[data-character-stage]").forEach((stage) => {
    const image = stage.querySelector("[data-character-image]");
    stage.dataset.state = stateName;
    stage.classList.remove("has-image");
    image.alt = state.alt;
    image.onload = () => {
      stage.classList.add("has-image");
      positionCharacterImage(stage, image);
    };
    image.onerror = () => stage.classList.remove("has-image");
    image.src = state.asset;
    if (image.complete && image.naturalWidth) {
      stage.classList.add("has-image");
      positionCharacterImage(stage, image);
    }
  });

  document.querySelectorAll("[data-state-copy]").forEach((node) => {
    node.textContent = state.copy;
  });
  document.querySelectorAll("[data-state-subcopy]").forEach((node) => {
    node.textContent = state.subcopy;
  });
}

function positionCharacterImage(stage, image) {
  if (!image.naturalWidth || !stage.clientWidth) return;
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.left = "0";
  image.style.top = "0";
}

function setSupport(support, announce = false) {
  if (!SUPPORT[support]) return;
  appState.support = support;
  document.querySelectorAll("[data-support]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.support === support);
  });
  chatInput.placeholder = SUPPORT[support].placeholder;
  if (appState.route === "chat") setCompanionState(SUPPORT[support].state);
  if (announce) appendMessage("assistant", SUPPORT[support].nudge);
}

function appendMessage(role, text, options = {}) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  if (role === "assistant") {
    const speaker = document.createElement("div");
    speaker.className = "speaker";
    speaker.textContent = "小树洞";
    article.appendChild(speaker);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (options.thinking) bubble.classList.add("thinking-bubble");
  bubble.textContent = text;
  article.appendChild(bubble);
  messages.appendChild(article);
  article.scrollIntoView({ behavior: "smooth", block: "end" });
  return { article, bubble };
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

async function askTreeHole(text) {
  if (appState.busy) return;
  const cleanText = normalizeText(text);
  if (!cleanText) return;

  appState.busy = true;
  appendMessage("user", cleanText);
  appState.conversation.push({ role: "user", content: cleanText });
  setCompanionState("thinking");
  toggleComposer(true);
  const pending = appendMessage("assistant", "小树洞在想怎么回应你", { thinking: true });

  try {
    const reply = await requestReply();
    pending.bubble.classList.remove("thinking-bubble");
    pending.bubble.textContent = reply;
    appState.conversation.push({ role: "assistant", content: reply });
  } catch (error) {
    pending.bubble.classList.remove("thinking-bubble");
    pending.bubble.textContent = SUPPORT[appState.support].fallback;
    appState.conversation.push({ role: "assistant", content: SUPPORT[appState.support].fallback });
  } finally {
    appState.busy = false;
    toggleComposer(false);
    setCompanionState(SUPPORT[appState.support].state);
    pending.article.scrollIntoView({ behavior: "smooth", block: "end" });
    chatInput.focus();
  }
}

async function requestReply() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: SUPPORT[appState.support].apiMode,
        scene: "科研与组会",
        userTurnCount: appState.conversation.filter((item) => item.role === "user").length,
        messages: appState.conversation,
        sessionId: appState.sessionId,
        requestId: window.crypto?.randomUUID?.() || `request-${Date.now()}`,
        attempt: 0
      }),
      signal: controller.signal
    });
    if (!response.ok || !response.body) throw new Error("对话服务暂时不可用");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    if (!result.trim()) throw new Error("回复为空");
    return result.trim();
  } finally {
    window.clearTimeout(timer);
  }
}

function toggleComposer(disabled) {
  chatInput.disabled = disabled;
  chatForm.querySelector("button[type='submit']").disabled = disabled;
}

function resizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => setRoute(button.dataset.route));
});

document.querySelectorAll("[data-support]").forEach((button) => {
  button.addEventListener("click", () => setSupport(button.dataset.support));
});

document.querySelectorAll("[data-chat-action]").forEach((button) => {
  button.addEventListener("click", () => setSupport(button.dataset.chatAction, true));
});

homeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = normalizeText(homeInput.value);
  setRoute("chat");
  if (text) {
    homeInput.value = "";
    askTreeHole(text);
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = normalizeText(chatInput.value);
  if (!text) return;
  chatInput.value = "";
  resizeTextarea(chatInput);
  askTreeHole(text);
});

[homeInput, chatInput].forEach((textarea) => {
  textarea.addEventListener("input", () => resizeTextarea(textarea));
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

window.addEventListener("resize", () => {
  const state = CHARACTER_STATES[appState.companion];
  document.querySelectorAll("[data-character-stage]").forEach((stage) => {
    const image = stage.querySelector("[data-character-image]");
    if (stage.classList.contains("has-image")) {
      positionCharacterImage(stage, image);
    }
  });
});

setGreeting();
setSupport("listen");
setCompanionState("idle");
