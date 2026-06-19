# Codex 工作报告

## 2026-06-19 前端自测与 README 同步

### 自测结果

- `npm.cmd run test:all` 通过。
  - Markdown 解析测试通过。
  - 导览建议条测试通过，覆盖 45 个展厅/persona 组合。
  - 展厅历史对话测试通过。
  - 报告统计映射测试通过。
  - 微信发布 preflight 通过。
- 关键 JS 语法检查通过：
  - `node --check api/index.js`
  - `node --check api/stream.js`
  - `node --check utils/request.js`
  - `node --check pages/tour/tour.js`
  - `node --check pages/hall/hall.js`
  - `node --check pages/report/report.js`
  - `node --check pages/exhibit-detail/exhibit-detail.js`
  - `node --check store/tour.js`

### 文档更新

- `README.md` 和 `README_EN.md` 已同步当前报告统计口径：
  - 到访展厅和已浏览标记只由完成后的 `assistant_answer` 计入。
  - `exhibit_question` 只是发起请求，不直接计入问题数。
  - `exhibit_view` 只计入展品浏览统计。
  - 只进入展厅或只查看展品不会让展厅变成已浏览。
- 补齐测试命令，包含 `test:hall-chat`、`test:preflight` 以及本轮检查过的页面 JS。

### 注意事项

- 当前 preflight 提示 active API base 是备案期间 HTTP 调试入口 `http://122.152.232.190:3000/api/v1`。
- 正式上传前必须切回 `https://api.banpo-museai.xyz/api/v1`，并关闭微信开发者工具“不校验合法域名、TLS版本以及HTTPS证书”。
- 本轮未 commit、未 push、未修改真实 `.env`。

## 2026-06-19 AI 回答滚动补滚恢复

### 修改

- `pages/tour/tour.js`
  - 恢复旧的补滚思路：最终 AI 消息入列表后执行多段补滚，Markdown 渲染完成后再补滚。
  - 流式刷新间隔恢复为 80ms，并在内容刷新后继续触发底部滚动。
  - 保留本地 `_streamText` 累积，避免读到异步 `setData` 的旧内容。
- `pages/tour/tour.wxml`
  - 恢复 `scroll-into-view="{{scrollTarget}}"`。
  - 恢复 `msg-bottom-a` / `msg-bottom-b` 双锚点，依靠锚点切换强制滚动。

### 验证

- `node --check pages/tour/tour.js` 通过。
- `node --check components/chat/message-bubble/message-bubble.js` 通过。
- `npm.cmd run test:hall-chat` 通过。
- `npm.cmd run test:all` 通过。

## 2026-06-19 统计规则重对齐

### 修改

- `store/tour.js`
  - `exhibit_question` 和 `exhibit_view` 都会标记展厅为已浏览。
  - 本地恢复时，含用户消息的展厅聊天记录会回填已浏览展厅。
  - 展厅去重仍按 canonical slug。
- `pages/tour/tour.js`
  - AI 对话数改为用户发送消息时增加。
  - 会话恢复重试时不重复增加 AI 对话数。
- `scripts/test-hall-chat-history.js`
  - 测试已更新为：发送消息会标记展厅，查看展品会标记展厅，孤立旧徽标不会保留。

### 验证

- `node --check store/tour.js` 通过。
- `node --check pages/tour/tour.js` 通过。
- `npm.cmd run test:all` 通过。

## 2026-06-19 AI 回答流式渲染性能修复

### 问题

AI 回答在真机中变慢、显示不及时，偶发看起来加载不出来。

进一步排查发现：重新载入展厅历史对话后，最近对话会作为 `conversation_history` 发给后端。后端单条历史消息限制 1000 字，而前端历史缓存此前最多保存 1600 字，长回答恢复后可能导致请求体校验失败。

### 修复文件

- `pages/tour/tour.js`
- `store/chat.js`
- `scripts/test-hall-chat-history.js`

### 修复内容

