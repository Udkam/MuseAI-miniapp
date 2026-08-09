# Codex 工作报告

## 2026-08-09 建议条、展品图片、报告指导与界面文案优化

- 首页“继续上次导览”严格检查同一可恢复导览的完整问答；内容为或结束于“（已停止）”的 assistant 消息不再构成完整问答，并删除不可达的“继续填写问卷”显示分支。
- 建议条保持后端 session 建议为唯一生产来源；前端只接受 8–18 字、以问号结尾、生产目标不超过 16 字的具体游客口语问句，完整显示且不截断，并过滤测试/维护、模糊通用及学术措辞；过滤后为空时隐藏。
- 展品规范化新增 `image_url`：绝对 HTTPS 地址直接使用，根相对公开路径拼接 API origin，其他协议拒绝；展品列表、识别结果和详情页在缺图或加载失败时回退 `/assets/icons/exhibit-list-item.png`。
- 报告页移除“已到访展厅”明细/数量和页头“x 次问答”，指导区缩减为固定标题“下一步怎么看”与 `exploration_guidance.next_step` 单条短建议；删除编号、长摘要、行动列表、直接追问框和复制逻辑，旧报告从 actions/统计生成一条兼容建议。
- 首页 hero/footer、居中排版和原配色保持基线；“定制导览”改为低圆角深棕主入口，“直接参观”改为无重边框的轻量次入口，两者仅保留中文标签、细箭头和 pressed 态，已删除被否定的票券、拱门与门槛装饰，样式完全收口在 `home.wxss`。
- 展厅卡片固定 `154rpx` 并保持连续列表，使用无描边弱背景 `76rpx` 图标区、`32rpx/700` 标题和 `24rpx/34rpx` 单行短简介，标题与简介内部间距增至 `12rpx`，“已访问”移到独立尾栏；`short_description/card_description` 原样显示，缺失时使用固定中性兜底，不再压缩完整简介。欢迎语无论短简介含几句都严格输出两句。
- 九厅与历史追问者新增统一 `128×128` SVG：九厅只用深棕/陶土双色的大轮廓、粗线或大色块表达陶罐、带单个居中矩形门的房屋、窑火、侧刃绑柄石斧、少女侧影、书本、牡丹和可区分临展框；历史追问者最终使用蓝底白色粗线打开书页与大问号，移除容易误认成刷新的环形箭头。10 个 PNG 回退资源由对应 SVG 同步渲染，加载失败时不再退回旧图案。
- 展厅页返回时安全重拉目录，缓存签名覆盖短简介、完整简介、展品计数、active 与图标字段，临展增删展品及简介更新能够触发重绘。
- 建议条错峰部署契约补充回归：旧后端长建议会被前端全部过滤并隐藏，新后端 8–18 字问句正常显示；不为消除过渡空态放宽问号、模糊、维护或学术化内容过滤。
- 路线页改为无卡片“展厅列表”页头，移除目录 badge、总时长/人格统计、重复标题和“重点关注”行；仅当临展厅明确返回 `exhibit_count=0` 时隐藏，缺计数字段与永久厅零计数均保留，并把计数写入可恢复 route step。身份揭示页同步改为“查看展厅列表”，不再暗示人格会重排路线。
- 文档同步：首页恢复条件、图片 URL 与默认图契约、报告新字段、建议条最终过滤、UI 规范，以及本地微信开发者工具和部署前验证步骤。
- 验证：`npm.cmd run test:all` 的 16 组检查全部通过；覆盖首页仅两处入口文案差异、原配色/初版简化版式、临展计数三种兼容情况、建议长度/术语/无省略号边界；发布预检检查 64 个包文件，正式 API 为 `https://api.banpo-museai.xyz/api/v1`。微信开发者工具运行时渲染和真机布局仍待后续验收。
- 运行代码最终提交 `99307705ace8ec66c0bcde80420067ac27b89ad5` 已推送到唯一 `main`；配套后端已部署并通过公网展厅问题、模糊追问、选中 A 后询问 B、A/B 比较、报告排除澄清、会话恢复及 SSE/独立 TTS 探针。
- 部署完成后再次执行 `npm run test:all`，16 组检查全部通过，发布预检仍检查 64 个小程序包文件且 API 基址为 `https://api.banpo-museai.xyz/api/v1`。本轮未代替用户执行微信开发者工具渲染和实体设备验收。

## 2026-08-08 报告返回与首页恢复竞态修复

