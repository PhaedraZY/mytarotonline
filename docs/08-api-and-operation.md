# API 与运行说明

版本：0.3.0。核对日期：2026-10-14（Asia/Shanghai）。本文仅描述本机 AI 版本；GitHub Pages 版使用浏览器存储和基础牌义，见文档 11。本文以当前 `server.js`、`lib/` 和 `public/` 实现为准。

## 1. 启动与服务关系

需要 Node.js ≥22.13。项目依赖通过 `npm install` 安装；日常启动：

```powershell
cd path\to\mytarotonline
.\scripts\local-model.ps1 Start
.\scripts\website.ps1 Start
```

网页和业务 API：**<http://127.0.0.1:4173/>**。本机模型：**<http://127.0.0.1:11434/>**。浏览器只访问网页服务，网页后端再调用 Ollama 或所选云端供应商。两个脚本均在后台启动隐藏进程。也可用 `npm start` 在终端前台运行网页、按 `Ctrl+C` 停止；`npm run dev` 使用 Node watch 模式，`npm test` 运行后端测试。

`website.ps1` 默认动作是 `Start`，通过 `/api/health` 的 `ok` 和版本号检查就绪。启动 Node 时读取项目 `.env`，使用绝对 `server.js` 路径；默认端口 4173，可通过 `-Port` 指定，此参数优先于 `.env` 中的 `PORT`。前台 `npm start` 直接使用环境或 `.env` 的 `PORT`。固定绑定地址为 `127.0.0.1`。

后台网页管理命令：

```powershell
.\scripts\website.ps1 Status
.\scripts\website.ps1 Stop
.\scripts\website.ps1 Start
```

网页日志在 `.runtime/logs/website.stdout.log` 和 `website.stderr.log`，脚本拥有的进程记录在 `.runtime/website-service.json`。已有同版本健康服务会直接复用而不接管；没有脚本记录的进程不会被 `Stop` 关闭。关闭前还会验证 PID、Node 可执行路径、命令行中的本项目绝对 `server.js` 路径和精确启动时间，防止 PID 被复用后误停其他程序。若当前服务由 `npm start` 手动启动，应先在原终端退出，再切换到脚本启动。

本机 Ollama 与网页是独立进程，停止网页不会自动停止模型服务：

```powershell
.\scripts\local-model.ps1 Status
.\scripts\local-model.ps1 Test
.\scripts\local-model.ps1 Stop
```

重启电脑后重新运行 `Start`。模型可通过官方下载脚本或自行安装 Ollama 部署，步骤见仓库 README。项目脚本将模型保存在 `.models/`，并禁用 Ollama 云功能。本地 Qwen 3.5 的解读和追问启用思考，使用 12,288 上下文；其他本地模型一至三张牌使用 8,192，五张及追问使用 12,288。可用 OLLAMA_NUM_CTX 显式覆盖。一／三／五张牌的回答预算为 2,400／3,600／4,800 token，追问为 1,800；Qwen 3.5 另加 5,000 token 供思考，前端只显示最终回答。连接短测试关闭思考。网页请求保留模型 10 分钟；独立测试脚本使用 5 分钟。

## 2. 使用流程与定制

1. 在首页选择月隐之庭、赤曜书房或森语回廊。主题影响配色、氛围与 AI 语气，不改变抽牌算法。
2. 点击「开启我的占卜」，输入问题，从六种单张／三张／五张牌阵中选择玩法、是否启用逆位。界面问题上限 600 字符；API 上限 800 字符；留空使用默认自我探索问题。
3. 查看洗牌，翻页浏览牌背并选择牌。每组桌面最多 26 张、窄屏最多 13 张，牌池来自完整 78 张，而非仅从当前分组抽取。
4. 按选牌顺序逐张翻开；全部翻开后请求解读。AI 失败时可重试同一牌阵，也可选择明确标注的基础牌义。
5. 在结果下继续追问，或到「星光手记」查看和恢复历史会话。基础牌义模式不生成 AI 追问。

「世界设置 → 你的原创牌面」支持单张替换或批量选择文件。先下载命名清单，按 `major-00.jpg`、`wands-ace.png`、`cups-queen.webp` 等标准 ID 命名。批量操作由前端逐文件调用同一个上传接口，部分失败不回滚已经成功的图片。