- 流式文本刷新从约 80ms 降频到 160ms。
- 新增本地 `_streamText` 累积器，减少对 `setData` 状态回读的依赖。
- 流式期间滚动改为约 650ms 节流一次，避免每次 chunk flush 都追加滚动 `setData`。
- 保留首段到达和最终 Markdown 渲染完成后的滚动。
- `getRecentMessages()` 返回给请求层的历史对话每条压缩到 800 字以内，避免超过后端 `conversation_history.content` 的 1000 字限制。
- 增加历史对话压缩回归测试。
- 不修改 `api/stream.js`，不修改 SSE 协议。

### 验证

```bash
node --check pages/tour/tour.js
node --check api/stream.js
node --check store/chat.js
node --check store/tour.js
node --check components/chat/message-bubble/message-bubble.js
node --check scripts/test-hall-chat-history.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

结果：全部通过。`test:preflight` 仅提示备案期 HTTP 调试地址和 `urlCheck=false`。

## 2026-06-19 续游展厅名与本地统计口径修复

### 问题

- 首页“继续上次导览”使用 `currentHall` 展示展厅名，导致只进入过展厅、但没有完成任何 AI 问答时，也会显示展厅名。
- 本地测试仍有“暂未同步/本机记录”旧提示文案。

### 修复文件

- `store/tour.js`
- `pages/home/home.js`
- `pages/home/home.wxml`
- `scripts/test-hall-chat-history.js`
- `scripts/test-report-stats.js`

### 修复内容

- 新增 `getLastAnsweredHall()` / `getLastAnsweredHallDisplayName()`，只根据 `assistant_answer` 或本地已保存的用户-助手问答对推导最近有效展厅。
- 首页续游卡改用最近有效展厅名；没有完成过展厅问答时，不显示任何展厅名。
- 续游卡展厅名改为条件渲染，避免空白名称占位。
- 展厅历史对话测试补充“只进入展厅不应产生续游展厅名”的回归检查。
- 报告映射测试去掉“暂未同步/本机记录”旧文案。

### 验证

```bash
node --check store/tour.js
node --check pages/home/home.js
node --check pages/report/report.js
node --check scripts/test-hall-chat-history.js
node --check scripts/test-report-stats.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

结果：全部通过。

## 2026-06-19 AI 流式回答卡在加载态修复

### 问题

- 导览页发送问题后，`/chat/stream` 网络请求保持 200/Pending，但页面停在思考态，没有进入实时回答。
- 该问题发生在小程序前端流式消费链路，不能简单归因为后端不可达。

### 定位

- 通过公共开发 API 手动创建会话并调用 `/tour/sessions/:id/chat/stream`，接口可返回 `chunk` 与 `done`。
- 当前 diff 中 `tour.js` 会先把用户新问题写入 `chatStore`，随后又用 `getRecentMessages()` 生成 `conversation_history`，造成当前问题被重复发送。
- 对“这个展厅...”这类含上下文词的问题，重复 history 会让后端更容易走上下文改写/历史路径，增加首 token 前延迟。
- `stream.js` 的 SSE parser 对 CRLF 和 `data:` 无空格格式不够宽容，可能导致小程序运行时吞掉事件。

### 修改文件

- `pages/tour/tour.js`
- `api/stream.js`

### 修改内容

- `tour.js` 改为在写入用户消息前抓取“旧历史”，并且只在上下文追问时传递 `conversation_history`。
- `conversation_history` 不再包含当前刚发送的问题，当前问题只通过 `message` 字段发送。
- `stream.js` 的 `_parseBlock()` / `_flushBuffer()` 兼容 CRLF、裸 `data:` 与多行 data。

### 验证

```bash
node --check pages/tour/tour.js
node --check api/stream.js
node --check api/index.js
node --check components/chat/message-bubble/message-bubble.js
npm.cmd run test:all
```

结果：全部通过。额外用 Node VM 检查 SSE parser 可解析 CRLF + `data:` 无空格样本。
## 2026-06-20 报告统计前端事件与展品详情返回栈修复

### 修改文件

