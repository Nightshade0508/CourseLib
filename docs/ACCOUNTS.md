# 开启账号与云端同步

网站的账号功能用的是 Google 的 [Firebase](https://firebase.google.com/)：它负责注册登录（邮箱密码、Google 账号）、发验证和重置密码的邮件，并在云端保存每个账号的内容。免费额度对个人网站足够，不需要绑定信用卡。

没有配置之前，网站和以前完全一样：没有「登录 / 注册」入口，内容只保存在访客自己的浏览器里。按下面做一次（大约 10 分钟），账号功能就打开了。

## 一、创建 Firebase 项目

1. 打开 <https://console.firebase.google.com/>，用 Google 账号登录，点 **创建项目**（Create a project）。
2. 项目名随意（例如 `courselib`）。「Google Analytics」可以关掉。点创建，等它完成。

## 二、打开登录方式

1. 左侧菜单 **Build → Authentication**，点 **Get started**。
2. 在 **Sign-in method** 页：
   - 点 **Email/Password**，打开第一个开关（Enable），保存。
   - 点 **Add new provider → Google**，打开开关，选一个「支持邮箱」（就是你自己的邮箱），保存。
3. 切到 **Settings → Authorized domains**，点 **Add domain**，填 `nightshade0508.github.io`。
   （以后如果换了域名，把新域名也加进来，否则登录会提示「这个网址还没有加入授权域名」。）

## 三、创建数据库并设置安全规则

1. 左侧菜单 **Build → Firestore Database**，点 **Create database**。
2. 位置选离你近的（例如美国选 `nam5`，亚洲选 `asia-east1`）；模式选 **Start in production mode**。
3. 创建好之后，切到 **Rules** 页，把里面的内容全部换成仓库里 [`firebase/firestore.rules`](../firebase/firestore.rules) 的内容，点 **Publish**：

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   这几行的意思是：每个账号只能读写自己名下的内容，别人（包括其他登录用户）一概不能。**这一步不能省**，它是数据安全的全部保障。

## 四、把项目配置填进网站

1. 点左上角齿轮 **Project settings → General**，拉到 **Your apps**，点网页图标 **`</>`**，随便起个名字注册（不用勾 Hosting）。
2. 页面会显示一段 `firebaseConfig`，像这样：

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy…",
     authDomain: "courselib-xxxxx.firebaseapp.com",
     projectId: "courselib-xxxxx",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "1:…:web:…"
   };
   ```

3. 把它填进 [`public/config.js`](../public/config.js) 的 `firebase:` 后面（只需要 `apiKey`、`authDomain`、`projectId`、`appId` 四项，多填无妨），提交并推送。部署完成后，侧栏底部就会出现「登录 / 注册」。

   最省事的做法：把这段 `firebaseConfig` 发给 Claude，让它填好并推送。

### 关于「API Key 泄露」的提醒邮件

`apiKey` 提交到公开仓库后，GitHub 或 Google 可能会发邮件说「检测到公开的 Google API Key」，推送时 GitHub 也可能拦一下（和之前那次误报一样，点邮件或提示里的链接放行即可）。这是正常现象：**Firebase 网页应用的这几个值本来就是公开的**，任何访客都能在网页源码里看到，它们只是「这是哪个项目」的标识。保护数据的是第三步的安全规则和第二步的授权域名。

想更稳妥，可以到 [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)，点开那个「Browser key」，在 **Website restrictions** 里只允许 `https://nightshade0508.github.io/*` 和 `https://<你的项目>.firebaseapp.com/*`。

## 五、验证

1. 打开网站，点「登录 / 注册」，用邮箱注册一个账号，添加一篇文档。
2. 换一个浏览器（或手机）登录同一个账号，文档应该已经在了。
3. 试一次「用 Google 账号继续」。**这一项在开发环境里无法自动测试**（需要连到 Google 的服务器），所以上线后请亲手点一次；如果弹出窗口后报错，多半是第二步的授权域名没加。

可选：在 **Authentication → Templates** 里把邮件模板的语言改成中文、改一下发件人名称。

## 它是怎么工作的

- **先本地，后云端**：内容总是先存进这台设备的浏览器（离线也能读、能标注），再在后台上传。侧栏的账号卡片显示状态：「已同步」「有 N 项待同步」「离线 · 联网后自动同步」。
- **同步什么**：读物和译文、文件夹、标注和笔记、生词本、阅读进度、学习模式的词汇量和统计。**不同步**：AI 密钥（只留在本机）、外观设置（主题、字号）。原文图片保存的是图片网址，不占空间。
- **多台设备同时改了同一处**：以改得晚的那次为准（按设备时钟）。
- **每个账号一个本地库**：同一个浏览器里，未登录时的内容和各个账号的内容互相分开。第一次登录时会问要不要把未登录时保存的内容放进账号。退出登录时可以选择「同时清除这台设备上的账号内容和 AI 密钥」（公用电脑建议勾选）。
- **删除账号**（账号卡片 → 密码与账号）会删除云端的全部内容和账号本身，无法恢复。
- 换设备的同步延迟：切回页面时立即同步，开着页面时每分钟检查一次。

## 免费额度够用吗

Firebase 免费档（Spark）目前的额度：数据库 1 GB 存储、每天 5 万次读取和 2 万次写入、每月 10 GB 流量；注册用户数基本不限。一篇带译文的长文约 0.2–0.5 MB，所以 1 GB 大约能放两三千篇。超出当天额度时，同步会暂停并在第二天自动恢复，本机内容不受影响。免费档不绑卡就不会产生费用。用量可以在 Firebase 控制台的 **Usage** 页看到。

## 需要知道的限制

- **中国大陆**：Firebase 的服务器在大陆通常连不上，账号和同步需要代理；不登录时的全部功能不受影响。
- 单条记录超过约 0.95 MB 不会同步（云端单条上限 1 MB）。正常的文档会被切成小块保存，不会碰到这个上限；账号卡片上会提示「N 项太大未同步」。
- 修改密码通过「发送重置邮件」完成；在别处改了密码后，其他设备会提示「登录已过期」，重新登录即可，本机内容不会丢。

## 本地试用（不需要 Firebase 项目）

需要 Node.js 和 Java 21 以上：

```bash
npm run emulators       # 终端一：启动 Firebase 本地模拟器（账号 + 数据库）
npm run dev:accounts    # 终端二：http://localhost:8080 ，网站连到模拟器
```

模拟器里的账号和数据在它退出后就没有了。`npm test` 里的账号测试用的就是它。
