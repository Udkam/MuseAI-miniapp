# MuseAI — 半坡遗址 AI 智慧导览小程序

微信原生小程序，为半坡博物馆打造的 AI 导览体验：个性化身份问卷、流式 AI 导览对话、展品识别与讲解、游览报告生成。

## 技术栈

| 层次 | 技术 |
|------|------|
| 运行环境 | 微信小程序（原生，无框架） |
| UI 组件库 | tdesign-miniprogram 1.15.x |
| 状态管理 | 模块化 store（store/auth.js / chat.js / tour.js） |
| 网络层 | wx.request 封装（utils/request.js，含重试与 Token 注入） |
| 流式网络层 | wx.request enableChunked（api/stream.js，SSE 解析） |
| 本地存储 | wx.storage 封装（utils/storage.js） |
| 后端 API | REST + SSE，详见 `api/index.js` |

## 目录结构

```
frontend/
├── app.js / app.json / app.wxss   # 小程序入口与全局配置
├── pages/
│   ├── home/          首页，AI 导览入口
│   ├── onboarding/    三题问卷，确定游客身份（调用 POST /tour/sessions）
│   ├── persona-reveal/揭晓身份（考古队长 / 半坡原住民 / 历史老师）
│   ├── hall/          展厅选择（调用 PATCH /tour/sessions/:id status=touring）
│   ├── tour/          AI 导览聊天主界面（SSE 流式输出 + RAG 进度显示）
│   ├── exhibit-scan/  展品识别（拍照 / 输入名称）
│   ├── exhibit-detail/展品详情与讲解
│   ├── route/         推荐参观路线
│   └── report/        游览报告
├── components/
│   ├── common/section-card/     通用卡片容器
│   ├── chat/message-bubble/     聊天消息气泡
│   ├── persona/persona-card/    身份卡片
│   └── exhibit/exhibit-card/    展品卡片
├── store/
│   ├── auth.js        认证状态（基于 wx.storage）
│   ├── chat.js        聊天消息与流式状态机
│   └── tour.js        导览会话、事件缓冲、偏好设置
├── api/
│   ├── index.js       所有后端端点封装（含 healthApi、tourApi.chatStream）
│   └── stream.js      SSE 流式层（wx.request enableChunked + ArrayBuffer 解码）
├── utils/
│   ├── request.js     wx.request 封装（重试、Bearer Token）
│   └── storage.js     wx.storage 封装（统一键名）
├── constants/index.js RAG 步骤配置、Persona 标签、风格映射
└── _web_archive/      原 Vue 3 Web 端代码（仅作参考，不参与编译）
```

## 本地运行

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开项目：选择 `frontend/` 目录（即含 `app.json` 的目录）
3. AppID 已配置为 `wx04be7edd5700ecf5`（可在 `project.config.json` 修改）
4. 首次打开后，工具菜单 → **工具 → 构建 npm**（tdesign-miniprogram 依赖）
5. 点击编译，模拟器即可预览

> **注意**：`node_modules/` 不提交 git，运行前需确保已执行 `npm install` 并构建 npm。

## 当前开发阶段

| 阶段 | 状态 | 内容 |
|------|------|------|
| Stage 1 | ✅ 完成 | 目录结构、工具层（request / storage）、常量 |
| Stage 2 | ✅ 完成 | store 层（auth / chat / tour） |
| Stage 3 | ✅ 完成 | API 层全端点移植（wx.request 替代 fetch） |
| Stage 4 | ✅ 完成 | 页面骨架 + 组件骨架 + 导航流程 |
| Stage 5 | ✅ 完成 | 游客导览会话接入后端 |
| Stage 6 Batch 1 | ✅ 完成 | SSE 流式底层 api/stream.js |
| Stage 6 Batch 2 | ✅ 完成 | tour 页面真实 SSE 流式 AI 回复 |
| Stage 6 Batch 3 | ✅ 完成 | 流式性能优化与 UX 改善 |
| Stage 7 | ✅ 完成 | 游览事件记录 + 报告生成闭环 |
| Stage 8A | ✅ 完成 | 问卷重构（意图卡片 + 时间预算）+ assumption 接入 |
| Stage 8B | ✅ 完成 | 路线页个性化（preferredHallOrder + SVG 展厅示意） |
| **Stage 9A** | **✅ 当前** | **展品真实数据接入 + Hall 映射修复 + Persona Prompt 系统** |
| Stage 9B | 🔲 待开始 | style 偏好（answerLength/depth）真正传入 chatStream |
| Stage 9C | 🔲 待分析 | AI 速度优化（需先通过 llm-traces 测量链路） |
| Stage 9D | 🔲 待分析 | TTS 语音播报（PCM16 → wx.createInnerAudioContext） |

