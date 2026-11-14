# Parallel Text Library · 中英对照阅读库

上传 PDF / Word、粘贴英文文章，或者直接给一个文章网址，自动生成逐段中英对照译本；支持高亮标注、选词查词、生词本（间隔复习）、AI 解释段落、学习卡片、MLA 引用，以及在浏览器里本地运行的 Kokoro 朗读。登录账号后，内容在设备之间自动同步。

常用操作：<kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> 搜索读物、跳转和执行命令；<kbd>N</kbd> 新建（上传、粘贴、从网址导入）；<kbd>F</kbd> 专注模式；工具栏「Aa」调字号、行距、栏宽和字体；侧栏「⋯ → 导出备份」把全部数据存成一个 JSON 文件，换设备时「从备份恢复」。上传文档后会先显示预计字数和费用，确认后才开始翻译（很短的粘贴文本直接翻译）。

最初是一个 claude.ai Artifact，这个仓库把它变成了任何人都能打开的独立网站：

- **AI 功能用访客自己的账号**：登录后，翻译、查词、学习卡片等调用的 token 直接从访客自己的账号扣费，站长不承担任何费用。
- **纯静态网站**：没有后端服务器，可以免费部署在 GitHub Pages、Cloudflare Pages、Vercel、Netlify 等任何静态托管上。
- **数据先存本地**：文档、标注、生词、阅读进度保存在访客浏览器的 IndexedDB 里，离线也能用。
- **账号与云端同步（可选）**：站长配置 Firebase 之后，访客可以用邮箱或 Google 账号注册登录，内容自动同步到云端，换设备接着读。见 [docs/ACCOUNTS.md](docs/ACCOUNTS.md)。

## 免费翻译（不需要登录）

不登录也能完整使用：上传或粘贴后选「免费」，翻译在访客自己的浏览器里完成，不经过任何服务器、不花钱。

| 浏览器 | 用什么翻译 | 首次使用 |
| --- | --- | --- |
| Chrome / Edge 桌面版 | 浏览器内置的 Translator API（本机运行） | 浏览器自动下载语言包 |
| Safari、Firefox、手机等 | 开源模型 [opus-mt-en-zh](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh)，用 transformers.js 在后台线程运行 | 从本站下载约 113 MB（模型文件在仓库的 `public/models/` 里，不依赖 Hugging Face），之后缓存在浏览器里 |

