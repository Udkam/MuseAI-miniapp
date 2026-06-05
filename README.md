# MuseAI 微信小程序前端

MuseAI 前端是面向西安半坡博物馆导览体验的微信小程序。当前以“小程序上线”为第一交付目标，围绕个性化问卷、导览身份、AI 策展路线、展厅对话、文字搜展品、展品详情讨论和游览报告形成闭环。

English version: [README_EN.md](./README_EN.md)

## 当前阶段

当前处于 Stage 12B 的拍照/OCR 展项识别 MVP 阶段。已完成 Stage 12A 的 TTS 手动播放闭环，并开始在搜展品页补齐小程序端拍照识别、文字匹配和详情跳转能力。

## 已实现能力

- 首页入口：个性化导览、默认游客导览、继续上次导览。
- 三步问卷：追问方向、初始判断、导览节奏。
- 四类身份：
  - 考古研究员，对应后端 persona `A`
  - 研学记录员，对应后端 persona `B`
  - 历史追问者，对应后端 persona `C`
  - 器物研究员，对应后端 persona `D`
- 身份揭示页：展示导览视角和后续流程。
- AI 策展路线页：调用后端 `/curator/plan-tour`，失败时保持可用。
- 展厅选择页：按照常开放展厅优先、临展厅靠后的固定顺序展示。
- 展厅导览页：SSE 流式 AI 回答、建议条、Markdown 渲染、复制纯文本。
- TTS 手动播放 MVP：AI 回复完成后可点击“播放”生成语音，播放中可停止；同一时间只播放一条。
- 搜展品：支持文字搜索；拍照识别已接入小程序端 OCR 抽象、展项 fuzzy matching、识别摘要和详情跳转。未配置 OCR 服务时会回退到文字搜索。
- 展品详情页：支持围绕器物、遗迹、空间或资料继续与 AI 讨论。
- 游览报告页：统计访问、互动、提问线索、复盘清单和认知变化。
- 会话缓存：至少与 AI 对话达到保留条件后，首页才显示“继续上次导览”。
- 移动端适配：底部操作区和聊天输入栏已加入 safe-area 处理。

## 尚未完成

- 高精度拍照识别和多角度图像理解。
- OCR 后端代理链路。
- 语音输入。
- 自动连续语音播报。
- 后台播放。
- 官方室内地图、定位和展品点位导航。
- 馆方授权的完整展品图像与空间位置数据。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 运行环境 | 微信小程序原生框架 |
| UI | WXML / WXSS / TDesign Mini Program |
| 状态管理 | CommonJS store |
| 网络请求 | `utils/request.js` |
| 流式响应 | `api/stream.js` 基于 `wx.request enableChunked` |
| 本地缓存 | `utils/storage.js` |
| 测试 | Node 脚本 |

## 目录结构

```text
frontend/
├─ app.js / app.json / app.wxss
├─ api/
│  ├─ index.js          # REST API 封装
│  └─ stream.js         # SSE/分块响应解析
├─ components/
│  ├─ chat/
│  ├─ common/
│  ├─ exhibit/
│  └─ persona/
├─ constants/
│  └─ banpo-halls.js    # 展厅 slug、中文名、顺序、别名
├─ pages/
│  ├─ home/
│  ├─ onboarding/
│  ├─ persona-reveal/
│  ├─ route/
│  ├─ hall/
│  ├─ tour/
│  ├─ exhibit-scan/
│  ├─ exhibit-detail/
│  └─ report/
├─ store/
│  ├─ tour.js
│  └─ chat.js
├─ utils/
└─ scripts/
```

## 本地运行

1. 安装依赖：

```bash
cd frontend
npm install
```

2. 用微信开发者工具打开 `frontend/`。

3. 检查 `api/index.js` 中的 API 基地址，开发环境通常指向：

```text
http://127.0.0.1:8000/api/v1
```

真机或远程服务器测试时，需改为可访问的 HTTPS 域名或开发工具允许的调试地址。

## 常用测试

```bash
cd frontend
npm run test:markdown
npm run test:suggestions
npm run test:report
npm run test:all
node --check api/index.js
node --check store/tour.js
node --check pages/tour/tour.js
```

## 与后端契约

关键接口：

- `POST /api/v1/tour/sessions`
- `PATCH /api/v1/tour/sessions/{id}`
- `POST /api/v1/tour/sessions/{id}/chat/stream`
- `GET /api/v1/tour/halls`
- `GET /api/v1/exhibits`
- `GET /api/v1/exhibits/{id}`
- `POST /api/v1/tour/sessions/{id}/report`
- `POST /api/v1/curator/plan-tour`
- `POST /api/v1/tts/synthesize`

当前前端会向导览流接口额外传递：

- `client_context`：当前展厅、问卷、当前讨论对象等轻量上下文。
- `conversation_history`：最近几轮用户和 AI 对话，用于改善连续追问的相关性。

检索 query 仍保持用户当前输入，避免旧对话污染 RAG 检索。

## TTS 播放 MVP

当前 TTS 是手动播放能力：

- 只在 assistant 回复完成后显示播放按钮。
- 用户点击后调用 `POST /api/v1/tts/synthesize`。
- 后端当前返回 `audio` 和 `format`，其中 `format=pcm16`，前端会把 base64 PCM16 封装成临时 WAV 文件后播放。
- 默认不自动播放，即使本地旧偏好里存在 `autoPlay=true`，tour 页也不会在回复完成后自动外放。
- 不支持语音输入。
- 不支持后台播放。
- 不支持播放列表或自动连续播报。
- 页面离开时会停止当前音频。

## 拍照/OCR 识别 MVP

当前拍照识别只在 `pages/exhibit-scan/exhibit-scan` 内实现：

- 点击“拍照识别”后调用小程序相机拍照，并读取图片 base64。
- 前端通过 `api.ocrApi.recognizeImage()` 调用小程序端 OCR 能力；默认未配置 OCR 服务 ID，不会请求 MuseAI 后端。
- OCR 返回文本后，前端用展品名称、别名、类别、描述和编辑距离做 fuzzy matching。
- 命中后显示识别摘要卡片，点击可进入 `exhibit-detail`。
- 未命中、OCR 未配置或 OCR 失败时提示“未识别到展品，请重试”，并保留文字搜索 fallback。
- 不新增数据库表，不新增后端 API，不新增 LLM 调用。

如要启用真实 OCR，需要在小程序侧配置可用的 OCR 服务，并向 `app.globalData.ocrServiceConfig` 写入：

```js
ocrServiceConfig: {
  service: '你的 OCR 服务 ID',
  api: 'OcrAllInOne',
  dataType: 2,
  ocrType: 0,
}
```

## 发布注意事项

- 未完成能力不要在 UI 中展示为可用功能。
- 小程序正式上线必须使用 HTTPS 域名，并在微信公众平台配置 request 合法域名。
- 真机测试时重点检查 iPhone 刘海屏、Home Indicator、安卓小屏和大字号模式。
- `project.private.config.json` 属于本地开发配置，不应作为团队环境契约。
