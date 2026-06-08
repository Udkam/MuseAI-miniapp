# MuseAI 微信小程序前端

English version: [README_EN.md](./README_EN.md)

MuseAI 前端是面向西安半坡博物馆导览体验的微信小程序。当前交付目标是先让真机完整跑通“问卷 -> 身份 -> 路线 -> 展厅导览 -> 展品识别/搜索 -> 语音播放 -> 报告”的闭环，再进入正式上线流程。

## 当前阶段

当前处于 **Stage 13 上线前闭环验证与发布准备**。

代码层面的 MVP 已覆盖主要闭环，但正式发布还没有完成，主要阻断项包括：

- 小程序备案主体尚未最终确认。
- `api.banpo-museai.xyz` 已配置 DNS/SSL/Nginx，但未备案前无法稳定作为微信正式 request 合法域名使用。
- 当前开发/真机调试仍可能使用 `http://122.152.232.190:3000/api/v1`。
- OCR、TTS、键盘适配、报告统计仍需多机型真机复测。

## 已实现能力

- 首页入口：个性化导览、默认游客导览、继续上次导览。
- 继续上次导览触发规则：只有达到有效 AI 互动条件后才保留并展示。
- 三步问卷：追问方向、初始判断、导览节奏。
- 四类身份：
  - 考古研究员，对应后端 persona `A`
  - 研学记录员，对应后端 persona `B`
  - 历史追问者，对应后端 persona `C`
  - 器物研究员，对应后端 persona `D`
- 身份揭示页：展示当前导览视角和后续路线入口。
- AI 策展路线页：调用后端 `/curator/plan-tour`，失败时保持页面可用。
- 展厅选择页：按常开放展厅优先、临展厅靠后的顺序展示。
- 展厅导览页：
  - SSE 流式 AI 回答
  - 建议条
  - Markdown 渲染
  - AI 回答纯文本复制
  - 手动 TTS 播放
- 展品识别/搜索：
  - 文字搜索展品
  - 拍照识别 MVP
  - OCR 不可用时回退到文字搜索
  - 匹配结果可跳转展品详情
- 展品详情页：围绕展项继续与 AI 讨论。
- 游览报告页：
  - 到访展厅：合并后端 `halls_visited` 与本地事件，提问、AI 回答、展品浏览和深挖都会补齐展厅统计。
  - 认知变化
  - 记录摘要：合并本地聊天记录与后端 `record_notes`，从用户问题和 AI 回答中提炼可复盘笔记。
  - 基础统计
- 移动端适配：
  - safe-area 处理
  - 底部输入区键盘抬升处理
  - 不同屏幕尺寸的基础布局兼容

## 尚未完成或仍需复测

- 正式小程序备案、体验版上传和测试成员分发。
- 微信后台 request/uploadFile/downloadFile 合法域名配置。
- OCR 服务 ID 和真机拍照识别稳定性确认。
- TTS 声线、语速、生成耗时和真机播放稳定性复测。
- iOS 键盘高度、刘海屏、大字号模式和 Android 多分辨率复测。
- 官方馆方展品图片、地图、点位和完整展厅数据接入。
- 隐私政策、用户协议和相机/语音相关权限说明。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 运行环境 | 微信小程序原生框架 |
| UI | WXML / WXSS / TDesign Mini Program |
| 状态管理 | CommonJS store |
| 网络请求 | `utils/request.js` |
| 流式响应 | `api/stream.js` 基于 `wx.request enableChunked` |
| 本地缓存 | `utils/storage.js` |
| Markdown | `utils/markdown.js` |
| 测试 | Node 脚本 |

## 目录结构

```text
frontend/
├── app.js / app.json / app.wxss
├── api/
│   ├── index.js          # REST API 封装、TTS、OCR、展品与路线 API
│   └── stream.js         # SSE/分块响应解析
├── components/
│   ├── chat/
│   ├── common/
│   ├── exhibit/
│   └── persona/
├── constants/
│   └── banpo-halls.js    # 展厅 slug、中文名、顺序、别名
├── pages/
│   ├── home/
│   ├── onboarding/
│   ├── persona-reveal/
│   ├── route/
│   ├── hall/
│   ├── tour/
│   ├── exhibit-scan/
│   ├── exhibit-detail/
│   └── report/
├── store/
│   ├── tour.js
│   └── chat.js
├── utils/
└── scripts/
```

