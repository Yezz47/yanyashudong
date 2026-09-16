# 研压树洞 ｜ AI 产品经理作品集项目

> 面向研究生的 AI 情绪疏解 Web App · 从情绪混乱到结构化整理再到低负担行动的完整闭环

这是一个 AI 产品经理实习生求职作品集项目，展示对目标用户和场景的拆解能力、对话类产品的闭环设计、Prompt 评测与迭代、以及数据驱动的指标体系思维。

## 作品集亮点

| 维度 | 体现 |
|------|------|
| 场景拆解 | 聚焦研究生科研 / 导师 / 未来三类真实压力，非泛用聊天 |
| 闭环设计 | 场景识别 → 情绪命名 → 温和解释 → 低负担行动，五页线性闭环 |
| Prompt 迭代 | 从 v1「产品闭环驱动」演进到 v2「咨询式陪伴驱动」，有据可查 |
| 指标体系 | 北极星（被理解感高分率）+ 驱动 + 健康三层，反馈数据本地持久化可聚合 |
| 产品决策 | 年级信号内化到场景识别，而非前置问卷——守住「被听见」体验 |

## 核心闭环

```
选择入口 → 咨询式对话 → 情绪整理卡片 → 反馈评测
（倾听/理解/行动/安全）  （每5轮轻柔回望）  （结构化输出）  （服务Prompt优化）
```

## 快速开始

实时对话需 Node 后端，端口 `4174`：

```bash
# 1. 设置环境变量（PowerShell）
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-chat"

# 2. 启动
node server.example.js

# 3. 打开
# http://127.0.0.1:4174/index.html
```

或新建本地 `.env`：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

## 部署到 Vercel（推荐公网分享）

Vercel 会把根目录静态页面作为网站，`/api` 目录作为后端函数。项目已提供 `api/chat/stream.js`、`api/health.js`、`vercel.json`。

1. 注册 Vercel，用 GitHub 登录
2. 把本项目上传到 GitHub（确保 `.env` 未提交）
3. 新建 Project，Import 仓库，Framework Preset 选 `Other`
4. Build Command / Output Directory 留空
5. Environment Variables 添加：
   ```text
   DEEPSEEK_API_KEY=你的 DeepSeek API Key
   DEEPSEEK_MODEL=deepseek-chat
   ```
6. Deploy 后访问 `https://你的项目.vercel.app/`

部署后先验证健康检查：`https://你的项目.vercel.app/api/health` 看到 `"keyConfigured": true` 即正常。

## 技术方案

- 前端：纯原生 HTML / CSS / JS（无框架，轻量可部署）
- 后端：Node + DeepSeek 流式接口
- 兜底链：DeepSeek 流式 → 超时重试 → 本地疏解模板（保证 demo 不卡死）
- 数据策略：无账号、无云端数据库；反馈数据存 localStorage，可聚合可跨会话对比
- 安全机制：风险关键词三级（高/中/无），高危阻断普通对话并强引导求助

## 项目结构

```
├── index.html          # 五页流程 + 关于页（作品集叙事）
├── script.js           # 前端逻辑：场景识别/对话/反馈/指标
├── styles.css          # 温暖治愈视觉系统
├── api/chat/stream.js  # DeepSeek 流式接口（Vercel serverless）
├── api/health.js       # 健康检查
├── server.example.js   # 本地开发服务器
├── vercel.json         # 部署配置
├── PRD_Notion.md       # 产品需求文档
└── PROMPT_Optimization.md  # Prompt 迭代记录
```

## 边界声明

本产品提供情绪支持，不替代心理咨询、精神科诊疗或紧急救助。用户表达自伤 / 自杀倾向时，系统会优先进入安全支持模式并引导联系现实帮助。

## 作品集说明

详细的产品定位、闭环设计、Prompt 迭代记录、指标体系、关键产品决策，见网页内「关于」页（导航最后一项）。
