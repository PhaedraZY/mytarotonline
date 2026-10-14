# 78 张经典牌面与中文牌义

核查日期：2026-10-14。牌组 ID：`rws-classic`，数据版本：`2`。

项目接入的是完整 Rider–Waite–Smith 体系：22 张大阿卡纳，加权杖、圣杯、宝剑、星币各 14 张。遵循力量 VIII、正义 XI 的 RWS 编号。所有牌沿用 `data/deck-catalog.json` 的 canonical ID；牌名和原始 ID 没有重命名。

## 图片来源与权利记录

全部图片取自 Wikimedia Commons 的 [Rider-Waite-Smith tarot deck (TaionWC) 分类](https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC))。实际核对该分类的 78 个文件，下载对应文件页面 `imageinfo` 提供的**原始 JPEG**，不是搜索结果缩略图，也不是现代再设计牌组。

绘图作者为 **Pamela Colman Smith（1878–1951）**，体系由 A. E. Waite 构建；来源页面将这批牌标注为 **1910 年的 Pam-A 牌面**。本地保留原文件像素和原始字节，并记录每张牌的源文件 SHA-1、本地 SHA-256、尺寸和下载日期。

所有 78 张文件的 Commons 元数据均将授权状态标注为 **Public domain**。来源使用 `PD-old-auto-expired` 一类模板；例如[愚人来源页](https://commons.wikimedia.org/wiki/File:RWS_Tarot_00_Fool.jpg)的许可说明使用 `deathyear=1942`，并说明 A. E. Waite 为当时版权持有人。项目同时保留真实绘图作者署名，不将画作误署名给 Waite。

`data/deck-sources.json` 为每张牌保存：

- `source`：Commons 文件说明页面，供逐张核查。
- `sourceFile`、`sourceTitle`、`commonsPageId`：原始下载地址与来源身份。
- `artist`、`artworkDate`、`credit`、`description`：来源提供的作品信息。
- `license`、`licenseCode`、`sourceLicenseCategories`：实际返回的授权标记。
- `width`、`height`、`bytes`、`sourceSha1`、`sha256`：原始文件校验信息。
- `originalImage`：保留的原始 JPEG；`image` 和 `displayAsset`：用于网页的 WebP 及其独立校验信息。

页面建议展示署名：**经典牌面：Pamela Colman Smith · Rider–Waite–Smith，1910；图源 Wikimedia Commons，公有领域。** 数据中的 Public Domain Mark 链接用于标识公有领域状态，不将其写成 CC0 或需要购买的商业素材许可。原作与现代重新上色、排版、包装的具体版本需要区分；本项目没有引入现代商业牌组的复刻包装或牌义书正文。对外销售时，应结合销售地区复核版权期限及后续加入的原创内容权利。

## 显示资产与映射

`public/assets/decks/rws/{cardId}.jpg` 为原始下载，保留用于审查和重新生成。`{cardId}.webp` 为浏览器实际显示版本：保持原始像素尺寸，使用 WebP quality 84 压缩；不裁切、不重绘、不改色。网页应读取 `cards.json` 的 `image` 字段，不假定扩展名。

映射根据 Commons 分类的实际文件名建立，并与现有目录逐项比较：

| 本地 ID | 原始文件对应规则 |
| --- | --- |
| `major-00` 至 `major-21` | `RWS Tarot NN English Name.jpg` |
| `wands-*` | `Wands01.jpg` 至 `Wands14.jpg` |
| `cups-*` | `Cups01.jpg` 至 `Cups14.jpg` |
| `swords-*` | `Swords01.jpg` 至 `Swords14.jpg` |
| `pentacles-*` | `Pents01.jpg` 至 `Pents14.jpg` |

小阿卡纳 `01` 对应 `ace`，`02` 至 `10` 保持两位数字，`11/12/13/14` 分别对应 `page/knight/queen/king`。原始图片保持正位方向；抽出的逆位由界面按抽牌结果旋转呈现，不额外生成第二套图。

## 原创中文牌义

`data/cards.json` 提供 78 个完整条目，每张包含中英文名、类别、花色、点数或宫廷阶级、图片路径，以及经典 RWS 画面象征。正位和逆位各有 3 个关键词、核心解释、日常生活／关系／工作场景、行动建议和反思问题。156 组正文为本项目独立撰写，使用通行 RWS 概念组织表达，**没有复制外部网站的整套牌义正文**。

这是一版可用于模型上下文的原创中文初稿，仍待专业塔罗顾问审校。它刻意保留多种解释空间：逆位可以是受阻、内化、过度或尚未整合，并非自动等于正位反义；宫廷牌描述特质和角色，不按性别或年龄锁定人物。

模型需要结合用户问题、真实抽到的牌与牌阵位置进行解读。不能因为牌名包含死神、高塔或宝剑十，就推断死亡、灾难或医疗结论；不能用牌面认定第三方的想法、背叛或必然未来。牌组作为娱乐、创作与自我反思的素材，不作为专业诊断的依据。

原创上传替换应按相同 canonical ID 关联图片，这样既能更换完整画风，也能延续经过验证的抽牌和牌义逻辑。视觉资产与模型解读数据不应耦合到固定文件名或某个 OC 主题。

## 复现与检查

```powershell
python scripts/deck-download.py
python scripts/deck-meanings.py
python scripts/deck-validate.py --build-webp --contact-sheets
```

下载器仅使用 Python 标准库；生成显示图和视觉校验图需要 Pillow。本机 Codex 自带 Python 已包含 Pillow，可以用其完整路径运行最后一个命令。下载器会核查 Commons 的授权元数据与原始文件校验，顺序节流请求并重试限速响应；已经校验通过的 JPEG 可以复用。

验证器会检查 78 张牌的 ID、顺序与中英文名称，逐张完整解码 JPEG 和 WebP、核查尺寸与 SHA-256、确认原始图片互不重复，并检查全部 156 段牌义。结果写入 `scripts/deck-validation.json`。

`scripts/deck-contact-{major|wands|cups|swords|pentacles}.jpg` 为带 canonical ID 与中文名称的视觉核对图，可直接检查图像和牌名映射。若重新执行牌义生成器，随后再次运行 `--build-webp` 可保证 `cards.json` 使用优化后的显示路径。

素材导入时实测：78 张原始 JPEG、78 张 WebP 均完整解码成功，78 个原始校验值全部匹配且互不重复；v2 的 156 组牌义齐全，核心正文长度为 127–147 字符，其余场景、建议和问题单独存储。原图共 66.36 MiB，显示图共 38.40 MiB，在保留全部像素尺寸的前提下减少约 42.1% 的传输体积。五张核对图已经逐页目视检查，图案、英文牌名、中文名称和 canonical ID 对应一致。