免费查词用 [dictionaryapi.dev](https://dictionaryapi.dev/)（Wiktionary 释义、音标），中文释义来自上面的免费翻译。免费译文比 AI 生硬，文档菜单里可以「用 AI 重新翻译全文」。扫描版 PDF 的文字识别需要 AI 账号。

## 从网址导入

「新建 → 从网址导入」（或在 ⌘K 里搜「网址」，或者把网址直接贴进「粘贴文章」）：粘贴一篇英文文章的网址，网站读取正文、分段，然后和上传的文档一样翻译。

- **保留原文图片**：勾选后，文章里的图片会出现在对应位置。图片是引用原网站的地址（不复制、不占空间），所以原网站删图后这里也看不到了；加载失败的图片会自动隐藏。每张图片可以单独删除（鼠标移到图片上，点右侧的 ⋯）。
- 标题、作者从网页读取；文末的参考文献会保留但不翻译；标题下方有回到原文的链接。
- 网页正文由 [Jina Reader](https://jina.ai/reader/) 读取（免费，不需要密钥，每位访客每分钟约 20 篇）：访客的浏览器把网址发给它，它返回正文。需要登录或付费才能看的页面、禁止抓取的网站读不到，这时请把正文复制下来用「粘贴文章」。要换成别的读取服务，改 `public/app/import-url.js` 顶部的 `READER`。

## 账号与云端同步

默认关闭。按 [docs/ACCOUNTS.md](docs/ACCOUNTS.md) 创建一个免费的 Firebase 项目、把配置填进 `public/config.js` 之后，侧栏底部会出现「登录 / 注册」：

- 邮箱 + 密码注册登录、用 Google 账号登录、忘记密码、邮箱验证、退出、删除账号。
- 读物和译文、文件夹、标注、生词本、阅读进度、学习模式设置自动同步；AI 密钥和外观设置只留在本机。
- 内容先存本机再上传，离线照常使用，联网后自动补传；多台设备改了同一处时以较晚的修改为准。
- 每个账号的内容只有本人能读写（规则在 `firebase/firestore.rules`）。

## 句子对齐与学习模式

- **句子对齐**：鼠标指向一句英文，对应的中文句子会一起高亮（反过来也一样；触屏上点一下）。分句和对齐都在浏览器里完成，用的是按句子长度的 Gale–Church 对齐，对已有的任何译文都有效，不需要重新翻译。可在「Aa」里关闭。
- **学习模式**（工具栏「学」）：先读英文，需要时再看中文。
  - 「读得懂的」（默认）：按你的词汇量判断每段的难度，只遮住你大概能读懂的段落；生词多或句子很长的段落照常显示中文。超出词汇量的词加虚线下划线，双击可以查。生词本里还没学会的词（复习不到第 4 箱）也算生词。
  - 「全部」：遮住所有中文。
  - 被遮住的中文点一下才显示。网站会统计你每周读了多少段、其中多少没看中文（「Aa」面板里能看到）。打开「根据阅读自动调整」后，每读完 20 段被遮住的段落：几乎没点开过（≤5%）就把词汇量估计调高 1000，经常点开（≥30%）就调低 1000。
  - 词汇量判断用 `public/data/en-words.txt`：英语最常用的 4 万个词形，按 [wordfreq](https://github.com/rspeer/wordfreq) 的词频排序（数据为 CC BY-SA 4.0），由 `scripts/make-wordlist.py` 生成。

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
npm run dev          # 构建公开版并在 http://localhost:8080 预览（不需要先 npm install）
npm run dev:all      # 构建包含全部内置读物的个人版（见下文「内置读物」）
npm install          # 跑测试、或重新打包第三方库之前需要
npm test             # 全部测试：单元测试 + 浏览器测试
```

直接用浏览器打开 `public/index.html` 不行（模块和数据需要通过 HTTP 加载），请用 `npm run dev`。

## 测试

每次推送到 `main`，GitHub Actions 先跑全部测试，**通过了才部署**；有测试失败，线上网站保持原样，Actions 页面会给出失败的测试和截图。

```bash
npm run test:unit    # 单元测试（几秒）：句子对齐、词频、网页解析、同步引擎、模块检查
npm run test:e2e     # 浏览器测试（约 1 分钟）：真的打开网站点一遍
```

- **单元测试**（`tests/unit/`）针对不碰页面的纯逻辑。其中 `modules.test.mjs` 是静态检查：每个 import 的名字都存在、没有用到未声明的名字、没有给 import 进来的变量赋值、模块的加载顺序链完整。
- **浏览器测试**（`tests/e2e/`，Playwright）在真实浏览器里走主要流程：粘贴 / 上传 / 网址导入并翻译、免费翻译、标注、生词本、阅读设置、句子对齐、学习模式、备份恢复、账号注册登录和双设备同步等。任何未捕获的页面错误都会让测试失败。
- 测试不访问外网：AI 接口、网页读取服务、字体都是模拟的；账号测试用 Firebase 官方的本地模拟器（需要 Java 21+，第一次运行会自动下载），连安全规则一起测。
- 第一次在自己电脑上跑浏览器测试前：`npx playwright install chromium`。

## 目录结构

```
public/                  网站本体，原样复制到 dist/
  index.html             页面骨架（HTML 和图标），不含逻辑
  config.js              站点设置：账号功能的 Firebase 配置（默认关闭）
  css/*.css              样式，按功能分文件
  app/*.js               应用逻辑，一个功能一个文件（ES 模块）；main.js 是入口
  app/lib/*.js           不碰页面的纯逻辑（句子对齐、词频、网页解析、估算），有单元测试
  runtime/*.js           AI 账号与调用、IndexedDB 数据库、备份、免费翻译、站点账号与同步
  runtime/lib/sync-core.js   同步引擎（纯逻辑，有单元测试）
  vendor/                第三方库（Anthropic SDK、Firebase SDK、transformers.js、mammoth）
  models/                免费翻译模型 opus-mt-en-zh（约 113 MB，访客按需下载）
  data/en-words.txt      英语词频表（学习模式用）
  pdfjs/                 PDF 文字提取
  kokoro/                Kokoro-82M v1.1 本地朗读模型（约 220 MB，访客按需下载）
content/
  library.json           内置文件夹和读物清单；"public": true 的才会发布
  docs/*.json            内置读物正文（已排好的中英对照 HTML；不提交到仓库）
firebase/firestore.rules 云端数据库的安全规则（每个账号只能读写自己的内容）
firebase.json            本地 Firebase 模拟器的配置（测试用）
docs/ACCOUNTS.md         开启账号功能的步骤
tests/unit/              单元测试（node --test）
tests/e2e/               浏览器测试（Playwright）
scripts/
  build.mjs              生成 dist/（公开版；--all 生成个人版），并给页面加上模块预加载
  serve.mjs              本地静态服务器（--emulators：连本地 Firebase 模拟器）
  vendor-*.mjs           把第三方库打包进 public/vendor/
  fetch-mt-model.mjs     下载并切分免费翻译模型
.github/workflows/deploy.yml   推送到 main 后：先测试，通过再部署到 GitHub Pages
```

### 代码是怎么组织的

应用原来是一个 5000 多行的 `index.html`，现在拆成了约 60 个小文件，每个文件开头列出它用到了别的文件的哪些东西（`import`），所以改一个功能只需要看那一两个文件。

`public/app/` 里的文件仍然按原来的先后顺序运行：每个文件的第一行 `import './上一个文件.js'` 就是这条顺序链，`main.js` 引入最后一个（`boot.js`），于是全部按序执行。新增一个「加载时就要干活」的文件时，把它接进这条链；只导出函数的纯逻辑放进 `app/lib/`，不用排队。一个文件要修改另一个文件里的变量时，调用那个文件导出的 `setXxx()`（模块的 import 是只读的）。这些约定都有单元测试看着。

## 内置读物

公开网站**不带任何示例读物**，只有一个空的「我的读物」文件夹，访客自己添加文档。仓库里也不提交任何读物（`.gitignore` 忽略了 `content/docs/`），因为课程读物大多受版权保护。

如果想做一个自带读物的版本：在 `content/library.json` 的 `docs` 里登记读物，把对应的 JSON 放进本地的 `content/docs/`，然后 `npm run dev:all`。

## 部署

### GitHub Pages（已配置）

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. 推送到 `main`，Actions 会先跑测试，通过后自动构建并发布到 `https://nightshade0508.github.io/CourseLib/`。

### Cloudflare Pages / Vercel / Netlify

导入这个仓库，设置：

- Build command：`node scripts/build.mjs`
- Output directory：`dist`

OpenRouter 登录会回调到网站当前地址，部署在任何域名下都能用，不需要额外配置。开了账号功能的话，要把新域名加进 Firebase 的授权域名（见 [docs/ACCOUNTS.md](docs/ACCOUNTS.md)）。

## 常见维护

- **修改默认模型**：`public/runtime/ai-account.js` 里的 `PROVIDERS`。访客也可以在「AI 账号」里自己改。
- **更新免费翻译模型**：`node scripts/fetch-mt-model.mjs` 从 Hugging Face 重新下载并切分成 ≤20 MB 的分片（有的静态托管限制单文件 25 MB），提交 `public/models/`。
- **升级免费翻译模型的运行库**：改 `package.json` 里 `@huggingface/transformers` 的版本，`npm install && npm run vendor:mt`，提交 `public/vendor/transformers/`。模型名在 `public/runtime/mt-worker.js`。
- **升级 Anthropic SDK**：改 `package.json` 里的版本，`npm install && npm run vendor:sdk`，提交生成的 `public/vendor/anthropic-sdk.mjs`。
- **升级 Firebase SDK**：改 `package.json` 里 `firebase` 的版本，`npm install && npm run vendor:firebase`，提交 `public/vendor/firebase.mjs`，然后 `npm test`。
- **改界面或功能**：逻辑在 `public/app/`（一个功能一个文件，文件第一行注释说明它管什么），样式在 `public/css/`。应用通过 `window.claude.use('sample' | 'db' | 'downloads')` 和 `window.PTL` 使用 AI、存储、下载和账号，具体实现在 `public/runtime/`。改完跑 `npm test`。
- **package.json 里的 optionalDependencies**（Anthropic SDK、Firebase、transformers.js、esbuild）只在重新打包第三方库时用到；跑测试和部署都不需要它们（CI 用 `npm ci --omit=optional`）。

## 已知限制 / 后续可以做

- 账号同步用的 Firebase 在中国大陆通常需要代理；不登录时的功能不受影响。
- 「用 Google 账号登录」在开发环境里无法自动测试（需要连 Google 的服务器），配置好 Firebase 后请在线上亲手试一次。
- 网址导入读不到需要登录或付费的页面；原文图片是引用原网站的地址，不是副本。
- Anthropic 没有查询余额的公开接口，Anthropic Key 模式只显示本机累计 token 用量。
- 扫描版 PDF 的文字识别需要所选模型支持图片输入。

## 许可

Kokoro-82M 模型为 Apache-2.0；opus-mt-en-zh 为 CC BY 4.0；transformers.js 为 Apache-2.0，onnxruntime-web 为 MIT；Wiktionary 释义为 CC BY-SA；wordfreq 词频表为 CC BY-SA 4.0；pdf.js 为 Apache-2.0；mammoth 为 BSD-2-Clause；Anthropic SDK 为 MIT；Firebase JS SDK 为 Apache-2.0。
