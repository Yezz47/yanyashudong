# 研压树洞｜Stage 5 Task Planning Tool

## 调用条件

Task Planning Tool 只在最终路线为 ACT 时调用。

- SAFETY：禁止调用工具，直接返回固定安全支持。
- CLARIFY：不调用工具，先补充具体对象。
- LISTEN：不调用工具，继续倾听。
- ACT：校验输入后尝试生成一个低负担下一步。

## 输入契约

输入必须通过 TASK_PLANNER_INPUT_SCHEMA：

- schema_version：1.0
- scene：State Analyzer 的场景枚举
- intent：State Analyzer 的意图枚举
- risk：high、mid、none 或 unknown
- user_text：最近一条用户消息，仅在本次内存调用中使用

风险不是 none 时，工具必须返回 blocked，不得生成行动。

## 输出契约

输出必须通过 TASK_PLANNER_OUTPUT_SCHEMA，状态只能是：

- ok：恰好包含一个 action
- needs_clarification：action 必须为 null，并返回一个澄清问题
- blocked：action 必须为 null，优先安全支持

成功 action 包含标题、执行说明、5–15 分钟时长和完成标志。当前产品默认生成 10–15 分钟的小动作，不生成任务列表或宏大计划。

## 降级规则

- 信息不足：ACT 调整为 CLARIFY，模型只提出工具给出的澄清问题。
- 输入非法、输出非法、工具异常：ACT 调整为 CLARIFY，明确禁止模型虚构工具结果。
- 工具返回 blocked：实际路线调整为 SAFETY。
- 上游模型随后失败：沿用现有本地降级，不把工具失败描述为工具成功。

## 隐私与可观测性

服务端事件记录 task_planner_started、task_planner_completed 和 task_planner_failed。事件只包含状态、任务类别、计划时长、错误类别和耗时，不记录 user_text 或行动正文。

版本：task-planner-v1。