图片必须为静态 JPG、PNG 或 WebP，单张 ≤8 MiB，至少 200×300 像素，总像素 ≤3,200 万。建议竖幅 2:3。后端解码、按 EXIF 旋转，在 1400×2100 范围内等比缩小且不放大，转换为 quality 88 的 WebP。原始上传文件的字节不会另存，画作原稿请保留在自己的文件夹中。

上传只替换图片，标准 ID、牌义与抽牌概率保持一致。新图用于图鉴及上传后新建的牌阵；已经创建的牌阵使用原快照。「恢复经典牌面」清空当前覆盖映射，保留上传后的 WebP 文件和历史记录，方便旧记录继续显示。

## 3. 云端服务与密钥

当前提供以下 provider ID；默认模型名是可编辑的初始配置，不代表本账户已经开通或真实调用成功。

| provider | 界面名称 | 默认模型 | 默认接口基础地址 |
|---|---|---|---|
| `local` | 本地千问 · Ollama | `qwen3.5:9b` | `http://127.0.0.1:11434` |
| `qwen` | 千问云端 | `qwen3.8-flash` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `deepseek` | DeepSeek 云端 | `deepseek-flash` | `https://api.deepseek.com/v1` |
| `openai` | OpenAI | `gpt-6-luna` | `https://api.openai.com/v1` |
| `reference` | 基础牌义 · 不调用 AI | `local-reference-v1` | 不调用模型服务 |

**本轮未配置真实云端 API Key，未执行真实云端推理。** 云端适配代码与本机接口可用性应与账户权限、地域、额度及模型实际支持分开判断。

通过右上角「世界设置」选择服务，填写模型名、官方接口地址和 API Key。「测试连接」会先保存表单，再调用一个简短的中文结构化输出请求；成功后返回服务消息和本次测试耗时。千问的密钥、模型与接口应使用同一区域或工作空间的配置；支持默认官方地址、官方国际/美国地址及代码白名单中的专属工作空间域名。不接受第三方代理地址或携带用户名、密码、查询参数的 URL。

也可以使用 `.env`。首次创建时保留已有文件：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

用编辑器填写所需变量后重启网页服务：

| 变量 | 用途 |
|---|---|
| `PORT` | 网页端口，默认 4173 |
| `TAROT_PROVIDER` | 没有已保存选择时的默认 provider，默认 `local` |
| `OLLAMA_BASE_URL`、`OLLAMA_MODEL` | 本机模型原生 API 地址及模型名 |
| `OLLAMA_NUM_CTX` | 本机上下文，自动 8192／12288；Qwen 3.5 解读默认 12288，应用限制在 4096–16384 |
| `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY` | 千问密钥，前者优先 |
| `QWEN_MODEL`、`QWEN_BASE_URL` | 千问模型与官方接口地址 |
| `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` | DeepSeek 密钥与模型 |
| `OPENAI_API_KEY`、`OPENAI_MODEL` | OpenAI 密钥与模型 |
| `TAROT_HOURLY_LIMIT` | 进程内共享的每小时生成入口请求限制，默认 100 |

界面已保存的 provider、模型、地址和非空密钥优先于环境默认值。只改 `TAROT_PROVIDER` 不会覆盖之前在界面保存的选择。界面密钥留空表示保留旧值，不表示删除；当前没有单独的删除密钥按钮，需要停止网页服务后编辑 `.runtime/settings.json` 对应字段，同时检查 `.env` 是否提供了回退密钥。

通过界面输入的密钥只提交至本机服务端，读取设置和健康接口不返回密钥，浏览器 Local Storage 不存密钥。**`.runtime/settings.json` 中的密钥是明文，未使用系统密钥库加密**；`.env` 同样属于私有本机文件。这两个位置已被 `.gitignore` 排除，备份或分享项目时应按私密配置处理。

云端解读会发送用户问题、抽到的牌及相关牌义、角色语气；追问还发送既有解读及最近至多 2 轮追问。当前是文字解读，经典牌图和用户上传的画作不会作为图片发送给模型。

## 4. 业务 API

基础地址：`http://127.0.0.1:4173`。所有 POST 使用 `Content-Type: application/json`，请求体必须为对象，总体限制 12 MiB。失败统一返回：

```json
{ "error": "DRAW_INCOMPLETE", "message": "请先完成本次选牌。" }
```

