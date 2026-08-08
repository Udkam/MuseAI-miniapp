# MuseAI 微信小程序前端

English version: [README_EN.md](./README_EN.md)

MuseAI 前端是面向西安半坡博物馆导览体验的微信小程序。当前交付目标是先让真机完整跑通“问卷 -> 身份 -> 路线 -> 展厅导览 -> 展品识别/搜索 -> 语音播放 -> 报告”的闭环，再进入正式上线流程。

## 当前阶段

当前处于 **上线准备与发布收口阶段**。

预想中的小程序功能已完成真机测试。当前工作重点不是继续扩展新功能，而是完成备案、真实数据、OCR 决策、API key 治理和正式发布前验收。详细执行手册见 [上线准备.md](../project_materials/docs/上线准备.md)。

HTTPS 状态需要拆开看：

- 已完成：`banpo-museai.xyz` ICP 备案已通过；`api.banpo-museai.xyz` DNS 解析、SSL 证书、Nginx 443 反代均已配置。
- 当前开发状态：小程序前端已切换为正式 HTTPS API：`https://api.banpo-museai.xyz/api/v1`；本地后端和旧公网 HTTP 调试入口仅作为注释中的临时 fallback。
- 已完成（微信侧）：微信公众平台 request 合法域名已配置，开发者工具关闭“不校验合法域名”豁免后已通过真机测试。

其余阻断项：

- 当前数据仍非最终馆方真实数据。
- OCR 服务尚未购买或配置；如不上线 OCR，应隐藏入口或保留文字搜索 fallback。
- Qwen LLM key 当前消耗免费额度或试用额度，上线前需确认额度、付费和限流。
- systemd 托管、日志轮转、PostgreSQL 备份尚未在服务器落地（方案见 `backend/deploy/`）。
- 体验版上传、测试成员分发和关闭合法域名豁免后的正式验收尚未完成。

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
- 数据驱动路线页：仅从 `/tour/halls` 获取当前 active 展厅，再按问卷人格、展厅偏好和时长做确定性排序；动态展厅名称不会被静态 canonical 列表覆盖，目录请求失败时不注入静态路线事实。
- 展厅选择页：按常开放展厅优先、临展厅靠后的顺序展示。
- 展厅导览页：
  - SSE 流式 AI 回答
  - 建议条只展示当前游客 session 的后端建议接口成功返回内容；请求前、空响应或失败时保持为空
  - Markdown 渲染
  - AI 回答纯文本复制
  - 手动 TTS 播放
- 展品识别/搜索：
  - 文字搜索展品
  - 拍照识别 MVP
  - OCR 不可用时回退到文字搜索
  - 匹配结果可跳转展品详情
  - 真实展品目录按每页 100 条串行加载完整集合；成功空目录保持为空，生产环境不展示静态 mock 展品
- 展品详情页：围绕展品继续与 AI 讨论。
- 游览报告页：
  - 到访展厅：按已浏览展厅统计；用户在展厅内发送过消息，或从搜展品进入该厅任意展品详情页，都会计入。
  - 问题统计：按用户发送消息次数统计，不对问题文本去重，并与首页继续上次游览的 AI 对话数保持一致。
  - 展品统计：点进展品详情页即计入展品浏览；同一展品重复查看只计一次。
  - 仅可信后端 UUID 计入展品统计；本地示例、mock 和 name-only 记录不冒充真实展品。
  - 认知变化
  - 记录摘要：离开展厅或打开报告前按展厅合并本地聊天记录，再与后端 `record_notes` 合并为可复盘笔记。
  - 基础统计
- 移动端适配：
  - safe-area 处理
  - 底部输入区键盘抬升处理
  - 不同屏幕尺寸的基础布局兼容

## 尚未完成或仍需发布验收

- 正式小程序备案、体验版上传和测试成员分发。
- 如后续改为上传文件或下载远程文件 URL，还需确认 uploadFile/downloadFile 合法域名；当前核心 request 链路已通过真机测试。
- OCR 服务购买、服务 ID 配置和真机拍照识别稳定性确认。
- 官方馆方展品图片、地图、点位和完整展厅数据接入；当前仍不是真实最终数据。
- API key 负责人、额度、付费、告警和轮换流程确认。
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
│   └── banpo-halls.js    # 9 个 canonical 展厅 slug、中文名和顺序
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

当前默认使用正式 HTTPS API：

```text
https://api.banpo-museai.xyz/api/v1
```

