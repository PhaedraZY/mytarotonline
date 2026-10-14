# 发布到 GitHub Pages 与绑定域名

本项目的目标仓库是 [PhaedraZY/mytarotonline](https://github.com/PhaedraZY/mytarotonline)。默认 Pages 地址为 **https://phaedrazy.github.io/mytarotonline/**；只有工作流部署成功后该地址才可访问。

## 自动发布

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。推送 `main` 后，工作流安装依赖、运行测试、构建静态目录、上传构建产物并部署。也可在 Actions 页面手动运行 `Publish tarot website to GitHub Pages`。

```sh
npm test
npm run build:pages
git add .
git commit -m "Update tarot website"
git push origin main
```

日后发布前仍需检查实际暂存内容；`.gitignore` 已排除本机模型、密钥、聊天记录、上传、日志、第三方研究缓存和设备验证记录。只将 `dist/` 交给 Pages，不上传整个工作区。不要把云端 API Key 放进静态 JavaScript 或 GitHub Pages 变量中。

## 域名 DNS

域名：**mytarotonline.xyz**。在域名当前权威 DNS 服务商的解析页填写以下记录；如果购买平台是阿里云，一般入口是域名控制台 → 域名 → 解析／云解析 DNS。

| 记录类型 | 主机记录 | 记录值 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `PhaedraZY.github.io` |
| TXT | `_github-pages-challenge-PhaedraZY` | `38d4f2da5d936ca251e3578443f3aa` |

TXT 值来自本次 GitHub 账户域名验证页面。它是需要公开发布的域名所有权挑战值，不是 API Key。若重新生成了验证挑战，应以 [GitHub 验证页面](https://github.com/settings/pages_verified_domains/mytarotonline.xyz) 的当前值为准。

TTL 保持服务商默认值即可。若控制台要求完整名称，TXT 名称应为 `_github-pages-challenge-PhaedraZY.mytarotonline.xyz`；如果会自动补域名，只填写表中的主机记录。CNAME 值不要加 `https://` 或 `/mytarotonline/`。

先检查同一主机记录是否已有冲突配置，保留邮件 MX 和其他无关 TXT。域名处于实名认证审核、hold 或未委派 DNS 的状态时，应先在注册商处解决；域名实名认证与 ICP 备案是不同事项。

## 验证、绑定与 HTTPS

1. 在账户 [Settings → Pages](https://github.com/settings/pages) 完成域名 TXT 验证。验证成功后继续保留 TXT。
2. DNS 正确后，在 [仓库 Settings → Pages](https://github.com/PhaedraZY/mytarotonline/settings/pages) 的 **Custom domain** 填写 `mytarotonline.xyz` 并保存。
3. 等待 GitHub DNS 检查通过和证书签发，启用 **Enforce HTTPS**。
4. 检查 `https://mytarotonline.xyz/`、`https://www.mytarotonline.xyz/`，再验证抽牌、图片和浏览器手记。

在域名 DNS 尚未就绪前，先使用默认 `github.io` 地址。提前绑定未生效域名可能让默认地址跳转到暂时打不开的域名。Actions 部署通过仓库 Pages 设置管理自定义域名，不能仅靠添加 CNAME 文件完成绑定。

DNS 缓存、域名激活和证书签发需要时间；GitHub 官方说明 HTTPS 选项可能最多等待 24 小时。换到自定义域名后，浏览器存储属于新的 origin，因此旧 `github.io` 地址的手记和画作不会自动迁移。

## 本次发布范围

这是免费静态体验版：78 张牌、抽牌动画、基础牌义、浏览器手记和浏览器内原创图片。AI 解读、服务器账号、支付及用户间共享牌库不包含在该部署中。本机 AI 服务继续独立运行。

自定义域名不会保证中国大陆网络可用性；后续收费服务、稳定的大陆访问和完整 AI 后端需要进一步选择合适的托管，详见 [官方托管资料核查](10-hosting-research.md)。