| 方法与路径 | 请求或用途 | 主要响应 |
|---|---|---|
| `GET /api/health` | 应用及模型状态 | `ok`、`version`、provider 状态、模型列表，不含密钥 |
| `GET /api/catalog` | 当前牌库与覆盖图片 | `deck`、78 个 `cards`、`spreads` |
| `GET /api/settings` | 当前公开设置 | 选中 provider、各服务模型与地址、`configured`、本机状态、原创图数量 |
| `POST /api/settings` | 保存 `{provider, model?, baseUrl?, apiKey?}` | 更新后的公开设置 |
| `POST /api/models/test` | `{provider?}`，省略使用当前设置 | `ok`、`model`、`latencyMs`、测试消息 |
| `POST /api/readings` | 新建牌阵，结构见下文 | HTTP 201，新会话及不透明牌槽 token；幂等重放为 200 |
| `GET /api/readings/:id` | 恢复指定会话 | 会话、固定 78 个槽 token 及选择状态、已抽牌、解读、追问与错误状态 |
| `POST /api/readings/:id/select` | `{token}` | 更新后的会话与新抽牌结果 |
| `POST /api/readings/:id/interpret` | `{provider?}` | `readingId`、`status`、`interpretation`、provider/model、耗时和 usage |
| `POST /api/readings/:id/followups` | `{question, provider?}` | `answer`、provider/model、耗时 |
| `GET /api/history` | 最近最多 80 条，按新到旧 | `{readings:[...]}`，含问题、时间、状态、牌名与主题 |
| `POST /api/assets/upload` | `{cardId, filename?, imageDataUrl}` | 替换后的图像 URL 与原创图数量 |
| `POST /api/deck/reset` | `{}` | `{ok:true}`，恢复经典映射 |

新建请求示例：

```json
{
  "question": "面对新的创作方向，我可以如何安排下一步？",
  "spreadId": "three",
  "allowReversed": true,
  "theme": "lunar",
  "clientRequestId": "example-reading-20261014-001"
}
```

`spreadId` 为 `one`、`three`、`timeline`、`decision`、`relationship` 或 `cross`；`allowReversed` 必须明确为布尔值；`theme` 为 `lunar`、`ember`、`forest`，其他值回退到 lunar。`clientRequestId` 可选，长度 8–100，只允许字母、数字、下划线与连字符；重复使用会返回原会话，开始新问题时必须换新值。

通过 `GET /api/catalog` 的 `spreads` 获取六种牌阵及 `positions`、`description`、`questionHint`、`layout`，不应在客户端硬编码两种玩法。新会话保存牌阵名称、布局、牌位说明和整副牌的快照。`slots:[{"token":"…","selected":false}, ...]` 始终保留原来的 78 个位置；抽取后只将对应位置的 `selected` 设为 `true`，不重新洗牌、不压缩队列，也不公开未抽牌的身份与方向。选择 token 提交 `select`，按选择顺序放入牌位。重复提交同一 token 不会多抽；抽够后不能替换牌。

结构化解读形状：

```json
{
  "summary": "本次主题",
  "cards": [
    {
      "cardId": "major-09",
      "positionId": "focus",
      "orientation": "upright",
      "symbolAnchor": "内省与内在指引",
      "interpretation": "结合问题与当前牌位的解读",
      "reflectionQuestion": "一个具体的反思问题"
    }
  ],
  "synthesis": "牌与问题之间的联系",
  "actions": ["一个可选择的小行动"],
  "closing": "角色语气的收尾"
}
```

此例只说明单张牌的结构，真实返回必须匹配本次抽牌。常规 `actions` 为 1–3 项。`mode` 为 `ai` 或 `reference`，基础牌义模式不会伪装成个性化 AI 结果。

上传的 `imageDataUrl` 为 `data:image/png;base64,...`、JPEG 或 WebP 对应格式；服务端不会接受外部图片 URL，也不会把 `filename` 当作保存路径。

## 5. 随机性、失败与限制

新建会话时，服务端使用 Node `crypto.randomInt` 进行 Fisher–Yates 洗牌，不放回抽取。启用逆位时每张牌独立以 1/2 概率分配逆位。浏览器获取固定 78 个位置的随机 token 和选择状态，不能通过未选槽响应提前读取牌 ID 或方向。程序确定牌，模型只解读。

