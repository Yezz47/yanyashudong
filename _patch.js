const fs = require("fs");

// 1) 后端：502 透传 DeepSeek 真实状态码与错误内容，方便排查
{
  const file = "server.example.js";
  let s = fs.readFileSync(file, "utf8");
  const re = /if \(!upstream\.ok \|\| !upstream\.body\) \{[\s\S]*?\n {2}\}/;
  const next = [
    "if (!upstream.ok || !upstream.body) {",
    "    const detail = await upstream.text().catch(() => \"\");",
    "    const status = upstream.status === 402 ? 402 : 502;",
    "    res.writeHead(status, { \"Content-Type\": \"text/plain; charset=utf-8\" });",
    "    res.end(`DeepSeek 接口返回错误（HTTP ${upstream.status}）：${detail || \"服务暂时不可用，请稍后再试。\"}`);",
    "    return;",
    "  }"
  ].join("\n");
  if (s.includes("const detail = await upstream.text()")) {
    console.log("server.example.js 已透传错误，跳过。");
  } else if (re.test(s)) {
    s = s.replace(re, next);
    fs.writeFileSync(file, s, "utf8");
    console.log("server.example.js 已更新：错误透传。");
  } else {
    console.log("server.example.js 未匹配到错误块。");
  }
}

// 2) 前端：把后端返回的真实错误显示到气泡里，而不是统一兜底文案
{
  const file = "script.js";
  let s = fs.readFileSync(file, "utf8");
  const anchor =
    'if (!response.ok || !response.body) throw new Error("stream request failed");';
  const next = [
    "if (!response.ok) {",
    "    const detail = await response.text().catch(() => \"\");",
    "    bubble.textContent = detail || `请求失败（HTTP ${response.status}）`;",
    "    return;",
    "  }",
    "  if (!response.body) throw new Error(\"stream request failed\");"
  ].join("\n");
  if (s.includes("bubble.textContent = detail")) {
    console.log("script.js 已显示真实错误，跳过。");
  } else if (s.includes(anchor)) {
    s = s.replace(anchor, next);
    fs.writeFileSync(file, s, "utf8");
    console.log("script.js 已更新：显示真实错误。");
  } else {
    console.log("script.js 未匹配到锚点。");
  }
}