- `api/index.js`
- `pages/tour/tour.js`
- `pages/exhibit-detail/exhibit-detail.js`
- `store/tour.js`
- `scripts/test-hall-chat-history.js`

### 修改内容

- 每次用户发送 AI 问题时生成 `client_event_id`，本地 `exhibit_question` 与后端自动补记使用同一个 ID，避免报告问题数翻倍。
- `assistant_answer` 增加 `question_client_event_id`，仅用于报告摘要重建，不参与事件去重。
- 展品详情页加载出展品后立即记录一次 `exhibit_view`，本地/mock 展品使用 `exhibit_name` 供后端去重统计。
- “与 AI 进一步探讨”优先 `navigateBack` 回已有 `pages/tour/tour`，没有现有 tour 页时才 `redirectTo`，避免从 AI 对话左上角返回时嵌套回展品详情。
- 已浏览展厅本地判定改为仅由 `exhibit_question` 或 `exhibit_view` 触发，`assistant_answer` 不再单独触发。

### 验证

```bash
node --check pages/tour/tour.js
node --check api/index.js
node --check pages/exhibit-detail/exhibit-detail.js
node --check store/tour.js
node --check scripts/test-hall-chat-history.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

结果：全部通过。`test:preflight` 仍提示当前为本地 HTTP 调试配置和 `project.private.config.json` 的 `urlCheck=false`，发布前需要切回正式 HTTPS 与合法域名校验。
## 2026-06-20 报告统计与展品浏览记录二次修复

### 范围

- 处理报告页“2 次提问显示 4 个问题”和“进入展品详情页后展品统计仍为 0”的前端侧原因。
- 顺带修复继续上次游览在同毫秒多事件下可能取错最近展厅的问题。

### 修改

- `pages/exhibit-detail/exhibit-detail.js`：展品详情加载成功后立即记录一次 `exhibit_view`；只要有展厅上下文，即使当刻 `sessionId` 短暂不可用，也先进入 pending events，报告生成前统一上传。
- `store/tour.js`：本地事件排序在 `client_event_id` 毫秒时间戳后加入 `fallback / 1000`，避免同毫秒事件排序并列导致继续上次游览取错展厅。

### 验证

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/tour/tour.js
node --check store/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

结果：全部通过。`test:preflight` 仍提示当前是本地 HTTP 调试 API 与 `urlCheck=false`，属于发布前配置提醒。
## 2026-06-20 报告统计前端上传兼容补丁

### 问题

- 一次建议条提问仍显示为 2 个问题。
- 进入一个展品详情页后报告展品数仍为 0。

### 修复

- `pages/tour/tour.js`：流式回答成功后移除本地 pending 中对应的 `exhibit_question`，避免报告页上传时与后端 stream 自动记录的问题事件重复。
- `pages/exhibit-detail/exhibit-detail.js`：本地/mock/缓存展品不再让 `exhibit_id` 为空，而是生成稳定 `view-*` ID，使后端按 `exhibit_id` 统计时也能计入展品查看数。

### 验证

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/tour/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

结果：全部通过。`test:preflight` 仍只有本地 HTTP 调试 API 与 `urlCheck=false` 的发布前提醒。
## 2026-06-20 Report exhibit-count fix: local viewed-exhibit ledger

### Scope

- Fixed report exhibit statistics remaining at 0 after users opened exhibit detail pages.
- Kept the change frontend-local except for preserving existing event upload behavior. No SSE protocol, backend contract, DB schema, or real `.env` changes.

### Root Cause

- `visitedExhibitIds` existed in tour state but was not written, persisted, restored, or used by the report page.
- Report display trusted only `total_exhibits_viewed` from backend. Local/mock/cached exhibit views can fail to appear in that backend count while still being valid user activity.
- Synthetic `view-*` `exhibit_id` values are not safe backend exhibit ids, so they should not be sent as if they were real backend ids.

### Changes

- `utils/storage.js`: added `TOUR_VISITED_EXHIBITS`.
- `store/tour.js`: added deduped local exhibit-view ledger keyed by real id when available, otherwise `hall + exhibit_name`; persists/restores and clears it with new tour state.
- `pages/exhibit-detail/exhibit-detail.js`: sends real `exhibit_id` only for real backend exhibits; local/mock detail views are counted locally and still carry `metadata.exhibit_name`.
- `pages/report/report.js`: exhibit stat uses the larger value between backend count and local viewed-exhibit count.
- Tests updated to cover duplicate exhibit views, local no-id exhibit views, reload persistence, and report display fallback.

### Verification

```bash
node --check store/tour.js
node --check utils/storage.js
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/report/report.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