### Stage 6 Batch 2 — 流式 AI 对话

`pages/tour/tour.js` 已接入真实 SSE 流式输出：

**流式更新机制**：
- `messages[]` 仅存放「已完成」的消息（用户消息 + 完整 AI 回复）
- `streamingContent` 单独存放正在流入的文本，每个 chunk 只更新这一个字段
- 避免每次 chunk 都重建整个 `messages[]` 数组，setData 开销极小
- `onDone` 时将 `streamingContent` 提交为新消息，加入 `messages[]`

**RAG 步骤进度**：
- `onEvent` 收到 `rag_step` 时调用 `chatStore.setRagStep()`，同步到 `ragSteps[]`
- 仅在 `isThinking || isStreaming` 时显示，流结束后自动清空
- 步骤状态：`pending` → `running`（橙色脉冲）→ `completed`（绿色 ✓）

**中断恢复**：
- `onUnload` 自动调用 `task.abort()` 防止后台继续接收
- 无会话（演示模式）时使用 `_mockReply()` 逐字模拟流式效果
- 所有错误 Toast 提示 + 错误消息气泡，不白屏

### Stage 6 Batch 3 — 流式性能优化与 UX 改善

#### 性能计时埋点

`tour.js` 每次请求记录四个时间戳，并在 Console 输出两行指标：

```
[perf] first token latency: 1240 ms
[perf] total stream duration: 8730 ms
```

| 指标 | 含义 | 慢的原因 |
|------|------|----------|
| `firstTokenLatency` | 发送 → 首个 chunk 到达 | **> 5000 ms**：后端慢（RAG 检索 / 向量化 / 模型预热） |
| `totalDuration` | 发送 → done 事件 | **很长但 firstToken 正常**：模型输出慢 / 后端 flush 节奏 |

**如何判断慢在前端还是后端**：
- `firstTokenLatency < 1000 ms`，`totalDuration` 很长 → 模型生成慢，前端无能为力
- `firstTokenLatency > 3000 ms` → 后端 RAG 检索或冷启动慢
- `firstTokenLatency` 正常，UI 更新有明显卡顿 → 前端 setData 过频，已用 80 ms 节流解决
- 网络超时（wx timeout） → 前端报 `AI 导览员响应超时`，见 Console 原始 errMsg

#### Chunk 刷新节流（80 ms）

后端每隔数十毫秒推送一个 chunk，若逐个 `setData` 会高频触发 JS→渲染器通信。
优化方案：chunk 先追加到实例变量 `_chunkBuffer`，每 80 ms 批量一次 `setData`。
`onDone` / `stopStream` / `onError` 时调用 `_forceFlush()` 立即同步剩余内容。

#### 渐进式加载提示

等待首个 chunk 期间按时间梯次更新提示文字，让用户感知后端正在工作：

| 时间 | 提示文案 |
|------|----------|
| 立即 | 正在连接 AI 导览员… |
| 3 s  | 正在检索半坡资料，请稍候… |
| 8 s  | 资料较多，AI 正在整理讲解… |

首个 chunk 到达后提示文字消失，显示流式气泡。

#### 停止生成

发送中或流式接收期间，输入栏右侧「发送」按钮替换为「停止」按钮（橙色方形图标）。
点击后：
1. 调用 `requestTask.abort()` 终止连接
2. 强制 flush 已缓冲内容
3. 将已生成部分提交为正式消息，结尾追加 `\n\n（已停止）`
4. 恢复可输入状态

#### 用户友好错误提示

| 原始错误特征 | 展示给用户 | Console 保留 |
|-------------|-----------|-------------|
| `timeout` / 超时 | AI 导览员响应超时，请稍后再试。 | 原始 err 对象 |
| HTTP 5xx | 服务器暂时繁忙，请稍后再试。 | 同上 |
| HTTP 4xx | 请求参数有误，请重试或刷新页面。 | 同上 |
| 其他 / 网络 | 连接 AI 导览员失败，请检查网络后重试。 | 同上 |

### Stage 7 — 游览事件记录与报告生成闭环

#### 游览事件上报

各页面通过 `tourStore.addTourEvent()` 将行为事件写入本地缓冲区（同步持久化到 `wx.storage`），由以下时机批量上传至 `POST /tour/sessions/:id/events`：

| 事件类型 | 触发时机 | 触发页面 |
|----------|----------|----------|
| `hall_enter` | 用户选择进入某展厅 | `pages/hall/hall.js` |
| `exhibit_question` | 用户在聊天页发送消息 | `pages/tour/tour.js` |
| `exhibit_view` | 用户离开展品详情页（含停留时长） | `pages/exhibit-detail/exhibit-detail.js` |
| `exhibit_deep_dive` | 用户点击"与 AI 深入探讨" | `pages/exhibit-detail/exhibit-detail.js` |

