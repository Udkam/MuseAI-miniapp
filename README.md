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
