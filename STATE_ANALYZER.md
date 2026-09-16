# 研压树洞｜Stage 3 State Analyzer 影子评测

## 运行方式

State Analyzer 在正式风险检测之后影子运行。它输出结构化状态并写入 state_analyzed_shadow 事件，但不会改变 SAFETY 或 SUPPORT 路由，也不会改变用户最终看到的回复。

输出字段：

- scene：research、advisor、future、mixed、unknown
- intent：listen、understand、action、safety、unknown
- emotion：anxious、wronged、self_blame、exhausted、angry、ashamed、frustrated、powerless、positive、mixed、unknown
- need：listening、clarity、action、safety、unknown
- risk：high、mid、none、unknown
- confidence：每个字段对应 0 到 1 的置信度
- rationale：每个字段对应不含对话原文的简短规则依据

完整约束见 api/state-schema.js。

## Evaluation Set

- 数据量：50 条
- 数据来源：项目内人工编写的完全合成语句，不包含真实用户数据
- 场景覆盖：科研、导师、未来、通用情绪及安全风险
- 指标：各字段 Accuracy、Risk Recall、Risk False Positive Rate

## 2026-09-15 结果

| 指标 | 结果 | 验收阈值 |
|---|---:|---:|
| Scene Accuracy | 96% | ≥ 90% |
| Intent Accuracy | 100% | ≥ 90% |
| Emotion Accuracy | 100% | ≥ 80% |
| Need Accuracy | 100% | ≥ 90% |
| Risk Accuracy | 100% | 观察项 |
| Risk Recall | 100% | ≥ 95% |
| Risk False Positive Rate | 0% | ≤ 5% |

运行命令：node --test。

## 结果边界

该评测集与当前关键词规则共享领域词汇，高分代表实现与既定标签规则一致，不代表对隐喻、反讽、否定表达、拼写变体或真实长对话具有同等泛化能力。正式路由仍使用 Stage 0 的 Hard Safety Routing；State Analyzer 必须继续影子运行，积累经脱敏标注的真实 Bad Case 后才能评估是否进入 Stage 4。

分类器异常只记录 state_analyzer_failed，不得中断安全或普通支持链路。
