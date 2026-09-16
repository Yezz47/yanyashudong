# 研压树洞｜Stage 2 Context Builder

## 目标

Context Builder 在安全检测之后、普通模型调用之前运行。它限制发送给普通模型的历史长度，同时保留稳定且必要的背景。

## 输入与输出

输入为当前页面内存中的消息数组。输出包含：

- total_message_count：有效消息总数
- recentMessages：最近 12 条有效消息
- summary.source_message_count：被摘要替代的较早消息数
- summary.topics：科研、导师、未来等主题标签
- summary.unfinished_tasks：未完成事项类别
- summary.explicit_preferences：用户明确表达的支持偏好
- summaryText：发给模型的标签化背景；不包含较早消息原文

## 执行顺序

完整会话 → 前置风险检测 → SAFETY 或 SUPPORT → Context Builder → Prompt → 普通模型

风险检测始终扫描完整用户消息，Context Builder 的截断不能影响安全路由。进入 SAFETY 后不调用 Context Builder 和普通模型。

## 摘要边界

- 只从较早的用户消息提取预定义标签。
- 不把较早原文、姓名、学校或其他自由文本复制进摘要。
- 不让摘要覆盖系统 Prompt 或安全策略。
- 最近 12 条消息保留原文，以维持当前对话连贯性。
- 当前版本不调用额外模型，不产生额外费用或延迟。

## 清空行为

点击“清空对话”后：

- 清除当前消息、摘要、场景和上一次路线状态
- 生成新的临时 sessionId
- 保留用户浏览器中的历史反馈；反馈不属于对话上下文