- 报告页“返回首页”改为纯导航，不再隐式清空游客 session、问卷人格、路线、历史消息或待上传事件；同一导览可从首页继续，并在再次打开报告时使用后端更新后的总时长。
- 首页恢复旧 session 的 GET 现在绑定请求代次、`localTourId`、源 `sessionId` 与 `sessionToken`；源凭据被并发替换或新导览启动后，迟到响应不能再合并旧状态或触发跳转。
- 已有 session 的“继续上次导览”也改为先按点击时本地快照跳页、再后台 GET/403 恢复；异步结果只安全合并或重建会话，不会再次导航。
- 恢复流程分别持有请求锁和 `wx.navigateTo` 完成锁：GET 先结束或导航先完成时，重复点击都不会再发 GET 或重复跳页；导航失败会使旧 owner 失效并允许重试。
- GET 可选择跳过请求层活动时间副作用，或用预期 `sessionId + sessionToken` 限定更新归属；首页只在源 owner 仍有效且响应成功后显式更新时间，旧 GET 不会覆盖新 session 的活跃时间或过期时间。
- 快速开始和进入新问卷流程会先使正在等待的旧恢复请求失效。新增回归覆盖真实 `tourApi/request/wx.request` 链路、两种 GET/导航完成顺序、旧响应不污染新 expiry、有效响应更新时间、迟到响应不二跳，以及报告返回首页保留完整导览状态。
- 已打开的导览页以进入时的展厅 slug 和 `localTourId` 作为页面 owner：后台 GET 即使恢复出另一个服务端当前厅，也不会让页面的发送、建议、事件、历史保存或记录摘要串到其他厅；页面会重新同步其可见展厅而不二次导航。
- 首页在合法恢复完成后通知当前导览页；同厅新增历史以及不同厅响应中携带的当前页展厅历史会直接刷新到仍未发生本地对话变化的页面，其他展厅历史继续独立保存。
- PATCH 与 409 冲突后的 GET 均携带预期 session 凭据并跳过请求层活动时间副作用；只有 `sessionId`、token、`localTourId` 全部仍属于原同步 owner 时，才更新时间、`serverStateVersion` 或清理/改写待同步快照。
- 新增真实请求封装回归：旧 PATCH 和冲突 GET 在 session/本地导览切换后晚到，不能污染新导览的活动时间、过期时间、版本或待同步内容，也不能继续发起旧 owner 的重试 PATCH。
- 跨仓提示词契约测试改为验证数据库 `hall_context` 注入、旧 `HALL_DESCRIPTIONS` 不存在以及临展防编造规则保留，不再要求后端硬编码九厅名称或简介。
- 删除导览页旧九厅欢迎语开关与文案表，欢迎语只使用当前馆方展厅名生成通用引导；删除本地展厅建议开关及整套模板，展厅模式建议仅接收后端结果；API 展厅正反向兼容映射只从共享展厅目录加载，不再先定义一份随即被覆盖的九厅映射。
- 发布预检新增死配置缺失断言和 API 单一映射来源断言；建议条测试改用动态导入展厅标识覆盖 default/A/B/C/D 人格，不再把旧九厅清单当作生产契约。
- 路线页统一为“开放展厅目录”：始终保留 `/tour/halls` 的 active 目录顺序和全部展厅，人格、`preferredHallOrder` 与参观时长不再参与排序或截断；缺失或为 0 的时长显示“时长待确认”，真实地图与动线接入前不生成策展路线。
- 本次路线目录收尾验证通过：相关 JavaScript `node --check`，以及 `npm.cmd run test:all` 的 15 组检查；其中发布预检共检查 64 个包文件，正式 API 仍为 `https://api.banpo-museai.xyz/api/v1`。
- 导览下一轮聊天会从当前展厅独立历史桶读取最近 30 条发送给后端，每条内容最多 1000 字符；前端不提前丢弃较早的 20 条，由后端保留最近 10 条原文并对更早 20 条做提取式压缩，且不会混入其他展厅上下文。
- 扩展回归覆盖：A/B 展厅各自恢复最后 30 条、切回 A 后内容不混入 B、游客 session/token 失效重建后两厅各 30 条完整回传，以及下一轮聊天只携带当前厅最近 30 条且每条不超过 1000 字符。
- 验证：相关 JS 语法检查通过；`test:page-first`、`test:report`、`test:hall-chat`、`test:tour-sync`、`test:tour-chat-recovery` 通过；`npm.cmd run test:all` 15 组全部通过，微信发布预检检查 64 个包文件且正式 API 保持 `https://api.banpo-museai.xyz/api/v1`。
- 微信开发者工具已打开正确的 `frontend` 项目，但当前账号未登录且模拟器终止；CLI 因 IDE 端口初始化超时未完成编译验收，需扫码登录后补测。真机验收仍待后续执行。

## 2026-07-16 前端多轮模拟验证与会话恢复加固