**Flush 时机**（事件上报到服务器）：
- `tour.js` 的 `goReport()`：导航到报告页前 flush，确保报告包含完整数据
- `tour.js` 的 `onUnload()`：页面离开时 fire-and-forget flush（best-effort）
- `report.js` 的 `onLoad()`：报告页进入时再次 flush（兜底）

**失败保护**：`drainPendingEvents()` 原子性取出事件并清空缓冲；若上传失败，`restorePendingEvents()` 将事件归还缓冲，下次 flush 时重试。

#### 报告生成流程

```
report 页面进入
  → flush pending events (POST /events)
  → POST /tour/sessions/:id/report   (触发 AI 生成)
  → 如返回包含 one_liner → 直接使用
  → 否则 GET /tour/sessions/:id/report  (获取生成结果)
  → _applyReport(data) 渲染真实字段
  → 任意步骤失败 → _applyFallback(true) 兜底本地演示数据 + Toast 提示
```

#### 报告展示字段

| 后端字段 | UI 展示位置 |
|---------|-----------|
| `one_liner` | 页面顶部金句引用卡片 |
| `identity_tags` | 橙色圆角标签行 |
| `total_duration_minutes` | 数据格 "时长" |
| `total_questions` | 数据格 "互动" |
| `total_exhibits_viewed` | 数据格 "展品" |
| `radar_scores` | 条形进度图（替代雷达图，无 canvas 依赖） |
| `highlights` | 亮点列表（◆ 符号行） |

#### 本地兜底逻辑

- 无 `sessionId`（未完成问卷）→ 静默展示演示数据，无 Toast
- API 失败 → 展示演示数据 + Toast「报告生成失败，已使用本地演示报告」+ 页面内小字提示

### Stage 8A — 问卷重构（意图卡片 + 时间预算）

将原 3 题 A/B/C 单选问卷重构为更直观的「意图卡片 + 时间预算」两步入场，同时接入了 assumption 字段和 style 偏好。

**意图卡片**（onboarding Step 1）：

| 卡片 | persona | assumption | depth |
|------|---------|-----------|-------|
| 穿越到六千年前 | B（半坡原住民） | B | standard |
| 跟着考古证据走 | A（考古队长） | C | deep |
| 提问，找新启发 | C（历史老师） | A | deep |
| 以陶器工匠视角看 | B（工匠前端注入） | B | standard |

**时间预算**（onboarding Step 2，可跳过）：`answerLength` + `overrideDepth` 写入 `tourStore.stylePrefs`。

**直接开始**（home 页）：跳过所有问卷，使用默认 persona B，仍会调用 `POST /tour/sessions` 获取真实 sessionId，不会触发「请先完成问卷」错误。

### Stage 9A — 展品数据接入 + Hall 映射 + Persona Prompt 系统

#### 9A.5 — 展品数据一致性修复

**Hall slug 映射（`api/index.js` `HALL_SLUG_NAMES`）**：

| 后端 slug | 前端展示名（与 hall.js 一致） |
|-----------|--------------------------|
| `pottery-spirit-hall` | 出土文物陈列区 |
| `site-archaeology-hall` | 半坡聚落复原区 |
| `civilization-spark-hall` | 专题文化展区 |

以上映射已修复旧版中 `settlement-area` / `culture-exhibition` 的错误 slug。

**展品别名机制（`api/index.js` `EXHIBIT_ALIASES`）**：

用户常用的口语化名称（如「人面鱼纹盆」）与后端 DB 实际名称（「人面网纹彩陶盆」）不一致。新增 `EXHIBIT_ALIASES` 映射表和 `resolveAliases(keyword)` 函数，在 `exhibit-scan` 客户端搜索时同步扩展为 canonical 名称，保证搜索命中。

`resolveAliases(keyword)` 采用双向子字符串匹配：用户关键词包含别名键 **或** 别名键包含用户关键词，均触发别名展开。

**exhibit-scan 重构**：
- 删除底部「输入完整展品名」重复入口，仅保留顶部搜索框
- `_enhancedSearch` 同时执行后端 API 搜索 + 客户端 `includes()` 过滤 + 别名扩展，三路结果去重合并后按 `importance` 倒序排列
- Mock fallback 展品名称已更新为 DB 实际名称

**`normalizeExhibit()`（`api/index.js`）**：为每个展品计算 `hallDisplay`（中文展厅名），exhibit-detail 和 exhibit-scan 展示标签时使用 `hallDisplay` 而非原始 slug。

#### 9A.6 — Persona Prompt 系统

**PERSONA_DEFS（`store/tour.js`）**：

