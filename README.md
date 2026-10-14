# LUNARIA · 月隐之庭

一个可更换 OC 主题与原创牌面的塔罗网页，包含完整 78 张 Rider–Waite–Smith 经典牌、中文正逆位牌义、动态洗牌、选牌和翻牌。

本仓库提供 **GitHub Pages 免费静态版**和**带 AI 后端的本机版**。

## GitHub Pages 版

单张／三张牌阵、正逆位、图鉴、三套主题和牌面上传都在浏览器中运行。抽牌使用 Web Crypto 随机数；基础牌义来自本项目编写的 156 段中文解释，**不会调用 AI，也不会要求 API Key**。

历史与自定义图片仅保存在当前浏览器的 IndexedDB 中，不上传 GitHub。清除站点数据、换浏览器或从默认域名换到自定义域名，无法自动带走原有记录；隐私模式也可能在关闭后删除数据。它适合作品展示与个人体验，不能用客户端抽牌结果作为不可篡改的交易凭证。

```sh
npm ci
npm run build:pages
```

构建输出位于 `dist/`，仅包含静态页面、牌库数据、78 张 WebP 和署名信息。相对资源路径同时适用于仓库子路径和自定义域名。不要直接把开发目录或 `public/` 上传成静态站点。

`.github/workflows/pages.yml` 在推送 `main` 后自动测试、构建并部署。仓库 Settings → Pages → Source 应选择 **GitHub Actions**。首次部署和域名 DNS 步骤见 [发布与域名说明](docs/11-github-pages.md)；托管能力和国内访问限制见 [官方资料核查](docs/10-hosting-research.md)。

## 本机 AI 版

需要 Node.js 22.13 或更高版本。

```sh
npm ci
npm start
```

打开 <http://127.0.0.1:4173/>。本机版通过 Node 后端完成抽牌、历史保存、图片处理和 AI 调用，支持 Ollama、千问云端、DeepSeek、OpenAI 以及基础牌义模式。云端模型需在世界设置中配置自己的服务密钥。

Windows 可用脚本在后台启动：

```powershell
.\scripts\local-model.ps1 Start
.\scripts\website.ps1 Start
```

脚本需要先安装模型运行时。可使用自己安装的 Ollama 并运行 `ollama pull qwen3.5:9b`，或使用项目提供的官方下载脚本。模型选择需要结合实际显存和内存调整。

```powershell
python scripts/local-download-runtime.py
.\scripts\local-model.ps1 Start
.\scripts\local-model.ps1 Pull
```

`website.ps1` 与 `local-model.ps1` 支持 `Start / Status / Stop`，本机模型另有 `Test`。请求结构、配置和数据位置见 [本机 API 与运行说明](docs/08-api-and-operation.md)。本机服务仅监听回环地址；完整 AI 版尚未做公网账号、用户隔离或商业计费。

通过界面保存的云端密钥以明文位于本机 `.runtime/settings.json`，不会回传到设置读取接口或写入浏览器存储。`.runtime/`、`.models/`、`.env` 和依赖目录均排除版本控制，不应作为网站产物发布。

## 原创牌面与素材来源

在世界设置中选择标准牌 ID 上传单张画作，或按 `major-00.webp`、`cups-queen.png` 等名称批量上传。页面可下载完整的 78 张命名清单。上传改变牌面图片，保留牌名、牌义和抽牌逻辑；已经开始的牌阵保留原有图片快照。

经典牌图由 **Pamela Colman Smith** 绘制，来自 [Wikimedia Commons 的原版 RWS 扫描分类](https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC))，来源标注 Public domain。逐牌来源和校验值见 `data/deck-sources.json`，使用说明见 [经典牌面与中文牌义](docs/06-card-assets.md)。仓库包含网页 WebP，原始 JPEG 可通过 `python scripts/deck-download.py` 重新获取。

动效参考 [Codrops Baraja](https://tympanus.net/Development/Baraja/) 的扇形构图和 [Anime.js](https://animejs.com/) 的错峰节奏，由原生 JavaScript 与 CSS 实现。

## 开发

```sh
npm test
npm run dev
```

- `public/`：共同前端，以及 Pages 静态适配器。
- `scripts/build-pages.mjs`：发布目录构建。
- `server.js`、`lib/`：本机抽牌、存储与模型后端。
- `data/cards.json`：78 张牌及完整正逆位牌义。
- `data/deck-sources.json`：图片来源与权利记录。

塔罗在这里用于象征阅读、创作与自我反思。中文牌义为原创初稿，仍可继续由专业顾问审校。未来收费的 OC 定制服务应采用适合商业用途的托管和独立后端，具体限制见文档 10。
