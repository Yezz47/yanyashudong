# 研压树洞｜Stage 8 Bad Case、分析与实验

## Bad Case 数据契约

每条 Bad Case 使用封闭 Schema，包含：类别、严重度、根因假设、场景、执行路线、执行结果、实验分组、模块版本组合和本地描述。

类别包括：unsafe_response、misunderstood、unnatural_tone、unhelpful_action、reliability_failure、uncomfortable_expression。

根因只标记为 hypothesis，包括 State Analyzer、Policy Router、Task Planner、Response Validator、模型生成、上游可靠性或 unknown。启发式分类不代表已经确认真实根因。

## 本地分析维度

反馈页在浏览器本地计算：

- 总反馈量、被理解感高分率、再次使用意愿率、负反馈率和降级率
- 按场景聚合
- 按 recommended_route 和 effective_route 分别聚合
- 按完整模块版本组合聚合
- 按实验分组聚合
- Bad Case 类别、根因假设和严重度计数

本地最多保留最近 100 条反馈。用户自由文本、Bad Case 明细和聚合结果不上传服务端。

## 单变量实验

实验 ID：closing-question-style-v1。

唯一变量：closing_question_style。

- open_question：结尾使用一个可拒绝的开放式轻问题
- choice_question：结尾使用一个可拒绝的二选一轻问题

同一 session_id 使用确定性哈希稳定分组。除结尾问题形式外，不改变 Prompt 的安全、诊断、隐私、行动数量、路由、工具或记忆规则。

## 安全边界

- SAFETY 不进入实验，且在分配器和聊天入口各有一道阻断
- 非法实验配置降级为 unassigned，不向 Prompt 注入实验指令
- 服务端只记录实验 ID、变量、分组和资格状态，不记录对话或反馈正文
- 在真实样本量和统计功效不足前，不根据组间比例差异宣称实验胜出

## 验收结果

- 稳定分组、单变量约束、SAFETY 双重排除和非法配置降级均有自动化测试
- Bad Case 封闭 Schema、分类、根因假设和多维聚合均有自动化测试
- Stage 0–8 共 55 项测试通过