- 使用 `npm.cmd ci` 做干净依赖安装；`package-lock.json` 安装前后 SHA-256 一致，npm 审计为 0 个漏洞。
- 连续两轮执行 `npm.cmd run test:all`，15 组测试全部通过；发布预检检查 64 个包文件，正式 API 保持 `https://api.banpo-museai.xyz/api/v1`。
- 对仓库内 47 个 JavaScript 文件执行 `node --check`，全部通过。
- 修复 page-first 建会竞态：每次新导览分配内部 `localTourId`；旧导览迟到的 `createSession` 响应不再覆盖新问卷人格或新 session。
- 修复旧 PATCH 响应竞态：状态同步绑定本地导览代次和目标 session；同一导览被其他请求恢复后继续向新 session 同步，不同导览的迟到响应不能写入新状态版本。
- 游客 session 必须同时具备 `sessionId` 和 `sessionToken` 才能直接复用；新鲜缓存只丢 token 时仅分离旧凭据，问卷、人格、页面、展厅、事件和每厅历史保持完整。首页仍显示“继续导览”，点击后先跳转再建立新游客 session 并回传完整快照。
- 区分真正过期与凭据丢失：超过有效期的旧游览会重置完整内存状态，避免“幽灵问卷草稿”；仅凭据不可用不再误删本地导览。
- GET/PATCH 遇到 401/403/404/410 时保留本地完整快照，自动重建游客 session 并有限重试。
- 新建或替换 session 时不再把 POST 返回的 `onboarding`、空展厅、空到访列表等数据库初始值当成恢复结果；客户端只吸收新凭据、`state_version` 和活动时间，本地完整快照保持权威并随后 PATCH。替换凭据时 AI 对话计数也不再归零。
- 导览流恢复绑定失败 session 和 `localTourId`：迟到的 A-session 403 不会删除同一导览已由并发请求恢复的 B-session，也不会跨新导览代次恢复。每条用户消息最多自动恢复并重发一次，连续第二次 403 转为可见错误，不再形成 create/resend 循环。
- SSE 完成后本地待上传队列同时保留稳定 ID 的 `exhibit_question` 与 `assistant_answer`；聊天服务已成功落库时后端幂等跳过，best-effort 落库失败时事件批量可以补齐两侧。自动恢复重发复用原问题 ID，且不会在本地复制问题事件。
- 修复 SSE HTTP 200 在没有 `done/error` 终止事件时永久停留在 thinking/streaming；现在返回 `STREAM_INCOMPLETE`。同时兼容 success-body-only、空 chunk 后完整 success body，以及 chunk 正文 + success 终态的混合交付，并过滤完整 body 重放造成的重复正文。
- 报告生成改为先确保 session、同步完整状态，再读取最新 session 凭据上传事件和生成报告；恢复期间不再继续使用旧 token。加载阶段可显示本地时钟占位，成功后严格使用后端 `total_duration_minutes`，再次打开时随后端新值增长。
- SSE `done.state_version` 会单调更新本地 OCC 版本，不接受迟到终态降级；`assistant_answer` 使用由问题事件 ID 派生的稳定 `client_event_id`，便于后端幂等配对。
- 生产欢迎语使用 `/tour/halls` 返回的动态馆方名称，不再让已知 slug 的客户端文案覆盖更名；展品的 `hall` 始终保留机器 slug，展示名称按响应 `hall_name`、动态展厅目录、规范 fallback 的顺序解析，绝不把 `hall_name` 当 slug。
- 建议条为横向滚动布局，前端上限由 4 条对齐后端权威接口的 6 条；不再静默丢弃第 5、6 条馆方建议。
- 回答气泡的手动 TTS 保持独立于聊天 SSE：只调用 `/tts/synthesize` 合成完整回答；`format=wav` 的 base64 在写文件前校验至少 44 字节、`RIFF....WAVE`、RIFF 声明范围、chunk 越界与奇数字节 padding，并要求 `fmt ` 至少 16 字节且 `data` 非空。无效响应以 `INVALID_WAV_AUDIO` 失败且不产生本地坏文件。
- 重构 `InnerAudioContext` 生命周期：所有回调先于 `src/play` 注册，界面只在真实 `onPlay` 后显示播放中；首次 `play()` 静默时允许 `canplay` 补一次，总尝试不超过 2 次。`src` 设置期间同步触发的 `canplay` 先暂存、直接尝试后再消费，避免嵌套调用和丢失补试；5 秒无任何播放回调则退出 loading 并记录结构化 `stage/errCode/errMsg`。
- 播放回调绑定请求代次、队列、分段序号和 context 身份，销毁时先解除当前 context；旧 context 的迟到 `onPlay/onError/onEnded/onStop` 不会污染新播放，正常 `onEnded` 仍连续推进分段队列。支持时设置 `obeyMuteSwitch=false`。
- 新增模拟覆盖：新旧人格建会交错、真实完整 session-create 默认响应、续游 GET 错 token、PATCH 自动恢复、旧流 403 与并发恢复、连续 403 有限重试、问题/回答待上传事件对、同一/不同导览迟到响应、缺失 token 的首页恢复与完整状态迁移、过期草稿、逐字节 CRLF+UTF-8 SSE、无终止事件、success-body-only/混合/空 chunk SSE、动态展厅与展品名称、报告使用恢复后的 session 和后端权威时长。
- 新增 TTS 模拟覆盖：真实最小 PCM WAV、奇数字节 padding、缺失 `fmt `、空 `data`、RIFF/chunk 越界、无效音频零写入、回调注册顺序、同步/异步 canplay 补试、完全静默 watchdog、onPlay/onError 状态切换、旧 context 回调隔离和多段队列连续播放。
- 未执行微信真机测试、相机/OCR、系统键盘和真机渲染检查；这些仍需后续在微信开发者工具和实体设备上验收。

## 2026-07-15 数据驱动小程序框架