## 本地运行

```bash
cd frontend
npm install
```

然后用微信开发者工具打开 `frontend/`。

## API 地址配置

当前小程序请求地址分散在 3 个文件中，切换环境时必须同时检查：

| 文件 | 用途 |
| --- | --- |
| `utils/request.js` | 普通 REST 请求 |
| `api/stream.js` | SSE 流式导览请求 |
| `api/index.js` | 部分直连 API、TTS、OCR、展品/路线封装 |

开发调试可使用：

```text
http://122.152.232.190:3000/api/v1
```

正式上线应切换到：

```text
https://api.banpo-museai.xyz/api/v1
```

但正式域名必须同时满足：

- 域名备案通过。
- HTTPS 证书有效。
- 微信公众平台已配置 request/uploadFile/downloadFile 合法域名。
- 开发者工具关闭“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”后仍能正常请求。

## TTS 说明

当前 TTS 是手动播放 MVP：

- 只在 assistant 消息上显示播放按钮。
- 默认不自动播放，避免博物馆公共空间突然外放。
- 同一时间只播放一条语音。
- 离开 tour 页面时停止并销毁音频上下文。
- 当前默认声线为“冰糖”，前后端都应保持一致。

仍需真机确认：

- 声线是否符合预期。
- 语速是否自然。
- 生成是否超时。
- 长回答分段播放是否稳定。

## OCR 说明

当前拍照识别是小程序端 MVP：

- 用户点击拍照识别后调用相机。
- 获取图片后调用微信 OCR 能力或本地回退逻辑。
- OCR 文本会与现有 `/exhibits` 列表做 fuzzy matching。
- 未识别时回退到文字搜索。

需要配置和验证：

- 微信 OCR 服务 ID。
- 相机权限提示。
- 用户取消拍摄时不得继续识别。
- 真机拍摄展签、展品名、弱光环境的识别率。

## 报告统计说明

前端报告页优先使用后端返回的报告字段，同时会合并本地尚未完全同步的 tour events，减少页面切换、网络波动或历史缓存带来的统计漏记。

会计入“到访展厅”的事件类型包括：

- `hall_enter`
- `hall_leave`
- `exhibit_question`
- `assistant_answer`
- `exhibit_view`
- `exhibit_deep_dive`

因此用户在某个展厅至少提问一次，包括点击建议条发起提问，该展厅就应进入报告的到访展厅统计。前端内部统一使用 canonical slug，展示时再转换为中文名，并兼容历史中文名和旧 slug。

记录摘要的数据来源包括：

- 后端 `record_notes`
- 本地用户问题
- 本地 AI 回答
- 当前展厅和展品上下文

记录摘要只保留短笔记，避免把处理过程、兜底提示或无意义说明展示给用户。

## 常用测试

```bash
cd frontend
npm run test:markdown
npm run test:suggestions
npm run test:report
npm run test:all
node --check api/index.js
node --check api/stream.js
node --check store/tour.js
node --check pages/tour/tour.js
node --check pages/route/route.js
node --check pages/report/report.js
node --check pages/exhibit-scan/exhibit-scan.js
```

## 真机测试重点

- iOS 输入框和键盘是否遮挡。
- Android 不同分辨率下底部操作区是否错位。
- 建议条是否串展厅或串展品。
- AI 回答是否能复制纯文本。
- TTS 播放、停止、切换、离页销毁是否正常。
- OCR 拍照取消后是否停止识别。
- 报告中的到访展厅、认知变化、记录摘要是否与实际事件一致，尤其要验证“仅提问但没有显式 hall_enter”的展厅是否被计入。

## 上线前注意

- 测试号不能等价于正式小程序发布环境。
- 需要正式 AppID、开发者权限、体验版上传权限和测试成员。
- 若使用中国大陆服务器和自有域名，正式小程序通常需要完成备案并配置合法域名。
- 曾暴露过的 AppSecret、API key 必须重置。
- 发布前应补齐隐私政策、用户协议、相机权限说明和 AI 生成内容提示。