| personaId | 展示名 | backend persona | promptPrefix 机制 |
|-----------|--------|----------------|-----------------|
| `default` | MuseAI 导览员 | B | 前端注入中立导览员设定 |
| `A` | 考古队长 | A | 后端 system prompt 全权处理 |
| `B` | 半坡原住民 | B | 后端 system prompt 全权处理 |
| `C` | 历史老师 | C | 后端 system prompt 全权处理 |
| `artisan` | 陶器工匠 | B | 前端注入工匠视角 prompt prefix |

`buildStyledPrompt(rawInput)` 在每条消息前同时拼接：
1. `PERSONA_DEFS[personaId].promptPrefix`（`artisan` / `default` 注入角色设定，A/B/C 为空字符串由后端处理）
2. `[风格约束]` 块（answerLength / depth / terminology）
3. 用户原始输入

**artisan persona 实现原理**：使用 backend persona B 的基础系统提示，在前端每条消息前注入工匠视角 prefix，无需后端改动即可实现第5种风格。

## 与后端 API 的关系

- 后端地址：`http://122.152.232.190:3000`
- API 前缀：`/api/v1`（见 `utils/request.js` BASE_URL）
- 健康检查：`GET http://122.152.232.190:3000/health`
- 流式导览对话：`POST /api/v1/tour/sessions/:id/chat/stream`（SSE）
- 非流式端点仍走 `utils/request.js`

## 微信开发者工具配置说明

### 关闭合法域名校验（开发阶段必须）

1. 微信开发者工具 → 详情（右上角）→ 本地设置
2. 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**

> 上线前需将后端迁移至 HTTPS，并在微信公众平台配置合法域名。

### 基础库版本要求

- `enableChunked` 最低：**2.20.0**
- `TextDecoder`（最优 UTF-8 解码）最低：**2.21.0**（降级方案自动启用）

## 支持的 SSE 事件类型

| `type` 字段 | 回调 | 用途 |
|-------------|------|------|
| `chunk` | `onChunk(content)` | AI 回复文字增量 |
| `rag_step` | `onEvent(event)` | RAG 管道步骤进度 |
| `thinking` | `onEvent(event)` | AI 思考状态 |
| `done` | `onDone(payload)` | 流结束，含完整内容/trace_id |
| `error` | `onError({ message })` | 服务端错误 |
| `: …` 心跳 | 忽略 | SSE 保活 |

## 注意事项

- `node_modules/` 和 `miniprogram_npm/` 已加入 `.gitignore`，不提交
- `_web_archive/` 为原 Vue Web 端存档，已在 `project.config.json` 中排除编译

---

## 开发历程

> 本节记录从零搭建到 Stage 9D 的完整开发过程，面向接手协作者。

### Stage 1 — 目录结构与工具层

**目标**：将原 Vue 3 + Vite Web 前端迁移为微信原生小程序骨架。

**完成内容**：
- 将 `src/`（Vue 组件 130+ 文件）归档到 `_web_archive/`，清理根目录至纯小程序结构
- 新建 `api/`、`store/`、`constants/`、`components/` 空目录占位
- 实现 `utils/request.js`：`wx.request` 封装，含 Bearer Token 注入、指数退避重试（最多 2 次）、统一 8 种 HTTP 错误码处理、401 自动清除 auth
- 实现 `utils/storage.js`：`wx.storage` 封装，统一管理 9 个 key 的读写，提供 `clearAuth()` / `clearTour()` 语义接口

**涉及文件**：`utils/request.js`（新建）、`utils/storage.js`（新建）

---

### Stage 2 — 状态层

**目标**：移植 Web 端 composables 为小程序 store 模块。

**完成内容**：
- `constants/index.js`：RAG 步骤配置（6 步）、Persona 标签、Tour 状态枚举、Storage Keys、报告雷达维度、风格偏好映射
- `store/auth.js`：认证状态管理（setAuth / clearAuth / getToken / isAdmin）
- `store/chat.js`：聊天状态机（IDLE → THINKING → STREAMING → DONE / ERROR）、RAG Step 管理、流式 buffer
- `store/tour.js`：导览会话生命周期、事件缓冲 + drainPendingEvents / restorePendingEvents 原子性、UI / style / TTS 三类偏好持久化、`buildStyledPrompt()`

**涉及文件**：`constants/index.js`、`store/auth.js`、`store/chat.js`、`store/tour.js`（均新建）

---

### Stage 3 — API 层

**目标**：将所有后端端点封装为 wx.request 调用，流式接口留 stub 待 Stage 6 接入。

**完成内容**：
- `api/index.js`：authApi / chatApi / tourApi / exhibitsApi / ttsApi / curatorApi 六个命名空间，覆盖所有端点
- 流式接口（`chatStream`、`guestMessage`）此阶段为 stub，调用时返回 rejected Promise 并打印 warning