- 建立 `codex/data-driven-miniapp-framework` 实施分支。
- 确认纯游客会话、问卷人格、Excel/CSV 数据入口、动态报告总时长和每展厅最近 30 条历史恢复约束。
- 协作边界、设计和当前任务记录在本地忽略的 `AGENTS.md`、`docs/DESIGN.md`、`docs/CURRENT_TASK.md` 中。
- 实现纯游客、无普通用户登录的小程序会话框架；`default` 为独立默认人格，完成问卷时才使用 A/B/C/D。
- 每次启动幂等清理旧版本遗留的 `auth_token`、`user`、`user_role`，即使缓存结构已是 v5 也会实际删除；不恢复登录态或 `Authorization`。
- 实现页面先跳转、后台去重建立访客会话，失败时保留可重试的完整快照；增加 OCC 状态版本处理、SSE UTF-8 跨分片解码和服务端活动时间恢复。
- 实现问卷、人格、路线、当前页面、展厅、展品、扫码和偏好的全状态恢复；每展厅会话仅保留最近 30 条，最多恢复 9 个展厅。
- 展厅列表和开放展厅目录使用 `/tour/halls` 结构化数据及后端顺序；成功返回空目录时不虚构开放展厅，请求失败时目录显示不可用。
- 小程序不再调用 `/curator/plan-tour`：线上页面只展示 `/tour/halls` active 展厅目录；人格、`preferredHallOrder` 和时长不改变目录顺序或数量，动态未知 slug 与馆方中文名不会被 canonical 展厅覆盖。页面先显示可恢复的 `hall-directory-v2` 快照，目录成功后再用最新 active 数据刷新。
- 权威展厅目录的 `highlights`、`focus`、说明和有效时长只使用服务端字段，服务端空值保持为空；缺失或 0 时长显示待确认，生产目录请求失败时显示不可用，不把静态内容伪装成馆方路线事实。
- 导览建议条切换上下文时先清空；页面先到、session 后到时会复用统一建会 in-flight，并在成功后继续请求 `/suggestions`。只渲染接口成功返回内容，空响应、建会失败或建议请求失败均保持为空，后续 onShow 或建会成功可重试；不再预显示或保留客户端展厅模板，也不再用展品列表降级补偿。静态展厅建议模板受 `ENABLE_DEV_HALL_SUGGESTIONS=false` 约束。
- 展厅和展品接口成功返回合法空数组时保持空状态，不再回填静态条目。展品目录依据 `total/skip/limit` 每页 100 条串行加载，设置 20 页/2000 条安全上限；只有完整成功后才供展示、搜索和拍照候选使用，中途失败不保留部分真实数据。
- 生产环境以显式 `ENABLE_DEV_MOCK_EXHIBITS=false` 关闭静态假展品；真实 UUID 详情请求失败时只使用同 UUID 的可信缓存，否则显示资料不可用，不再按同名降级为 mock 介绍。客户端名称黑名单已删除，馆方合法同名展品可正常展示。
- 报告本地补偿仅统计可信后端 UUID，`local-*`、`mock-*` 和 name-only 记录不计入真实展品数。游览事件统一按每批最多 50 条顺序上传，失败仅恢复当前未确认批次及后续事件，全部批次成功后才生成报告。
- 动态展厅的 `current_hall_name` 跟随会话完整恢复；报告页并行读取 `/tour/halls` 建立 slug 到馆方名称的映射，新导入展厅不再显示内部 slug。
- 聊天请求不再发送客户端组装的 system-like 上下文、问卷文本或展品自由文本；报告时长从进入展厅选择页开始持续累计，重新打开报告时会增长。
- 本地、模拟或超过 36 字符的展品 ID 仅保留在展示对象中，不写入 `current_exhibit_id`，不进入游览事件、会话上下文或 SSE 聊天请求。
- 验证：`npm run test:all` 全部通过，共 13 组测试；微信发布 preflight 检查 63 个包文件通过。`git diff --check` 退出码为 0，仅输出 LF/CRLF 行尾转换提示。
- 提交 SHA：见本提交。推送分支：`codex/data-driven-miniapp-framework`。

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

## 2026-06-20 Multi-agent protocol and deep-dive navigation follow-up

### Session

- Session ID: `museai-20260620-0650-deep-dive-navigation`
- Main agent: `main-codex`
- Explorer agent: `019ee210-c2d2-7a63-a759-6410fdcb04e0`
- Work time: 2026-06-20 06:50-07:03 +08:00

### Changes

- `pages/exhibit-detail/exhibit-detail.js`
  - Added robust hall resolution for exhibit details.
  - Falls back from `exhibit.hall` to current/saved hall when the exhibit payload does not carry a canonical slug.
  - Updates `currentHall` and saves the exhibit discussion context before entering tour.
- `pages/exhibit-scan/exhibit-scan.js`
  - Delays one-shot return-to-hall cleanup slightly so WeChat page lifecycle has settled.
  - Adds a redirect fallback if native stack cleanup fails.

### Verification

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/tour/tour.js
node --check store/tour.js
node --check utils/storage.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:report
npm.cmd run test:all
```

Result: all passed. Preflight warnings are limited to the current temporary HTTP dev API and `urlCheck=false`.

### Retest Notes

- From tour -> exhibit search -> detail -> deep discussion, the tour page should show the exhibit discussion context and suggestions.
- Native top-left back from that tour should end on hall selection, not exhibit detail or exhibit search.

## 2026-06-20 Deep-dive navigation corrective patch

### Time

- Work time: 2026-06-20 07:04-07:18 +08:00
- Session ID: `museai-20260620-0650-deep-dive-navigation`

### Root Cause

- Previous route detection only checked `page.route`; the real page stack can expose route as `__route__`.
- If the old tour page is not detected, the app opens a new tour above exhibit search, which keeps the wrong native back target.
- Direct tour entry also needed a pending exhibit fallback to guarantee the context bar and suggestions have exhibit data.

### Changes

- `pages/exhibit-detail/exhibit-detail.js`: check `route || __route__`, normalize the context exhibit with canonical hall, and save pending detail exhibit before navigation.
- `pages/exhibit-scan/exhibit-scan.js`: check `route || __route__` while finding hall page for one-shot cleanup.
- `pages/tour/tour.js`: consume pending detail exhibit for `directFromDetail=1` before hall context restoration.

### Verification

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/tour/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:report
npm.cmd run test:all
```

