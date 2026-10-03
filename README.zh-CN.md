<p align="center">
  <img src="build/icon.png" alt="Pi Desktop" width="96">
</p>

<h1 align="center">Pi Desktop</h1>

<p align="center">
  <a href="https://github.com/earendil-works/pi">pi</a> 的桌面端。pi 是一个极简、可扩展的 AI Agent。<br>
  它能做的都摆到台前，你没加的一样不多。
</p>

<p align="center">
  <a href="https://github.com/sedifr/pi-desktop/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/sedifr/pi-desktop"></a>
  <a href="https://github.com/sedifr/pi-desktop/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/sedifr/pi-desktop/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-lightgrey.svg">
</p>

<p align="center">
  <a href="https://github.com/sedifr/pi-desktop/releases/latest"><b>下载 macOS 版</b></a> ·
  <a href="docs/guide.zh-CN.md">使用指南</a> ·
  <a href="docs/features.zh-CN.md">全部功能</a> ·
  <a href="docs/design.zh-CN.md">为什么这样做</a> ·
  <a href="./README.md">English</a>
</p>

![Pi Desktop 里的一次对话，输入框上方是用户自己加的按钮](docs/screenshots/main.png)

Pi Desktop 是 pi 的一个非官方窗口。它用的就是 pi 自己的会话和设置，所以和 pi 命令行完全共用；应用自带一份 pi，不用另外装任何东西。

pi 是有意做小的：四个工具，一段很短的提示词，再加上你自己选择加的东西。这个应用让它保持这样。每个技能、MCP 服务、工具都是一个看得见的开关；界面没有主题，也没有你没放过的按钮。

截图里的界面是英文的，应用可以在「设置 → 通用」里换成中文。

## 安装

到[最新发布](https://github.com/sedifr/pi-desktop/releases/latest)里下载 `.dmg`，把 **Pi Desktop** 拖进「应用程序」。需要 Apple 芯片的 Mac、macOS 13 或更新。

安装包没有 Apple 的签名，第一次打开时 macOS 会拒绝。打开「系统设置 → 隐私与安全性」点「仍要打开」，或者运行：

```bash
xattr -dr com.apple.quarantine "/Applications/Pi Desktop.app"
```

然后添加一个项目文件夹，到「设置 → 模型」里连接模型。已经在用 pi 命令行的话，原有的会话、模型、技能和 MCP 服务一打开就在。其余的见[使用指南](docs/guide.zh-CN.md)。

想自己构建？见[从源码运行](#从源码运行)。

## 能做什么

### 每次对话自己组装

![一次对话的技能，每个是一张带一句简介的卡片](docs/screenshots/skills.png)

- **卡片，不是菜单**——技能、MCP 服务、工具全部平铺，每个带一句用你自己的话写的简介。
- **自动、开、关**——只对这次对话、对一个项目，或者对全部生效。
- **最精简**——点一下，回到 pi 自带的四个工具。
- **权限档位**——只读、可改文件、完全访问。
- **插件**——浏览 pi 的包目录，或者从 npm、git、本机文件夹安装。

### 和 pi 对话

- **所有会话，按项目归类**——和命令行共用；`⌘K` 搜索对话里说过的每一句话。
- **看得见它在干活**——思考实时滚动，工具显示最新输出，底部一行让你分得清是在想还是卡住了。
- **指挥、排队、修改、重新生成**——被换掉的那几轮留在会话里，是另一条分支。
- **`/` 指令、`@` 文件、`!` 命令**——还可以引用回答里的几段话逐段回复。
- **附上文档**——PDF、Word、PPT、Excel 先变成文字，再交给 pi 读。

### 对话旁边

- **右侧面板**——项目里的文件、没提交的改动、会把网页缩到面板宽度的浏览器、终端。
- **模型和用量**——订阅账号、API Key、兼容接口；费用和上下文占比一眼可见。
- **还有**——生成过的图片集中在一页、能看 AI 开的子代理、多窗口、做完发通知。

### 自己定界面

| | |
|---|---|
| ![设置：自己的按钮和它们放在哪](docs/screenshots/layout.png) | ![同一个对话，铺了背景图，颜色从图里取](docs/screenshots/appearance.png) |

- **自己的按钮**——六个位置可以放；一句话、一个技能、一条命令、界面上的一个功能，或者切换模型。
- **自己的外观**——背景图、强调色、色调、配色文件、样式文件。
- **每个部件都能藏起来**——对话列表和图标列还可以换到另一边。
- **让 pi 来改**——全是普通文件，pi 改完当场生效。

每一项的细节：[docs/features.zh-CN.md](docs/features.zh-CN.md)。

## 为什么这样做

小巧的 Agent 往往就是在套上窗口之后变重的。所以这个应用守着一条规矩：**它不往 pi 身上加任何东西；一次对话带着的每一样，都是你自己放上去的，看得见，也拿得下来。** 一个开关就是 pi 自己的一个启动参数，上下文只花在值得的地方，界面交给你，就像 pi 把 Agent 交给你一样。

理由和数字见 [docs/design.zh-CN.md](docs/design.zh-CN.md)。

## 从源码运行

需要 macOS 和 Node.js 22.19 或更新。

```bash
git clone https://github.com/sedifr/pi-desktop.git
cd pi-desktop
npm install
npm run build
npx electron .
```

`npm run dev` 带热更新运行，`npm run pack` 打包出 `Pi Desktop.app`。代码怎么组织、怎样测试才不会碰到自己的 pi 数据、怎么发版，见 [CONTRIBUTING.md](CONTRIBUTING.md)（英文）。

## 文档

- [使用指南](docs/guide.zh-CN.md)——第一次使用、项目信任、快捷键、数据存在哪
- [全部功能](docs/features.zh-CN.md)——应用能做的每一件事
- [设计](docs/design.zh-CN.md)——为什么这样做
- [定制界面](resources/customize-guide.md)——按钮、样式、配色背后的文件（pi 拿到的就是这份，英文）
- [更新日志](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md) · [安全](SECURITY.md)

## 现状

早期版本，只支持 macOS。已知的限制：

- 安装包没有经过 Apple 公证，所以不能自己更新；「设置 → 关于 → 检查更新」会告诉你有没有新版本。
- Windows 和 Linux 没有测过。
- 界面上自带的部件可以藏起来，但还不能在几个位置之间挪。
- 应用只认 pi 的协议。想法是通用的，但给别的 Agent 用的适配层还没有。

## 许可证

[MIT](LICENSE)。和 pi 的作者没有关联——真正干活的是 pi。