**涉及文件**：`api/index.js`（新建）

---

### Stage 4 — 页面骨架

**目标**：建立完整的小程序页面骨架和导航流程，全程 mock 数据，可在微信开发者工具中完整预览。

**完成内容**：
- 9 个页面：`home`、`onboarding`、`persona-reveal`、`hall`、`tour`、`exhibit-scan`、`exhibit-detail`、`route`、`report`
- 4 个组件：`section-card`、`message-bubble`、`persona-card`、`exhibit-card`
- 完整导航链路：home → onboarding → persona-reveal → hall → tour → exhibit-scan/detail → route → report → home
- 更新 `app.json` 注册所有页面和组件
- 新建 `README.md`

**涉及文件**：56 个文件（9 页面 × 4 + 4 组件 × 4 + app.* + README）

---

### Stage 5 — 后端连接与游客会话接入

**目标**：将 onboarding 问卷结果真实传入后端，建立 tour session，页面间共享 sessionId。

**完成内容**：
- `api/index.js` 新增 `healthApi.check()`（`GET /health`）
- `onboarding.js`：问卷完成后调用 `POST /tour/sessions`，失败时 Toast + 继续（演示模式）
- `persona-reveal.js`：读取 tourStore，调用 `PATCH /tour/sessions/:id` (status=opening)
- `hall.js`：选择展厅时调用 `PATCH /tour/sessions/:id` (status=touring, current_hall=...)
- `tour.js`：顶栏新增「连接」按钮，调用 `healthApi.check()` 验证后端连通性
- 关闭微信开发者工具合法域名校验（开发阶段必须）

**涉及文件**：`api/index.js`、`onboarding.js`、`persona-reveal.js`、`hall.js`、`tour.js`、`tour.wxml`、`README.md`

---

### Stage 6 — SSE 流式对话接入

**目标**：接入真实 SSE 流式 AI 回复，实现逐字流式输出 + RAG 进度步骤展示。

**Stage 6 Batch 1 — SSE 底层**：
- 新建 `api/stream.js`（170 行）：`wx.request enableChunked + onChunkReceived` → ArrayBuffer UTF-8 解码 → `\n\n` 分块 → event/type 双字段兼容 → 回调分发（onChunk / onEvent / onDone / onError）
- `api/index.js` 的 `tourApi.chatStream` 由 stub 改为调用 `stream.js`

**Stage 6 Batch 2 — tour 页面接入**：
- `tour.js`：`sendMessage` 从 mock setTimeout 改为 `tourApi.chatStream`，处理 onChunk（追加 streamingContent）/ onEvent（ragSteps）/ onDone（提交消息）/ onError（Toast）
- `tour.wxml/wxss`：新增 RAG 进度条、流式气泡、typing cursor

**Stage 6 Batch 3 — 流式性能优化**：
- 80ms chunk 节流（避免高频 setData）
- 首 token 延迟计时（Console 输出 `[perf] first token latency`）
- 3s / 8s 渐进式加载提示文字
- 停止生成按钮（abort requestTask，已接收内容保留并追加「已停止」）

**Bugfix**：
- SSE 字段名修复：后端使用 `event` 字段，前端原来读 `event.type`，修复为 `event.event || event.type`，并注入 `type` 字段兼容下游
- chunk 内容路径修复：`event.content` → `event.data.content`
- `tts` 字段类型修复：后端 Pydantic v2 要求 `bool`，修复 payload 中 `tts: null` → `tts: false`

**涉及文件**：`api/stream.js`（新建）、`api/index.js`、`tour.js`、`tour.wxml`、`tour.wxss`

**当前状态**：✅ 完成，流式 AI 回复稳定运行

---

### Stage 7 — 游览事件记录与报告生成闭环

**目标**：4 类游览事件上报后端，报告页展示真实 AI 生成数据。

**完成内容**：
- `hall.js`：进入展厅时记录 `hall_enter` 事件
- `tour.js`：每条消息记录 `exhibit_question` 事件；新增 `_flushEvents(cb)`；`goReport` 先 flush 再跳转
- `exhibit-detail.js`：`onUnload` 记录 `exhibit_view`（含停留秒数）；`goDeeper` 记录 `exhibit_deep_dive`
- `report.js`：重构为 flush → `POST /report` → `GET /report` → `_applyReport()` 管道，任意步失败时 `_applyFallback()` 兜底
- `report.wxml/wxss`：loading 动画、one_liner 引用卡片、identity_tags 标签行、雷达维度条形图

**涉及文件**：`hall.js`、`tour.js`、`exhibit-detail.js`、`report.js`、`report.wxml`、`report.wxss`

**当前状态**：✅ 完成

