# MuseAI — 半坡遗址 AI 智慧导览小程序

微信原生小程序，为半坡博物馆打造的 AI 导览体验：个性化身份问卷、流式 AI 导览对话、展品识别与讲解、游览报告生成。

## 技术栈

| 层次 | 技术 |
|------|------|
| 运行环境 | 微信小程序（原生，无框架） |
| UI 组件库 | tdesign-miniprogram 1.15.x |
| 状态管理 | 模块化 store（store/auth.js / chat.js / tour.js） |
| 网络层 | wx.request 封装（utils/request.js，含重试与 Token 注入） |
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
│   ├── tour/          AI 导览聊天主界面（含后端连接测试按钮）
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
├── api/index.js       所有后端端点封装（含 healthApi）
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
| **Stage 5** | **✅ 当前** | **游客导览会话接入后端** |
| Stage 6 | 🔲 待开始 | SSE 流式对话（wx.request enableChunked） |

### Stage 5 实现内容

- **onboarding** 完成问卷后调用 `POST /api/v1/tour/sessions` 创建游客会话，保存 `session_id` 与 `session_token` 至 wx.storage
- **persona-reveal** 进入展厅时调用 `PATCH /tour/sessions/:id` 将状态更新为 `opening`
- **hall** 选择展厅时调用 `PATCH /tour/sessions/:id` 将状态更新为 `touring` 并记录当前展厅
- **tour** 页面顶栏新增「连接」按钮，调用 `GET /health` 测试后端连通性
- 所有接口失败时不白屏，本地跳转兜底保持 UI 可继续调试

## 与后端 API 的关系

- 后端地址：`http://122.152.232.190:3000`
- API 前缀：`/api/v1`（见 `utils/request.js` BASE_URL）
- 健康检查：`GET http://122.152.232.190:3000/health`（不走 /api/v1 前缀）
- Stage 5 依赖后端服务在线；如后端不可达，页面会弹 Toast 提示并继续演示模式
- 流式端点（`askStream`、`guestMessage`、`chatStream`）目前返回 `streaming_not_implemented`，待 Stage 6 实现

## 微信开发者工具配置说明

### 关闭合法域名校验（开发阶段必须）

后端使用 HTTP（非 HTTPS），微信小程序默认只允许 HTTPS 合法域名。开发阶段操作：

1. 微信开发者工具 → 详情（右上角）→ 本地设置
2. 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**

> 上线前需将后端迁移至 HTTPS，并在微信公众平台配置合法域名。

### 基础库版本要求

- 最低支持版本：2.20.0（`enableChunked` SSE 依赖此版本）
- 建议开发时选用最新稳定版基础库

## 注意事项

- `node_modules/` 和 `miniprogram_npm/` 已加入 `.gitignore`，不提交
- `_web_archive/` 为原 Vue Web 端存档，已在 `project.config.json` 中排除编译
