# GitHub Pages、域名与后端托管核查

核查日期：2026-10-14。本文区分官方托管能力与本项目的部署判断；DNS 是查询当时的公开状态。

## 推荐结论

`mytarotonline.xyz` 可以绑定 GitHub Pages。Pages 适合当前项目的免费作品展示版：78 张牌、抽牌动画、浏览器保存历史和牌义参考。现有 Node API、服务器 JSON 存储、云端 API 密钥与本机 Ollama，不能直接随静态文件一起托管到 Pages。

完整 AI 产品需要另一个后端部署：前端 → 受保护的 HTTPS API → 云端模型／受控的模型服务器。API 密钥留在服务器；本机 `127.0.0.1:11434` 只指向访问者自己的电脑，不会让公网访客连接站主的 5070 Ti。

| 方案 | 适用范围 | 本项目还需要做什么 |
| --- | --- | --- |
| GitHub 仓库 + Pages | 免费作品演示、牌库与抽牌体验 | 生成不依赖 `/api` 的静态版本；域名与 HTTPS |
| Vercel + 云端 AI + 数据库／对象存储 | 完整动态站、持续迭代 | 适配函数入口；历史、并发状态和牌面上传移入持久化服务；用户鉴权、额度与限流 |
| 支持持久化磁盘的 Node 主机 + 云端 AI | 更接近当前 Node 运行方式 | 部署进程、HTTPS、访问控制、持久化与备份；现有单用户全局设置不能直接公开 |
| 中国大陆合适的云主机／托管服务 | 将大陆访问稳定性作为主要要求 | 评估服务内容和接入要求、办理适用的备案；仍要做公网安全与存储改造 |

GitHub Pages 的官方限制明确不允许将其作为主要促进商业交易或提供商业 SaaS 的免费托管。未来收费的 OC 网站定制／在线服务应迁移至适合商业服务的主机，代码仍可放在 GitHub。Pages 官方发布体积上限 1 GB，带宽为每月 100 GB 软限制。

## 视频说法需要修正的地方

域名是在 DNS 中为服务器地址提供名字，不会改变源站位置和跨境网络路线。Vercel 官方说明：没有中国大陆服务器／CDN 节点；自定义域名和减少外部资源可能改善访问，但不能保证中国大陆的可用性或性能。GitHub Pages 也不能因为绑定一个在国内购买的域名就承诺国内稳定访问。

Vercel 具备函数后端能力，而 Pages 是静态托管，两者不能互相照搬配置。Vercel 的域名记录应以该项目 Domains 页面显示的记录值为准，不能复制视频里其他项目的 CNAME。

现有应用使用本地 JSON 文件存储历史和设置、文件夹保存上传图片，属于单机运行方式。迁移 Vercel 时应使用持久化数据库和对象存储，不依赖函数实例的本地文件长期保存数据。函数还有运行时长、内存、请求体积等限制；本项目当前允许 8 MB 原图上传，而 Vercel 函数请求／响应载荷限制为 4.5 MB，需要调整为对象存储直传等方案。大型模型文件与 Ollama 进程也不属于普通 Vercel Functions 的部署内容。

## Pages 域名配置

先在 GitHub 账户 Settings → Pages → Add a domain 验证域名；在 DNS 控制台添加 GitHub 给出的 TXT 记录。主机记录形如 `_github-pages-challenge-<GitHub用户名>`，记录值必须复制该账户实际生成的校验值。校验成功后保留 TXT。

然后在项目仓库 Settings → Pages → Custom domain 填 `mytarotonline.xyz`，并在当前权威 DNS 服务商处配置：

| 类型 | 主机记录 | 记录值 |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `<GitHub用户名>.github.io` |

`www` 的 CNAME 不包含 `https://`、仓库名或路径。根域名采用上面四条 A 记录，不要给根域生搬一条普通 CNAME；若 DNS 服务商提供 ALIAS／ANAME，也可按其规则使用。

IPv6 可选：为 `@` 添加四条 AAAA，分别是 `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`。添加 IPv6 时保留 A 记录。先核对已有记录，处理同一主机名的冲突；邮件 MX 和无关 TXT 不要删除。不要添加 `*` 通配符记录。

DNS 生效后等待 Pages 检查和证书签发，再开启 Enforce HTTPS。GitHub 文档说明 HTTPS 选项可等待最多 24 小时才可用，不能承诺一定几分钟完成。使用自定义 Actions 工作流部署时，仓库 Pages 设置中的自定义域名才是配置入口，产物里的 CNAME 文件不替代该设置。

## 当前域名公开查询结果

2026-10-14，使用 Google DNS 和 Cloudflare DNS 的 HTTPS 查询，`mytarotonline.xyz` 的 NS 查询均返回 `Status: 3`（NXDOMAIN）；Windows 向 `1.1.1.1` 查询根域 A／AAAA／NS 与 `www` CNAME 也未得到记录。

这仅说明查询时公网尚未看到该域名的 DNS 委派／记录，不能据此判断用户没有购买。请在阿里云域名控制台确认拼写、订单状态、域名持有者实名认证、域名是否处于 hold 状态，以及权威 DNS 是否已经生效。尚未获得控制台访问，未修改任何 DNS。

## 实名认证与备案不是一件事

- **域名持有者实名认证**：注册商核实域名持有者。阿里云官方说明未完成可能被注册局锁定，导致无法解析；账号实名认证也不等于域名实名认证。
- **ICP备案**：针对适用的中国大陆互联网信息服务接入要求，由服务接入方和相关部门办理；买域名、实名或配置 DNS 并不等于备案完成。是否需要办理，应结合实际服务器／CDN所在地区和服务方式判断。阿里云文档明确域名要解析到中国内地服务器需满足备案条件。

本项目尚未办理或核验备案，也没有购买云主机。上述大陆部署路线是可选的后续架构，不代表本次已执行。

## 官方来源

1. [GitHub Pages 是什么：静态站点托管](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
2. [GitHub Pages 使用限制与商业用途限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
3. [Pages 自定义域名、A／AAAA／CNAME 与 HTTPS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
4. [GitHub Pages 域名验证 TXT](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
5. [Vercel：中国大陆访问情况与限制](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)
6. [Vercel：添加自定义域名](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
7. [Vercel Functions 限制](https://vercel.com/docs/functions/limitations)
8. [Vercel 持久化数据库与对象存储](https://vercel.com/docs/storage)
9. [阿里云：域名实名认证](https://help.aliyun.com/zh/dws/overview-of-real-name-verification-for-domain-names)
10. [阿里云：什么是ICP备案](https://help.aliyun.com/zh/icp-filing/basic-icp-service/product-overview/what-is-an-icp-filing)
11. [阿里云：备案域名准备与核验](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/prepare-and-check-the-domain-name)
12. [Google DNS 只读查询](https://dns.google/resolve?name=mytarotonline.xyz&type=NS)

公开页面的文本核查副本位于本地 `research/hosting-*.txt`。它们只是研究记录，不属于发布站点的必需文件。