---

### Stage 8A — 问卷重构与个性化接入

**目标**：将 3 题 A/B/C 抽象问卷改为直观的意图卡片 + 时间预算，接入 assumption / style 参数。

**完成内容**：
- `onboarding.js/wxml/wxss`：完全重写，Step 1（4 张意图卡片）+ Step 2（时间预算）两步状态机
- 卡片直接映射 `persona` / `assumption` / `depth`，消除问卷语言与用户感知之间的鸿沟
- `persona-reveal.js/wxml/wxss`：新增「AI 会这样陪你」气泡 + assumption 挑战预告
- Q3 style prefs 通过 `tourStore.setStylePrefs()` 存入 storage，`sendMessage` 时 `buildStyledPrompt` 读取

**涉及文件**：`onboarding.*`、`persona-reveal.*`

**当前状态**：✅ 完成

---

### Stage 8B — 路线页个性化

**目标**：路线页根据 persona 排列展厅顺序，追踪已访问状态，展示 SVG 平面示意图。

**完成内容**：
- `route.js`：读取 `tourStore.preferredHallOrder`，从 `pendingEvents` 推断 visitedHalls，`_buildSteps()` 生成带状态的展厅列表
- `route.wxml/wxss`：展厅序列步骤条 + 平面图 CSS 色块（3 个展厅各有主题色）+ 已访问动画

**涉及文件**：`route.js`、`route.wxml`、`route.wxss`、`route.json`

**当前状态**：✅ 完成

---

### Stage 8C — Q3 风格参数修复

**目标**：让 Q3 选择的 style prefs 真正传入后端。

**完成内容**：
- `tour.js` `sendMessage()` 中从 `tourStore.getStylePrefs()` 读取偏好，构造 `style` 字段传入 `chatStream`
- Bugfix：`answerLength` → `answer_length`（后端 Pydantic snake_case 要求）

**涉及文件**：`tour.js`

**当前状态**：✅ 完成

---

### Stage 8D — 后端 AI 延迟诊断

**目标**：为后端 RAG 流水线添加全链路 perf 埋点，定位首 token 延迟高达 1-2 分钟的瓶颈。

**完成内容**（后端改动，前端工作为配合测试）：
- `tour_chat_service.py`：每个阶段 `time.perf_counter()` 计时，结构化 `[perf]` 日志
- `agents.py`：每个 RAG 节点 try/finally 计时，`_perf()` 统一发日志
- 新增 `docs/ai_latency_diagnostics.md`：延迟分析手册

**当前状态**：✅ 完成（后端）

---

### Stage 8F — Markdown 渲染支持

**目标**：AI 回复支持 Markdown 格式渲染（标题/加粗/列表/行内代码）。

**完成内容**：
- 新建 `utils/markdown.js`：轻量解析器，输出 `blocks[]`（heading / paragraph / list 三种类型，每个 paragraph 含 `segments[]` 支持 bold + code 内联）
- `message-bubble.js`：添加 observers，content 变化时触发 `parseMarkdown()` → `blocks`
- `message-bubble.wxml/wxss`：按 blocks 渲染富文本，保留用户消息纯文本路径
- 流式期间使用独立的 `stream-bubble`（纯文本 pre-wrap），done 后提交为 `message-bubble` 触发解析

**涉及文件**：`utils/markdown.js`（新建）、`message-bubble.*`

**当前状态**：✅ 完成

---

### Stage 8G — 意图卡片、时间预算与推荐展厅

**目标**：onboarding 全面视觉升级，persona-reveal 展示推荐展厅，hall 页标注 AI 推荐展厅。

**完成内容**：
- `store/tour.js`：新增 `intentText` / `preferredHallOrder` / `timeBudget` 字段
- `onboarding.*`：2×2 卡片网格，时间预算步骤，底部固定 CTA
- `persona-reveal.*`：展示推荐展厅区块（`preferredHallOrder[0]`）
- `home.*`：新增「直接开始」按钮，跳过问卷直达 hall（仍调用 `POST /tour/sessions` 获取真实 sessionId）
- `hall.*`：读取 `preferredHallOrder`，第一个展厅标记 `isRecommended`，显示「AI 推荐首去」角标

**涉及文件**：`store/tour.js`、`onboarding.*`、`persona-reveal.*`、`home.*`、`hall.*`

**当前状态**：✅ 完成

---

### Stage 9A — 展品真实 API 接入

**目标**：将展品数据从 mock 替换为后端真实 API，修复 Hall slug 映射。

**完成内容**：
- `api/index.js` 新增 `normalizeExhibit()`（字段适配 + `hallDisplay` 中文化）、`exhibitsApi.search()`、`exhibitsApi.listByHall()`
- `exhibit-scan.*`：完全重写，真实 API 列表浏览 + 搜索 + 按当前展厅过滤
- `exhibit-detail.js`：从 `exhibitsApi.get(id)` 获取，fallback 链：id → name → mock

