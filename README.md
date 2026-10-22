# Parallel Text Library · 中英对照阅读库

上传 PDF / Word 或粘贴英文文章，自动生成逐段中英对照译本；支持高亮标注、选词查词、生词本（间隔复习）、AI 解释段落、学习卡片、MLA 引用，以及在浏览器里本地运行的 Kokoro 朗读。

最初是一个 claude.ai Artifact，这个仓库把它变成了任何人都能打开的独立网站：

- **AI 功能用访客自己的账号**：登录后，翻译、查词、学习卡片等调用的 token 直接从访客自己的账号扣费，站长不承担任何费用。
- **纯静态网站**：没有后端服务器，可以免费部署在 GitHub Pages、Cloudflare Pages、Vercel、Netlify 等任何静态托管上。
- **数据在本地**：文档、标注、生词、阅读进度保存在访客浏览器的 IndexedDB 里。

## AI 账号登录方式

| 方式 | 适合 | 计费 |
| --- | --- | --- |
| **OpenRouter 登录**（推荐） | 大多数人：一键 OAuth 登录，不用复制密钥 | 从访客的 OpenRouter 余额扣；可用 Claude、GPT、Gemini、DeepSeek 等 |
| **Anthropic API Key** | 已有 Anthropic Console 账户的人 | 从访客的 Anthropic 账户扣；默认 Claude Opus 5.5（快速任务用 Claude Haiku 5.5） |
| **OpenAI 兼容服务** | DeepSeek、Kimi、通义千问等 | 从对应服务商账户扣 |

密钥只存在访客自己的浏览器里，请求由浏览器直接发给对应的 AI 服务，不经过本站。

> 说明：claude.ai / ChatGPT 的**订阅**（Pro、Max、Plus）不能被第三方网站调用扣费，所以没有「用 Claude 账号登录」这一项。如果你希望别人用他们的 Claude 订阅额度，原来的 claude.ai Artifact 链接仍然可以继续分享使用。

## 本地开发

需要 Node.js 18+。

```bash
npm install          # 只在需要重新打包 Anthropic SDK 时用到
npm run dev          # 构建公开版并在 http://localhost:8080 预览
npm run dev:all      # 构建包含全部内置读物和课表的个人版
```

直接用浏览器打开 `public/index.html` 不行（模块和数据需要通过 HTTP 加载），请用 `npm run dev`。

## 目录结构

```
public/                  网站本体，原样复制到 dist/
  index.html             整个应用（HTML + CSS + JS，单文件）
  runtime/runtime.js     替代 claude.ai 运行时：AI 账号、IndexedDB 数据库、下载
  vendor/                第三方库（Anthropic SDK 打包版、mammoth）
  pdfjs/                 PDF 文字提取
  kokoro/                Kokoro-82M v1.1 本地朗读模型（约 220 MB，访客按需下载）
content/
  library.json           内置文件夹、读物清单、课表；"public": true 的读物才会发布
  docs/*.json            内置读物正文（已排好的中英对照 HTML）
scripts/
  build.mjs              生成 dist/（公开版；--all 生成个人版）
  serve.mjs              本地静态服务器
  vendor-sdk.mjs         把 @anthropic-ai/sdk 打包成 public/vendor/anthropic-sdk.mjs
.github/workflows/deploy.yml   推送到 main 后自动部署到 GitHub Pages
```

## 内置读物与版权

这个仓库是公开的，所以 `content/docs/` 里**只放公版作品**（华兹华斯、Tender Buttons、Micrographia、Gilbert White 日记、Marianne Moore 两首）。课程里受版权保护的读物（Foucault、Kuhn、Scott 等）的对照译本不提交到这里，只在原来的 claude.ai Artifact 里保留。

`content/library.json` 仍然列着所有读物，`"public": false` 的不会发布。想在本机生成包含全部读物的个人版：把那些读物的 JSON 放进 `content/docs/`（**不要提交**），然后 `npm run dev:all`。构建时找不到的读物会自动跳过。

课表（`schedule`）默认不发布；把 `includeSchedule` 改成 `true` 可以在公开版首页显示课表。

## 部署

### GitHub Pages（已配置）

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. 推送到 `main`，Actions 会自动构建并发布到 `https://nightshade0508.github.io/CourseLib/`。

### Cloudflare Pages / Vercel / Netlify

导入这个仓库，设置：

- Build command：`node scripts/build.mjs`
- Output directory：`dist`

OpenRouter 登录会回调到网站当前地址，部署在任何域名下都能用，不需要额外配置。

## 常见维护

- **添加公开示例读物**（只限公版或你有权公开的文本）：把 `xxx.json` 放进 `content/docs/`，在 `content/library.json` 的 `docs` 里加一条并设 `"public": true`。
- **修改默认模型**：`public/runtime/runtime.js` 顶部的 `PROVIDERS`。访客也可以在「AI 账号」里自己改。
- **升级 Anthropic SDK**：改 `package.json` 里的版本，`npm install && npm run vendor:sdk`，提交生成的 `public/vendor/anthropic-sdk.mjs`。
- **改界面或功能**：都在 `public/index.html`。页面通过 `window.claude.use('sample' | 'db' | 'downloads')` 使用 AI、存储和下载，具体实现在 `runtime.js`。

## 已知限制 / 后续可以做

- 数据只在当前浏览器；换设备不同步。以后可以接入 Supabase / Firebase 之类做账号同步。
- Anthropic 没有查询余额的公开接口，Anthropic Key 模式只显示本机累计 token 用量。
- 扫描版 PDF 的文字识别需要所选模型支持图片输入。

## 许可

Kokoro-82M 模型为 Apache-2.0；pdf.js 为 Apache-2.0；mammoth 为 BSD-2-Clause；Anthropic SDK 为 MIT。