Result: all passed. Preflight warnings are unchanged release-configuration warnings.

## 2026-06-23 Restore HTTPS changes after rebase skip

### Time

- Work time: 2026-06-23 19:10 +08:00
- Session ID: `museai-20260623-1910-frontend-rebase-restore`

### Context

- User ran `git pull --rebase origin main`.
- Rebase conflicted because upstream deleted `project.private.config.json` while local commit `50aee26` modified it.
- After resolving by accepting the upstream deletion, the rebase finished at `9621522`, but local HTTPS changes from `50aee26` were no longer present in branch history.

### Actions

- Verified `50aee26 ICP备案已过，网址替换` still exists in `git reflog`.
- Restored only commit-relevant source/docs files from `50aee26`:
  - `README.md`
  - `README_EN.md`
  - `api/index.js`
  - `api/stream.js`
  - `utils/request.js`
- Did not restore `project.private.config.json`, because upstream deleted it and it should remain a local WeChat DevTools private config.

### Verification

```powershell
rg -n "^\s*(const|var) BASE_URL\s*=|api\.banpo-museai\.xyz|122\.152\.232\.190|备案中|仍在备案|waiting for filing" utils\request.js api\stream.js api\index.js README.md README_EN.md
node --check utils/request.js
node --check api/stream.js
node --check api/index.js
npm.cmd run test:preflight
npm.cmd run test:all
git diff --cached --stat
```

Result: active REST/SSE `BASE_URL` is again `https://api.banpo-museai.xyz/api/v1`; syntax checks, preflight, and `test:all` passed. Restored changes are staged in the frontend repo, excluding `project.private.config.json`.

## 2026-06-23 ICP Passed HTTPS Switch

### Time

- Work time: 2026-06-23 17:40 +08:00
- Session ID: `museai-20260623-1740-icp-https-switch`

### Changes

- `utils/request.js`
  - Active `BASE_URL` switched to `https://api.banpo-museai.xyz/api/v1`.
  - Local backend and old public HTTP endpoint are retained only as commented fallback options.
- `api/stream.js`
  - Active SSE `BASE_URL` switched to `https://api.banpo-museai.xyz/api/v1` to match REST.
- `api/index.js`
  - Header comment updated to document the active HTTPS base.
- `README.md` and `README_EN.md`
  - Updated current stage from filing-period HTTP testing to ICP-passed HTTPS testing.
  - Kept WeChat legal-domain configuration and exemption-off real-device validation as remaining tasks.

### Verification

```powershell
Invoke-WebRequest -Uri "https://api.banpo-museai.xyz/api/v1/health" -UseBasicParsing
Invoke-RestMethod -Method Post -Uri "https://api.banpo-museai.xyz/api/v1/tour/sessions" -ContentType "application/json" -Body '{"interest_type":"B","persona":"B","assumption":"D","guest_id":"codex_https_test"}'
node --check utils/request.js
node --check api/stream.js
node --check api/index.js
npm.cmd run test:preflight
npm.cmd run test:all
```

Result: health returned 200, HTTPS session creation returned a valid session id and `session_token`, and frontend tests passed. Preflight active API base is `https://api.banpo-museai.xyz/api/v1`; the only warning is local `project.private.config.json` `urlCheck=false`.

### Next Steps

- Refresh WeChat DevTools legal-domain information.
- Turn off legal-domain/TLS/HTTPS exemption and rerun real-device testing against HTTPS.

## 2026-06-23 WeChat Legal-Domain Real-Device Pass

### Time

- Work time: 2026-06-23 18:05 +08:00
- Session ID: `museai-20260623-1805-wechat-domain-pass`

### User Confirmation

- The user confirmed that the WeChat DevTools legal-domain/TLS/HTTPS exemption was turned off and real-device testing passed.

### Changes

- `README.md` and `README_EN.md`
  - Marked request legal-domain real-device validation as completed.
  - Removed request legal-domain validation from unresolved launch blockers.
  - Kept uploadFile/downloadFile domain checks as conditional future requirements.

### Notes

- No frontend source logic changed in this status-sync step.
- `project.private.config.json` is modified locally by DevTools settings and remains a local tool configuration concern.

## 2026-06-20 Deep-Dive Back Target and Suggestions Audit

### Time

- Work time: 2026-06-20 09:08 +08:00 ongoing
- Session ID: `museai-20260620-0908-deep-dive-back-suggestions`

### Phase

- Investigating the remaining navigation bug where deep discussion shows the exhibit context but native back still returns to exhibit search.
- Auditing exhibit suggestion prompt templates for natural question wording and better fit with the selected exhibit.

### Initial Findings