Result: all passed. `test:preflight` only emitted expected dev API / urlCheck warnings.

### Retest Notes

- Views made before this patch will not be counted retroactively. Open the exhibit detail pages again after recompiling.
- Expected: two unique detail pages count as 2 exhibits; reopening the same exhibit does not increment.
## 2026-06-20 Exhibit deep-dive navigation and per-hall discussion context

### Scope

- Fixed native back behavior after entering AI chat from an exhibit detail page.
- Added per-hall "currently discussing exhibit" state so different halls do not overwrite one another.

### Changes

- `utils/storage.js`: added `TOUR_HALL_EXHIBITS` and `TOUR_PENDING_TOUR_ENTRY`.
- `store/tour.js`: stores active exhibit context by canonical hall slug, restores it per hall, clears it per hall, and exposes one-shot pending tour-entry helpers.
- `pages/tour/tour.js`: fresh entry from hall restores the selected hall's exhibit context; clear button only clears the current hall.
- `pages/exhibit-detail/exhibit-detail.js`: deep-dive stores context under the exhibit hall and, when no tour page exists underneath, routes through hall selection before opening tour so native back returns to hall.
- `pages/hall/hall.js`: consumes pending tour entry and opens the requested hall tour once.
- `scripts/test-hall-chat-history.js`: covers per-hall context isolation and one-shot pending entry consumption.

### Verification

```bash
node --check store/tour.js
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/tour/tour.js
node --check pages/hall/hall.js
node --check utils/storage.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:report
npm.cmd run test:all
```

Result: all passed. Preflight warnings remain the expected temporary HTTP dev API / urlCheck release warnings.

### Retest Notes

- After tapping "与 AI 进一步探讨", tour should show "正在讨论：<exhibit>".
- Native top-left back from tour should land on hall selection.
- Re-entering the same hall should restore its exhibit context; another hall should keep its own context independently.
## 2026-06-20 Correct exhibit deep-dive entry path

### Scope

- Fixed the deep-dive flow after the prior version visibly returned to hall selection before entering tour.
- Desired behavior: tap "与 AI 进一步探讨" -> go directly to tour; top-left back from tour -> hall selection.

### Changes

- `pages/exhibit-detail/exhibit-detail.js`: direct `redirectTo` tour with `directFromDetail=1` when no existing tour page is under the detail page.
- `pages/tour/tour.js`: treats `directFromDetail=1` as a fresh hall entry while preserving the saved exhibit context.
- `pages/hall/hall.js`: removed pending tour auto-resume code.
- `pages/exhibit-scan/exhibit-scan.js`: consumes a one-shot skip-to-hall flag when user backs from the direct tour path.
- `store/tour.js` / `utils/storage.js`: renamed pending-tour mechanism to skip-to-hall-on-return and kept it one-shot.
- `scripts/test-hall-chat-history.js`: updated regression coverage for one-shot return cleanup.

### Verification

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/hall/hall.js
node --check pages/tour/tour.js
node --check store/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:report
npm.cmd run test:all
```

Result: all passed. Preflight still only warns about temporary HTTP dev API and `urlCheck=false`.

### Retest Notes

- If the stack already has tour below detail, deep-dive should return directly to that tour.
- If the stack is hall -> scan -> detail, deep-dive should open tour directly; backing from tour should land on hall selection via the one-shot return cleanup.
