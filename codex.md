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