如果本机已启动后端，也可以临时切到：

```text
http://127.0.0.1:8000/api/v1
```

旧公网 HTTP 调试入口只作为紧急 fallback 或历史排查使用：

```text
http://122.152.232.190:3000/api/v1
```

HTTPS request 真机验证已通过；公网 HTTP 调试入口应在服务器侧关闭或限制访问。

正式域名在微信正式环境可用还必须同时满足：

- 域名备案通过。
- HTTPS 证书有效。
- 微信公众平台已配置 request 合法域名。
- 开发者工具关闭“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”后已完成真机 request 链路测试。

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

会计入“到访展厅”和“已浏览”标记的事件类型包括：

- `exhibit_question`：用户在展厅内发送消息。
- `exhibit_view`：用户点进任意展品详情页。
- `assistant_answer`：兼容已完成回答的历史事件；新统计以用户发送消息和展品查看为准。

因此用户只是进入展厅不会计入到访展厅；只要在该展厅发送过一条消息，或点进该厅任意展品详情页，就会给展厅加上“已浏览”标记。展厅数量按 canonical slug 去重。前端内部统一使用展厅信息导入的 9 个 canonical slug，展示时再转换为中文名。

问题统计按用户发送消息数计算，不对相同问题文本去重，并与“继续上次游览”显示的 AI 对话数保持一致。展品统计单独计算：用户点进展品详情页后记录 `exhibit_view`，报告中展示为“展品”，同一展品重复查看只计一次。

记录摘要的数据来源包括：

- 离开展厅时保存的本地展厅级摘要
- 打开报告时当前展厅的本地用户问题和 AI 回答
- 后端按展厅聚合的 `record_notes`
- 当前展厅和展品上下文

记录摘要只保留展厅级短笔记，避免把每个问题逐条堆叠，也避免把处理过程、兜底提示或无意义说明展示给用户。

## 常用测试

```bash
cd frontend
npm run test:markdown
npm run test:suggestions
npm run test:hall-chat
npm run test:report
npm run test:preflight
npm run test:all
node --check api/index.js
node --check api/stream.js
node --check store/tour.js
node --check pages/tour/tour.js
node --check pages/hall/hall.js
node --check pages/route/route.js
node --check pages/report/report.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/exhibit-detail/exhibit-detail.js
```

`test:preflight` 会检查小程序打包范围内是否残留非白名单开发地址、`localhost`、`:3000`、明显密钥形态，并对关键 JS 文件执行语法检查。当前正式测试应使用 `https://api.banpo-museai.xyz/api/v1`；如果临时切到 `http://122.152.232.190:3000/api/v1` 或 `http://127.0.0.1:8000/api/v1`，脚本会警告发布前必须切回 HTTPS。它不会读取或修改真实 `.env`。

## 真机测试重点

- iOS 输入框和键盘是否遮挡。
- Android 不同分辨率下底部操作区是否错位。
- 建议条是否串展厅或串展品。
- AI 回答是否能复制纯文本。
- TTS 播放、停止、切换、离页销毁是否正常。
- OCR 拍照取消后是否停止识别。
- 报告中的到访展厅、展品、问题、认知变化和记录摘要是否与实际事件一致，尤其要验证：只进入展厅不计入；发送消息会计入问题数和该展厅；点进展品详情页会计入展品数和该展厅；展厅和展品需要去重，问题数不去重。

## 上线前注意

- 测试号不能等价于正式小程序发布环境。
- 需要正式 AppID、开发者权限、体验版上传权限和测试成员。
- 若使用中国大陆服务器和自有域名，正式小程序通常需要完成备案并配置合法域名。
- 当前服务器资源口径为 2 核 / 8 GB RAM；前端真机测试时应关注流式回答、TTS 和报告页在弱网下的等待与重试体验。
- 当前前端已切到 `https://api.banpo-museai.xyz/api/v1`，且关闭开发者工具合法域名豁免后已通过真机测试；体验版上传前仍需做完整回归。
- 当前 Qwen LLM 调用消耗免费额度或试用额度，体验版前必须在服务商控制台确认额度、付费、限流和账单告警。
- 当前数据不是最终馆方真实数据；替换真实数据后必须重新验证展厅筛选、展品统计、OCR 搜索和报告摘要。
- 曾暴露过的 AppSecret、API key 必须重置。
- 发布前应补齐隐私政策、用户协议、相机权限说明和 AI 生成内容提示。