**涉及文件**：`api/index.js`、`exhibit-scan.*`、`exhibit-detail.js`、`exhibit-detail.wxml`

**当前状态**：✅ 完成

---

### Stage 9A.5 — Hall Slug 映射修复 + 展品别名

**目标**：修复前端 Hall slug 与后端数据库不一致，解决展品中文名称搜索失配。

**完成内容**：
- `api/index.js` 的 `HALL_SLUG_NAMES` 更新为正确的三个 slug（`pottery-spirit-hall` / `site-archaeology-hall` / `civilization-spark-hall`）
- 新增 `EXHIBIT_ALIASES` 别名表（如「人面鱼纹盆」→「人面网纹彩陶盆」）和 `resolveAliases()` 双向子字符串扩展
- `exhibit-scan.js`：`_enhancedSearch` 集成别名扩展，删除底部重复输入入口

**涉及文件**：`api/index.js`、`exhibit-scan.js`、`exhibit-scan.wxml`

**当前状态**：✅ 完成

---

### Stage 9A.6 — Persona Prompt 系统

**目标**：实现前端 5 种 persona（含不需要后端改动的 artisan），每条消息注入 persona prefix。

**完成内容**：
- `store/tour.js` 新增 `PERSONA_DEFS`（default / A / B / C / artisan），`_tour.personaId` 字段，`getPersonaDef()` / `getBackendPersona()`
- `buildStyledPrompt()` 更新：① persona prefix（artisan/default 前端注入，A/B/C 由后端处理）→ ② 风格约束块 → ③ 用户输入
- `home.js` `goQuickStart()` 改为真实调用 `POST /tour/sessions`，彻底消除「请先完成问卷」错误
- `onboarding.js` 新增 artisan 卡片（第 4 张）

**涉及文件**：`store/tour.js`、`home.js`、`onboarding.js`

**当前状态**：✅ 完成

---

### Stage 9B — Exhibit Context 展品上下文

**目标**：从展品详情页进入 tour 时，AI 回复自动聚焦当前讨论展品。

**完成内容**：
- `store/tour.js` 新增 `currentExhibit` 字段、`setCurrentExhibit()` / `clearCurrentExhibit()` / `getCurrentExhibit()`
- `buildStyledPrompt()` 注入 `[当前讨论展品]` 上下文块（展品名/展厅/时代/类别/简介）
- `exhibit-detail.js` `goDeeper()`：调用 `setCurrentExhibit()` 后跳转 tour，无 session 时自动创建
- `tour.js`：`data` 新增 `currentExhibit: null`，`onShow` 从 store 读取，新增 `clearExhibitContext()`
- `tour.wxml/wxss`：在 topbar 下方新增展品 Context Bar（`🏺 正在讨论：{name}`），点 × 可关闭

**涉及文件**：`store/tour.js`、`exhibit-detail.js`、`tour.js`、`tour.wxml`、`tour.wxss`

**当前状态**：✅ 完成（含未提交的工作区修改）

---

### Stage 9C — 当前展厅上下文注入修复

**目标**：修复 tour 聊天中 currentHall 未正确注入的问题，使 AI 在无具体展品时仍能聚焦当前展厅。

**完成内容**：
- Fix A：`tour.js onLoad` 将 `options.hall` 写入 `tourStore.updateTourState({ currentHall })`
- Fix B：`buildStyledPrompt()` 无具体展品时，改为注入 `[当前展厅上下文]`（用户正在参观的展厅名）而非无上下文

**涉及文件**：`tour.js`、`store/tour.js`

**当前状态**：✅ 完成（含未提交的工作区修改）

---

### Stage 9D — 主动导览体验增强（Guide Suggestions）

**目标**：MuseAI 不再只被动答题，在用户进入展厅或展品详情时主动推送引导建议卡片。

**完成内容**：
- `store/tour.js` 新增 `_HALL_SUGGEST_TEMPLATES`（3 展厅 × 5 persona 的模板库）和 `generateGuideSuggestions(opts)` 纯函数
- `tour.js` 新增 `guideSuggestions` / `showSuggestions` data 字段，`_loadSuggestions()` 两阶段生成（Phase 1：即时规则模板；Phase 2：异步 `exhibitsApi.listByHall()` 追加高重要度展品）
- `tour.js` 新增 `dismissSuggestions()` 和 `onSuggestionTap()` 处理 4 种 actionType
- `tour.wxml`：在 scroll-view 和 input-bar 之间插入横向滚动 Suggestions Bar（chip 列表 + × 关闭按钮）
- `tour.wxss`：Suggestions Bar 全套样式（`#FFF8F0` 暖米色背景 + `inline-flex` 横向滚动）

