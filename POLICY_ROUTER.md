# 研压树洞｜Stage 4 Policy Router

## 路由优先级

1. 风险为 high / mid、需要为 safety，或 Hard Safety 已触发 → SAFETY
2. 信息不足、状态无效、无法判断，或用户希望进一步理解 → CLARIFY
3. 用户明确请求行动支持 → ACT
4. 用户明确请求倾听支持 → LISTEN

未知风险或无效 State 不得推荐为低风险路线。

## 三个路线字段

- requested_support_mode：用户在界面明确选择的支持模式
- recommended_route：Policy Router 根据影子 State 推荐的路线
- effective_route：当前实际执行的路线

这三个字段必须分别记录，便于发现用户选择、分类判断和最终执行之间的偏差。

## 影子开关

默认 POLICY_ROUTER_ENFORCED=false：

- Hard Safety 始终可以强制 effective_route 为 SAFETY
- 普通场景的 effective_route 继续服从用户明确选择
- recommended_route 只进入 policy_routed_shadow 事件

只有显式设置 POLICY_ROUTER_ENFORCED=true 时，普通场景才执行 recommended_route。启用前必须先审查真实、脱敏的 Bad Case，不能只依据合成集结果。

## 路线与 Prompt 模式映射

| 路线 | Prompt 模式 |
|---|---|
| SAFETY | 固定安全响应，不调用普通模型 |
| CLARIFY | understand |
| ACT | action |
| LISTEN | listen |

Router 异常时：若已启用强制路由，则进入 SAFETY；若仍处于影子模式，则保留 Hard Safety 结果和用户明确选择。

## 评测

50 条合成 State Evaluation Set 的路由一致性为 100%。该结果只证明当前枚举与规则一致，不代表真实对话泛化能力。
