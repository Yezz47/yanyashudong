# 研压树洞 Demo

这是一个面向研究生科研、学业和毕业压力场景的 AI 情绪疏解助手原型。

## 推荐打开方式

实时对话请使用 Node 后端入口，端口是 `4174`：

方式一：在 PowerShell 当前窗口设置：

```powershell
cd F:\P,M
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-chat"
node server.example.js
```

方式二：在 `F:\P,M` 新建本地 `.env` 文件：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

然后运行：

```powershell
cd F:\P,M
node server.example.js
```

然后打开：

```text
http://127.0.0.1:4174/index.html
```

`4175` 如果是 `python -m http.server` 启动的，只适合静态预览页面，不适合真实实时对话。

## 网络不稳定时的策略

当前前端已经开启后端流式模式：

```js
useBackendStream: true
```

用户发送消息后会先连接 `/api/chat/stream`。如果 DeepSeek 网络超时或中断，前端会自动重试一次；仍失败时，会切换到本地疏解模板，保证 demo 不会卡死，用户也能继续完成“表达情绪 -> 整理情绪 -> 轻量行动”的闭环。

## DeepSeek 接入说明

后端使用 DeepSeek OpenAI 兼容接口：

- Base URL: `https://api.deepseek.com`
- Endpoint: `/chat/completions`
- 默认模型：`deepseek-chat`
- 流式字段：`choices[0].delta.content`

API Key 只放在服务端环境变量里，不要写进前端页面或提交到代码文件。

## 分享给别人

### 1. 本机演示

适合自己电脑上展示：

```powershell
cd F:\P,M
node server.example.js
```

打开：

```text
http://127.0.0.1:4174/index.html
```

### 2. 同一 Wi-Fi/局域网分享

让同一网络下的同学访问你的电脑：

```powershell
cd F:\P,M
$env:HOST="0.0.0.0"
node server.example.js
```

然后查看你电脑的局域网 IP：

```powershell
ipconfig
```

把地址发给对方，格式类似：

```text
http://你的局域网IP:4174/index.html
```

注意：Windows 防火墙可能会询问是否允许 Node.js 访问网络，需要允许专用网络访问。

### 3. 公网分享

适合发给不在同一网络的人。推荐把整个项目部署到一个支持 Node 服务的平台，例如 Render、Railway 或自己的服务器/VPS。

#### Vercel 部署

Vercel 会把根目录静态页面作为网站，把 `/api` 目录下的文件作为后端函数。这个项目已经提供：

```text
api/chat/stream.js
api/health.js
vercel.json
```

推荐步骤：

1. 注册 Vercel，并用 GitHub 登录。
2. 把 `F:\P,M` 上传到 GitHub，确保 `.env` 没有被提交。
3. 在 Vercel 新建 Project，Import 你的 GitHub 仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空。
6. Output Directory 留空。
7. 在 Environment Variables 添加：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

8. Deploy 后，Vercel 会给你一个 `https://xxx.vercel.app` 链接。

部署成功后，先访问：

```text
https://你的项目.vercel.app/api/health
```

看到 `"keyConfigured": true`，再访问：

```text
https://你的项目.vercel.app/
```

以 Render 为例：

1. 把项目上传到 GitHub，确保不要上传 `.env`。
2. 在 Render 新建 Web Service，选择这个 GitHub 仓库。
3. Build Command 使用：

```text
npm install
```

4. Start Command 使用：

```text
npm start
```

5. 在平台后台配置环境变量：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

部署成功后，平台会给你一个 `https://...` 的公网链接，别人点开就能使用。

不要把 `.env` 或 API Key 发给别人，也不要把 Key 写到 `script.js`、`index.html` 里。公开分享后，别人使用工具会消耗你的 DeepSeek 额度，正式开放前建议增加访问口令、限流或用量统计。
