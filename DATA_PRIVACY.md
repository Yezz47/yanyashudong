# 研压树洞｜Stage 1 数据结构与隐私边界

## 数据结构

### Session

| 字段 | 说明 |
|---|---|
| sessionId | 页面加载时随机生成，仅用于串联当前浏览器会话 |
| startedAt | 会话开始时间，不包含用户身份信息 |

进入服务端事件后，以上字段规范化为 session_id；服务端不记录原始对话。

### Message

| 字段 | 说明 |
|---|---|
| id | 随机消息 ID |
| role | user 或 assistant |
| content | 对话内容，仅用于当前页面对话和模型请求 |
| createdAt | 消息创建时间 |

消息原文不写入服务端结构化事件日志。

### Event

事件 Schema 版本为 1.0。公共字段为：

- event_type、occurred_at
- session_id、request_id、attempt
- requested_support_mode
- recommended_route、effective_route
- outcome、error_code、duration_ms
- app / prompt / analyzer / router 版本

当前事件类型：request_received、risk_analyzed、state_analyzed_shadow、state_analyzer_failed、policy_routed_shadow、policy_router_failed、task_planner_started、task_planner_completed、task_planner_failed、short_term_memory_loaded、short_term_memory_updated、short_term_memory_failed、short_term_memory_cleared、experiment_assigned、experiment_assignment_failed、route_selected、context_built、upstream_attempted、response_validated、response_validator_failed、request_completed、client_fallback、client_response_completed。

同一 session_id 下按 request_id 和 occurred_at 排序，可还原一次请求的检测、路由、重试、模型结果和最终客户端降级结果。

### Feedback 与 Bad Case

反馈记录保存在浏览器 localStorage，包含评分、场景、轮次、三个路线字段、执行结果、实验分组和模块版本。结构化 Bad Case 使用封闭类别、严重度和“根因假设”字段；用户填写的“不适表达”只作为本地 description。自由文本、Bad Case 明细和本地聚合结果均不上传服务端。

## 收集边界

服务端事件允许记录：随机 ID、枚举、消息数量、重试序号、耗时、HTTP 状态、错误类别和版本。

服务端事件禁止记录：

- 用户或助手的对话原文
- 姓名、学号、学校、导师姓名、手机号、身份证或住址
- IP、User-Agent、Cookie 和定位信息
- API Key、请求头或完整异常堆栈

## 保存与保留

- 原始对话：只存在当前页面内存和发往模型的当次请求；应用不建立服务端对话库。
- 长对话上下文：较早消息仅提取预定义标签，不把较早原文复制进 Context Builder 摘要或事件日志。
- State Analyzer：事件只保存枚举、置信度和预定义规则依据，不保存触发该判断的原文片段。
- Task Planning Tool：事件只保存状态、任务类别、计划时长和执行耗时；不保存输入原文或计划正文。
- 短期 Memory：只在服务进程内按临时 session_id 保存当前话题、未完成事项、明确支持偏好和上次执行路线；不保存对话原文、情绪或风险标签。30 分钟无更新自动过期，最多 1000 个会话，进程重启即清空，用户点击“清空对话”时显式删除对应会话记忆。
- Response Validator：事件只保存通过、修订或阻断状态、预定义违规代码及输入输出长度；不保存模型回复正文。
- 单变量实验：服务端事件只保存实验 ID、变量名、分组、是否符合资格和排除原因；不保存对话或反馈正文。SAFETY 路线固定排除。
- 结构化事件：当前实现写入运行时标准输出，应用自身不持久化。生产部署必须将平台日志保留期配置为不超过 7 天。
- 本地反馈：最多保存最近 100 条，用户可通过浏览器清除站点数据删除。
- Stage 1 不建立跨设备画像，不用随机 ID 推断或拼接真实身份。

## 部署门槛

若部署平台无法确认日志保留期、访问权限或日志脱敏，不应开启长期事件采集。未来引入数据库前，需要单独补充访问控制、删除机制和用户告知。