**Suggestion 数据结构**：

```js
{
  id: 'sg_1',
  type: 'hall_intro' | 'observation_task' | 'related_exhibit' | 'next_step',
  icon: '🔍',
  title: '分析器物形制',
  actionType: 'ask' | 'open_exhibit' | 'search_exhibit' | 'navigate_back',
  payload: { prompt?, exhibitId?, exhibitName?, keyword? }
}
```

**actionType 行为**：

| actionType | 行为 | 是否自动发送 AI |
|------------|------|----------------|
| `ask` | 填入输入框，等用户点发送 | 否 |
| `open_exhibit` | navigateTo exhibit-detail | 否 |
| `search_exhibit` | navigateTo exhibit-scan?keyword=... | 否 |
| `navigate_back` | navigateBack | 否 |

**设计约束**：无 LLM 调用、不阻塞 chatStream、不新增后端接口。

**涉及文件**：`store/tour.js`、`tour.js`、`tour.wxml`、`tour.wxss`

**当前状态**：✅ 完成（含未提交的工作区修改）

---

## 与基线版本差异

> 基线 commit：`9296d27ba6a67f71003a02691c3844ce4505b716`
>
> 对比范围：`9296d27..stage9`（含未提交的工作区修改）

### 改动规模

- **35 个文件修改**，`4181 行新增 / 470 行删除`
- 新建文件：`api/stream.js`、`utils/markdown.js`

### 主要变化摘要

#### 小程序重构（相对基线的起点）

基线 `9296d27` 对应 Vue 3 Web 端已归档、小程序骨架刚建立的状态（Stage 1-3 完成）。相对于这个基线，本项目完成了从骨架到完整产品的全部开发。

#### Session 系统

- 游客 tour session 通过 `POST /tour/sessions` 在 onboarding 完成时真实创建
- `home.js` 「直接开始」同样走真实 API（Stage 9A.6 修复了演示模式下的「请先完成问卷」错误）
- Session token 持久化到 wx.storage，跨页面共享

#### Persona 体系

- 从 3 种 persona（A/B/C）扩展为 5 种（增加 default 和 artisan）
- artisan 通过前端 prompt prefix 注入实现，无需后端改动
- `buildStyledPrompt()` 按 persona prefix → 风格约束 → 用户输入的固定顺序组装

#### Exhibit Context（展品上下文）

- `store/tour.js` 新增 `currentExhibit` 状态
- 从 exhibit-detail「与 AI 深入探讨」进入 tour 时自动携带展品信息
- `buildStyledPrompt()` 注入结构化展品上下文块

#### SSE 对话

- `api/stream.js` 实现完整 SSE 解析层（ArrayBuffer → UTF-8 → chunk→ event dispatch）
- 修复了后端 `event` 字段 vs 前端 `event.type` 的命名不匹配 bug
- 80ms chunk 节流 + 首 token 延迟计时 + 渐进式加载提示

#### RAG 步骤展示

- 6 个 RAG 节点（rewrite → retrieve → merge → rerank → filter → evaluate）实时进度更新
- `chatStore.setRagStep()` 驱动，仅在 thinking/streaming 期间显示

#### 游览事件与报告

- 4 类事件（hall_enter / exhibit_question / exhibit_view / exhibit_deep_dive）自动上报
- `drainPendingEvents()` 原子性 + `restorePendingEvents()` 失败回滚
- 报告页展示真实 AI 数据：one_liner / identity_tags / radar_scores / highlights

#### 展品扫描

- 从手动输入名称升级为真实 API 列表浏览 + 搜索
- 展品别名机制解决口语化名称与 DB 名称不一致问题
- Hall slug 映射修复（3 个正确 slug）

#### Guide Suggestions（Stage 9D）

- 进入展厅或深入探讨展品时，聊天框上方自动出现横向滚动的建议 chips
- Hall 模式：按展厅 + persona 从模板库选取 1-2 条建议，异步追加高重要度展品卡
- Exhibit 模式：固定 4 条（用途/观察/相关展品/返回）
- 可手动 × 关闭，不重复触发 LLM 调用

#### Stage 9 系列优化

| 子阶段 | 解决的问题 |
|--------|-----------|
| 9A | 展品数据从 mock 升级为真实 API |
| 9A.5 | Hall slug 错误、展品别名搜索失配 |
| 9A.6 | artisan persona、直接开始 session 问题 |
| 9B | 展品上下文注入，AI 能聚焦具体展品 |
| 9C | currentHall 未写入 store 导致展厅上下文缺失 |
| 9D | 主动导览 Guide Suggestions 建议栏 |