- `pages/exhibit-detail/exhibit-detail.js` currently falls back to `redirectTo('/pages/tour/tour?...')` if it cannot identify the previous tour page; this fallback can leave exhibit search under the tour page.
- `store/tour.js` still includes instruction-like suggestion prompts that should be rewritten as direct visitor questions.

### Changes

- `pages/exhibit-detail/exhibit-detail.js`
  - Extended old tour page detection with a data-shape fallback (`messages`, `guideSuggestions`, `currentExhibit`, `hallName`) so hidden tour page instances are still recognized when route metadata is unreliable.
  - Added explicit scan-page detection for the stack pattern `tour -> exhibit-scan -> exhibit-detail`; when matched, deep discussion navigates back two levels to the existing tour page instead of opening a new tour page above exhibit search.
- `store/tour.js`
  - Rewrote exhibit-focused suggestion prompts into direct visitor questions.
  - Removed the awkward `应该先观察...再决定...` wording.
  - Softened several `应该/最该`临展 and研学 prompts into more natural questions.

### Verification

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/tour/tour.js
node --check store/tour.js
npm.cmd run test:suggestions
npm.cmd run test:hall-chat
npm.cmd run test:all
```

Result: all passed. `test:preflight` only warns about the known temporary HTTP dev API and `project.private.config.json` `urlCheck=false` release setting.

### Manual Retest Required

- Path: hall selection -> AI tour -> exhibit search -> exhibit detail -> `与 AI 深入探讨`.
- Expected: AI tour shows `正在讨论：<exhibit>`, shows exhibit-focused suggestions, and native top-left back returns to hall selection instead of exhibit search.
- Expected: re-entering the same hall restores that hall's discussion exhibit; entering other halls should keep their own discussion context separate.

## 2026-06-20 Deterministic Tour Back Button

### Time

- Work time: 2026-06-20 09:42 +08:00
- Session ID: `museai-20260620-0942-tour-custom-back`

### Root Cause

- WeChat native top-left back always follows the real page stack.
- If deep discussion enters a new/replaced tour page above `exhibit-scan`, the native back target is still `exhibit-scan`; JavaScript cannot intercept the native navigation bar back event with the default navigation bar.
- The tour page also initialized `exhibit` from global `currentExhibit` before knowing whether the entry came from exhibit detail, which could carry one hall's discussion object into another hall.

### Changes

- `pages/tour/tour.json`
  - Enabled `navigationStyle: "custom"` for the tour page only.
- `pages/tour/tour.wxml` / `pages/tour/tour.wxss`
  - Added a custom top-left back button styled like the existing dark WeChat navigation area.
- `pages/tour/tour.js`
  - Added `goBackFromTour()`: syncs current hall chat/report summary, finds the nearest hall selection page in the stack, and navigates back to it; falls back to `/pages/hall/hall`.
  - Added custom topbar safe-area padding.
  - Changed exhibit initialization so ordinary hall entry does not inherit another hall's active discussion object.
  - Removed automatic `clearCurrentExhibit()` during ambiguous page entry; discussion context should only be cleared by the user's `X` on the context bar.
  - Fixed a mojibake fallback object type string to `展品`.

### Verification

```bash
node --check pages/tour/tour.js
node --check pages/exhibit-detail/exhibit-detail.js
node --check store/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:all
```

Result: all passed. `test:preflight` still only warns about the temporary HTTP dev API and release-domain `urlCheck=false`.

Additional check: scanned touched tour/suggestion files for common mojibake fragments; no matches remained in the checked files.

## 2026-06-20 Tour Back Stack Relaunch and Exhibit Naming Cleanup

### Time

- Work time: 2026-06-20 10:16 +08:00 ongoing
- Session ID: `museai-20260620-1016-tour-stack-exhibit-naming`

### User Feedback

- The previous custom back still was not enough:
  - Returning to hall selection and re-entering could land on exhibit detail instead of the AI tour with `正在讨论`.
  - Later exits from an active discussion could still reveal exhibit search.
- The tour topbar no longer matched the previous native-looking dark navigation UI.
- All app/admin language should use `展品`; deprecated stack-return code should be removed.

### Planned Fix

- Change tour back to `wx.reLaunch('/pages/hall/hall')` after syncing local hall chat and report state, so search/detail pages cannot remain under the stack.
- Remove the old `skipToHallOnReturn` flow from store, scan page, and tests.
- Keep custom navigation only for controllable back behavior, but tune the topbar to match the original dark nav and replace the text chevron with a CSS chevron.
- Replace older exhibit wording with `展品` in active source/product copy.

### Manual Retest Required

- Deep-dive path: `展厅选择页 -> AI问答页 -> 搜展品 -> 展品详情 -> 与 AI 深入探讨 -> 左上角返回`.
- Expected: the custom left button returns directly to `展厅选择页`, not `搜展品页`.
- Expected: `正在讨论：<展品>` remains saved for that hall until the user taps `X`.

### Implemented

- `pages/exhibit-detail/exhibit-detail.js`
  - Removed the stack-reuse branch that searched for an older tour page and `navigateBack`-ed to it.
  - Deep discussion now `reLaunch`es a fresh tour page with the exhibit context stored first, so `搜展品` and `展品详情` cannot remain under the AI page in the stack.
  - Removed now-unused tour/scan page-shape helpers.
- `pages/tour/tour.js`
  - `goBackFromTour()` now syncs current hall data and uses `wx.reLaunch('/pages/hall/hall')`, clearing any search/detail pages below the current tour page.
  - Deep-dive entry restores chat history from in-memory messages first, then the per-hall cache, so clearing the stack does not lose the visible conversation.
  - Kept discussion context persistent per hall; only the context-bar `X` clears it.
  - Removed the unused `navigate_back` suggestion action branch so suggestions cannot trigger stack-relative back navigation.
- `pages/tour/tour.wxml` / `pages/tour/tour.wxss`
  - Replaced the text-rendered chevron with a CSS chevron and aligned the custom dark topbar closer to the previous native-looking UI.
- `store/tour.js`, `utils/storage.js`, `scripts/test-hall-chat-history.js`
  - Removed the deprecated `skipToHallOnReturn` storage/state/test path.
- `pages/exhibit-detail/*`, `pages/exhibit-scan/*`, `pages/tour/tour.js`, `store/tour.js`
  - Replaced product wording with `展品`.

### Pending Verification

- Completed after backend naming cleanup.

### Verification

```bash
node --check pages/tour/tour.js
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check store/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:report
npm.cmd run test:all
```

Result: all passed. `test:preflight` still reports the expected development warnings: temporary HTTP API base and `project.private.config.json` `urlCheck=false`.

### Residual Scan

```bash
rg -n "展项" . -S
rg -n "SkipToHall|skipToHall|TOUR_SKIP|consumeSkipToHallOnReturn|setSkipToHallOnReturn" pages store utils scripts constants -S
```

Result: no active frontend source matches.

## 2026-06-20 Deep-Dive Stack Hardening

### Time

- Work time: 2026-06-20 10:58 +08:00 ongoing
- Session ID: `museai-20260620-1058-deep-dive-stack-hardening`

### Root Cause

- `展品详情 -> AI问答页` still used `redirectTo`.
- With the original stack `展厅选择页 -> AI问答页 -> 搜展品 -> 展品详情`, `redirectTo` produced `展厅选择页 -> AI问答页旧 -> 搜展品 -> AI问答页新`.
- If the top-left return missed the custom handler or the system back path was used, `搜展品` was still underneath the current page.

### Changes

- `pages/exhibit-detail/exhibit-detail.js`
  - Changed deep-dive navigation from `wx.redirectTo` to `wx.reLaunch` after persisting the exhibit context.
  - Effective user flow stays `展厅选择页 -> AI问答页 -> 搜展品 -> 展品详情 -> AI问答页`, but the actual page stack is reset at the last step, so back cannot reveal `搜展品`.
- `pages/tour/tour.js`
  - Deep-dive tour entry now restores messages from memory or per-hall cache after `reLaunch`.
  - Removed unused `navigate_back` suggestion handling.
- `store/tour.js`
  - Removed unused `navigate_back` icon special-case.

### Pending Verification

- Completed.

### Verification

```bash
rg -n "skipToHall|SkipToHall|TOUR_SKIP|consumeSkipToHallOnReturn|setSkipToHallOnReturn|tourDelta|isTourPage|isScanPage|navigate_back|redirectTo\\(\\{ url: url \\}\\)|navigateBack\\(\\{ delta: tourDelta|返回列表" pages store utils scripts constants -S
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/tour/tour.js
node --check store/tour.js
node --check scripts/test-guide-suggestions.js
npm.cmd run test:suggestions
npm.cmd run test:hall-chat
npm.cmd run test:all
```

Result: residual mechanism scan returned no matches. Syntax checks passed. Focused tests passed. `test:all` passed; preflight still only reports expected temporary HTTP API and `urlCheck=false` release warnings.

## 2026-06-20 Hall/Tour Topbar Alignment

### Time

- Work time: 2026-06-20 11:23-11:35 +08:00
- Session ID: `museai-20260620-1123-topbar-alignment`

### Root Cause

- 真机页面切换时，`hall` 页使用微信原生导航栏，`tour` 页使用 `navigationStyle: custom` 自绘导航栏。
- 原生导航栏和自绘导航栏在滑动/切页动画中由不同渲染层处理，状态栏高度、胶囊避让和深棕背景不能完全逐像素同步，导致顶部边缘出现轻微露边或错位。

### Changes

- `pages/hall/hall.json`
  - 将展厅选择页切换为 `navigationStyle: custom`。
- `pages/hall/hall.wxml`
  - 增加与 AI 问答页一致的自绘顶栏结构。
  - 将原展厅列表内容放入滚动容器，避免自绘导航栏覆盖内容。
- `pages/hall/hall.js`
  - 复用与 `tour` 页一致的胶囊/状态栏高度计算方式。
  - 增加自绘返回按钮：有页面栈时 `navigateBack`，无页面栈时回首页。
- `pages/hall/hall.wxss`
  - 增加与 `tour` 页一致的深棕顶栏、返回箭头、标题、右侧胶囊避让和背景样式。

### Verification

```bash
node --check pages/hall/hall.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:all
rg -n "skipToHall|SkipToHall|TOUR_SKIP|consumeSkipToHallOnReturn|setSkipToHallOnReturn|tourDelta|isTourPage|isScanPage|navigate_back|redirectTo\\(\\{ url: url \\}\\)|navigateBack\\(\\{ delta: tourDelta|返回列表" pages store utils scripts constants -S
git diff --check
```

Result: all syntax and focused tests passed. `test:all` passed. Residual old-mechanism scan returned no matches. `git diff --check` reported only existing LF-to-CRLF warnings.

## 2026-06-20 Transient Exhibit Discussion Navigation

### Time

- Work time: 2026-06-20 12:03-12:25 +08:00
- Session ID: `museai-20260620-1203-transient-discussion-navigation`

### Decision

- “正在讨论：xx” is now a transient in-hall mode.
- It is entered only by tapping “与 AI 深入探讨”.
- It is cleared when the user leaves the AI tour page or taps the context-bar close button.
- Re-entering a hall does not restore the previous discussion context.

### Root Cause

- Previous stack hardening used `wx.reLaunch` from exhibit detail to tour and from tour back to hall.
- `reLaunch` prevents stale pages from remaining in the stack, but the user-visible transition is not the same native slide animation and can feel like a flicker on device.
- The older hall-scoped exhibit context cache also conflicted with the new desired design because it could restore “正在讨论” after re-entering a hall.

### Changes

- `pages/exhibit-detail/exhibit-detail.js`
  - Deep discussion now finds the existing `pages/tour/tour` page in the stack and uses `wx.navigateBack({ delta })` to return to it with native slide animation.
  - If no existing tour page is found, it falls back to `wx.navigateTo`.
- `pages/tour/tour.js`
  - Fresh hall entry clears `currentExhibit`.
  - `onShow` only applies pending deep-dive context or the current transient context; it no longer restores hall-scoped exhibit context.
  - Leaving the tour page clears the current discussion context.
  - Custom back now prefers `navigateBack` to the existing hall page, with `reLaunch` only as a fallback.
- `pages/tour/tour.json`
  - Added `disableSwipeBack: true` for platforms/base libraries that support page-level swipe-back disabling.
- `store/tour.js`
  - Removed hall-scoped exhibit context persistence APIs and storage usage from active state.
- `scripts/test-hall-chat-history.js`
  - Updated tests to assert transient exhibit discussion behavior instead of hall-restored behavior.

### Verification

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/tour/tour.js
node --check store/tour.js
node --check scripts/test-hall-chat-history.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:all
rg -n "currentExhibitByHall|getCurrentExhibitForHall|applyHallExhibitContext|_loadHallExhibitContexts|_persistHallExhibitContexts|redirectTo\\(\\{ url: url \\}\\)|wx\\.reLaunch\\(\\{ url: url \\}\\)|navigate_back|skipToHall|SkipToHall|TOUR_SKIP" store\\tour.js pages scripts constants -S
git diff --check
```

Result: syntax checks passed. Focused tests passed. `test:all` passed. Residual old-mechanism scan returned no matches. `git diff --check` reported only LF-to-CRLF warnings.

## 2026-06-20 Release-Closeout Frontend Audit

### Time

- Work time: 2026-06-20 12:57 +08:00 ongoing
- Session ID: `museai-20260620-1257-release-closeout-audit`

### Goals

- Re-scan the mini-program frontend after full device testing.
- Identify unused frontend code/file candidates without deleting files before user confirmation.
- Update README docs to match current test/deployment reality.
- Keep release notes explicit about temporary server API, pending ICP/WeChat legal domain work, non-real data, and missing purchased OCR service.

### Progress

- Confirmed the active mini-program source does not include the old `_web_archive/` folder.
- Confirmed current API posture remains temporary server HTTP for local/device testing, with HTTPS production endpoint kept as comments.
- Potential legacy wrappers such as `authApi`/`chatApi` in `api/index.js` are not removed in this pass because exports and backend legacy/admin routes need a separate consumer audit.
- Bumped `TOUR_CACHE_SCHEMA_VERSION` from `tour-cache-v4` to `tour-cache-v5` so updated devices clear old tour/session/report caches once after the current stats and discussion-flow changes.

### Verification

```bash
node --check utils/storage.js
npm.cmd run test:all
git diff --check
```

Result: syntax check passed. `test:all` passed. Preflight warnings are expected for the temporary HTTP dev API and local `project.private.config.json` `urlCheck=false`.

## 2026-06-20 Restore explicit exhibit discussion trigger

### Time

- Work time: 2026-06-20 07:19-07:28 +08:00
- Session ID: `museai-20260620-0650-deep-dive-navigation`

### Changes

- `pages/exhibit-detail/exhibit-detail.js`
  - Deep discussion now explicitly writes the context exhibit into store, pending detail cache, and the existing hidden tour page via `setData` before `navigateBack`.
  - Added page instance fallbacks for old tour and hall detection.
- `pages/tour/tour.js`
  - `onShow` consumes pending deep-dive exhibit and reapplies it before rendering `currentExhibit`.
- `pages/exhibit-scan/exhibit-scan.js`
  - Hall lookup for one-shot cleanup also checks the page instance method `selectHall`.

### Verification

```bash
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/tour/tour.js
npm.cmd run test:hall-chat
npm.cmd run test:suggestions
npm.cmd run test:all
```

Result: all passed. Preflight warnings are unchanged release-configuration warnings.
