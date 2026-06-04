# MuseAI 微信小程序前端

MuseAI 前端是面向西安半坡博物馆导览体验的微信小程序。当前以“小程序上线”为第一交付目标，围绕个性化问卷、导览身份、AI 策展路线、展厅对话、文字搜展品、展品详情讨论和游览报告形成闭环。

English version: [README_EN.md](./README_EN.md)

## 当前阶段

当前处于 Stage 10D 后的持续优化阶段。已完成 Stage 9A-9D、10A-10C 的主要功能修复，并开始补齐“反身性公共史学”体验，包括用户初始判断、导览过程中的轻量追问、报告中的认知变化总结。

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
- 搜展品：已实现文字搜索；不再把未完成的拍照识别伪装成可用功能。
- 展品详情页：支持围绕器物、遗迹、空间或资料继续与 AI 讨论。
- 游览报告页：统计访问、互动、提问线索、复盘清单和认知变化。
- 会话缓存：至少与 AI 对话达到保留条件后，首页才显示“继续上次导览”。
- 移动端适配：底部操作区和聊天输入栏已加入 safe-area 处理。

## 尚未完成

- 拍照搜索展品。
- OCR 或图像识别后端链路。
- 语音输入。
- 小程序端 TTS 播放闭环。
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

当前前端会向导览流接口额外传递：

- `client_context`：当前展厅、问卷、当前讨论对象等轻量上下文。
- `conversation_history`：最近几轮用户和 AI 对话，用于改善连续追问的相关性。

检索 query 仍保持用户当前输入，避免旧对话污染 RAG 检索。

## 发布注意事项

- 未完成能力不要在 UI 中展示为可用功能。
- 小程序正式上线必须使用 HTTPS 域名，并在微信公众平台配置 request 合法域名。
- 真机测试时重点检查 iPhone 刘海屏、Home Indicator、安卓小屏和大字号模式。
- `project.private.config.json` 属于本地开发配置，不应作为团队环境契约。

