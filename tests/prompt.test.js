const assert = require("node:assert");
const { buildInstructions } = require("../lib/prompt");

const listenPrompt = buildInstructions("listen", "导师", 1);
const actionPrompt = buildInstructions("action", "科研", 2);
const safetyPrompt = buildInstructions("safety", "未来", 1);
const reflectPrompt = buildInstructions("understand", "科研", 5);

assert.match(listenPrompt, /不是医生/);
assert.match(listenPrompt, /不做医学诊断/);
assert.match(listenPrompt, /不编造热线号码/);
assert.match(listenPrompt, /不要求用户提供真实姓名/);
assert.match(listenPrompt, /默认每轮只问 1 个问题/);
assert.match(actionPrompt, /10-15 分钟/);
assert.match(actionPrompt, /每次只给 1 个低负担动作/);
assert.match(safetyPrompt, /联系现实中的可信任的人/);
assert.match(safetyPrompt, /当地紧急服务/);
assert.match(reflectPrompt, /本轮适合做一次轻柔回望/);

console.log("Prompt checks passed.");