解读响应经过 JSON 解析、内容形状与长度校验，并逐项核对卡牌数量、顺序、ID、牌位和方向。本地 Qwen 3.5 推理时通过提示词提供 schema，避免 Ollama 语法约束下输出耗尽；仍执行同样的 JSON 与身份校验。结构或牌面错误最多追加一次修复请求，仍失败则不展示不一致的结果。网络、额度和权限错误不会盲目自动重试。用户可以重新解读，原抽牌保持不变；同一 provider 与 model 已完成的解读直接返回缓存。

同一会话的生成请求做并发合并或互斥。常规本机超时 180 秒、云端超时 90 秒；网页会显示等待状态，不展示未完成 JSON 或模型内部推理。服务重启时，原 `interpreting` 会话恢复为可重试状态。

本版最多保存 5,000 条会话，每条最多 10 次追问，历史列表仅显示最近 80 条。生成入口默认每小时 100 次、应用内同时最多 2 个生成任务；连接测试与追问共用额度，纯基础牌义解读不调用模型。修复可能额外产生一次上游调用，因此该限额不等于精确供应商计费次数。计数只在内存中，重启后重置；本机 Ollama 另配置为单并行请求。

## 6. 数据保存与部署边界

| 本机路径 | 保存内容 |
|---|---|
| `.runtime/readings.json` | 问题、完整会话牌池快照、已抽牌、解读、追问、模型与耗时元数据 |
| `.runtime/settings.json` | 当前 provider、模型、地址、通过界面保存的明文密钥 |
| `.runtime/deck-overrides.json` | 标准牌 ID 到原创显示图的覆盖映射 |
| `.runtime/uploads/*.webp` | 解码和转换后的原创牌图，随机 UUID 文件名 |
| `.runtime/ollama/`、`.runtime/logs/` | Ollama 运行时、部署记录与日志 |
| `.runtime/website-service.json`、`.runtime/logs/website.*.log` | 后台网页进程身份、标准输出和错误日志 |
| `.models/` | 官方模型 manifest 和已校验的权重文件 |
| `public/assets/decks/rws/` | 78 张原始经典 JPEG 与网页显示 WebP |
| `data/cards.json`、`data/deck-sources.json` | 牌义资料和逐图来源记录 |

浏览器 Local Storage 只记录主题、最近会话 ID、逐会话已翻牌数量等体验状态。清除浏览器存储不会删除服务端手记。数据文件通过队列和临时文件替换保存；当前没有数据库、账号权限或用户隔离。若需要手工备份，先停止网页服务，再一并备份记录、覆盖映射及 uploads，避免只保留 JSON 导致原创图片丢失。

这是本机开发版：网页与 Ollama 均只监听 loopback，网页校验 Host、Origin 和跨站请求，静态服务不提供 `.runtime`、`.models` 或 `.env` 的读取路径。它没有公网认证、多租户、支付、持久化限流或自动运维。正式商业服务需要另行设计这些能力，不能通过端口转发把当前个人数据目录直接变成多用户服务。

## 7. 视觉来源与验证范围

牌图来自 [Wikimedia Commons：Rider–Waite–Smith tarot deck (TaionWC)](https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC))，绘图作者 Pamela Colman Smith。来源将所用原作扫描标注为 Public domain；逐张来源、尺寸、摘要及权利说明见 [06 · 经典牌面与中文牌义](06-card-assets.md) 和 `data/deck-sources.json`。156 段中文牌义为项目原创初稿，尚待专业顾问审校。

抽牌互动参考 [Codrops Baraja](https://tympanus.net/Development/Baraja/) 的叠牌、扇形和收放构图；运动节奏参考 [Anime.js](https://animejs.com/) 的错峰与层次感。当前使用原生 JavaScript/CSS 自行实现洗牌、分组扇形、悬停、归位、翻牌和光晕，没有引入或复制 Baraja、Anime.js 的插件实现。页面支持 `prefers-reduced-motion`。

本轮使用本地 Qwen 3.5:9b 完成五张决策牌和一次追问的真实生成，最终示例分别耗时约 52.1 秒和 28.1 秒。该时间只代表本机这一组输入，不能当作耗时承诺或完整质量保证。自动检查、浏览器验证及模型限制见 [12 · 牌阵与解读](12-spreads-and-readings.md)。真实云端推理需要配置账户密钥后另行验证。
