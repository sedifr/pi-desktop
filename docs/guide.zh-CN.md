# 使用 Pi Desktop

[English](./guide.md)

装好之后用得到的东西：第一次怎么用、项目信任是怎么回事、决定界面长相的那几个文件、快捷键，以及数据都存在哪。应用能做什么见 [features.zh-CN.md](features.zh-CN.md)，为什么这样做见 [design.zh-CN.md](design.zh-CN.md)。

## 第一次使用

1. **添加项目文件夹。** 点侧栏「项目」旁边的 `+`，选择要让 pi 工作的文件夹。
2. **连接模型。** 打开「设置 → 模型」，选一个提供商，登录或者粘贴 API Key。出现绿点就是可用。
3. **开始对话。** 在底部输入框里打字，按回车发送。Shift+回车换行。
4. **选择技能和工具。** 点聊天区左边那列里的图标（技能、MCP、工具）。改动只影响当前对话，从下一条消息起生效。
5. **把反复要说的话存下来。** 打开「设置 → 快捷指令」，写一次，以后用 `/名字` 调出来；或者在「设置 → 布局」里把它做成一个按钮。

如果你已经在用 pi 命令行，原有的会话、模型、技能和 MCP 服务会直接出现。

## 更新

应用不会自己更新。「设置 → 关于 → 检查更新」会告诉你有没有新版本；下载后替换掉旧的应用即可，用 Homebrew 装的运行 `brew upgrade --cask pi-desktop`。会话和设置都在 `~/.pi/agent/` 里，更新不会动它们。

## 项目信任

pi 只在你信任一个文件夹之后，才加载它自带的配置（`.pi/skills`、`.pi/prompts`、`.pi/extensions`、`.pi/mcp.json` 等）。项目里有这些文件、又没有存过决定时，输入框上方会出现提示。点「信任并加载」会把决定记到 pi 的 `~/.pi/agent/trust.json`，和命令行用的是同一份。之后可以在标题栏的 `···` 菜单里改。项目里的扩展能在你的电脑上运行代码，所以只信任你清楚来源的项目。

## 自己定界面

决定界面长相的东西，都是 `~/.pi/agent/desktop/` 里的普通文件：

| 文件 | 管什么 |
|---|---|
| `buttons.json` | 自己的按钮：放在哪、叫什么、按下去做什么 |
| `custom.css` | 任何外观上的改动：颜色、字体、间距，把部件藏起来或挪位置 |
| `skins/*.json` | 整套配色，浅色、深色各一版 |

可以在「设置 → 外观」「设置 → 布局」里改，可以手改，也可以直接告诉 pi 想要什么：「设置 → 布局 → 让 Pi 来改」会开一个对话，并把写给 pi 看的说明交给它。应用盯着这些文件，改完当场生效，所有窗口都跟上。文件怎么写，见 [`resources/customize-guide.md`](../resources/customize-guide.md)（pi 拿到的就是这一份）。

这些改动不会把界面弄坏：写错的按钮会被跳过并报出来，配色文件只认颜色的写法，挑的颜色太浅太深会自动调到认得清，菜单栏「显示 → 恢复默认外观」一下回到原样。

## 快捷键

| 按键 | 作用 |
|---|---|
| `⌘N` | 新对话 |
| `⌘⇧N` | 新窗口 |
| `⌘O` | 添加项目文件夹 |
| `⌘,` | 设置 |
| `⌘K` | 搜索对话 |
| `⌘F` | 在当前对话里查找 |
| `⌘B` | 显示或隐藏侧栏 |
| `⌥⌘B` | 显示或隐藏右侧面板 |
| `⌘/` | 打开快捷指令 |
| `⌘⇧M` | 切换模型 |
| `⌘⇧C` | 复制上一条回答 |
| `⌘.` 或 `Esc` | 停止正在进行的回答 |
| `Enter` / `⇧Enter` | 发送 / 换行 |
| 开头打 `!` / `!!` | 直接运行命令（输出带给 / 不带给 pi） |
| `⌥Enter` | 正在回答时：等全部做完再处理这条 |

## 数据存在哪

| 内容 | 位置 |
|---|---|
| 会话、登录凭证、模型、技能、MCP 配置 | pi 自己的目录 `~/.pi/agent/` |
| 快捷指令（提示词模板） | `~/.pi/agent/prompts/`，或项目里的 `.pi/prompts/` |
| 项目信任的决定 | `~/.pi/agent/trust.json` |
| MCP 服务 | `~/.pi/agent/mcp.json` |
| 技能、MCP、工具的开关 | `~/.pi/agent/desktop/capabilities.json` |
| 界面上显示的一句话简介 | `~/.pi/agent/desktop/summaries.json` |
| 应用设置 | `~/.pi/agent/desktop/config.json` |
| 只在本应用里加载的扩展 | `~/.pi/agent/desktop/extensions/` |
| 背景图（拷进来的那一份） | `~/.pi/agent/desktop/wallpaper/` |
| 自己的配色文件 | `~/.pi/agent/desktop/skins/*.json` |
| 自己写的样式 | `~/.pi/agent/desktop/custom.css` |
| 自己的按钮 | `~/.pi/agent/desktop/buttons.json` |
| 给 pi 看的「怎么改界面」的说明（每次用到时重新生成） | `~/.pi/agent/desktop/CUSTOMIZE.md` |

应用里的开关不会改 pi 自己的 `settings.json`，所以不影响命令行。登录和添加模型会改 pi 的 `auth.json` 和 `models.json`，因为这两份是共用的。

### 给出图工具的作者

工具结果的 `details.path` 里写着图片存到了哪（`details.prompt` 里可以带上生成要求），「图片」页就能找到这张图。用户指定了统一存图的文件夹时，应用会通过环境变量 `PI_DESKTOP_IMAGE_DIR` 告诉 pi，设置了就请存到那里。

## 工作原理

每个对话背后是一个 `pi --mode rpc` 子进程。应用通过 pi 的 JSON 协议和它通信，并把开关翻译成 pi 的启动参数。登录和模型管理用的是 pi 的 SDK。

应用用 Electron、React 和 TypeScript 写，用 electron-vite 构建。自带的 pi 版本写死在 `package.json` 里。要换成更新的 pi：改版本号，运行 `npm install`，再确认对话还能正常进行。

界面有简体中文和英文两种语言（「设置 → 通用」）。

## 自己打包

`npm run pack` 会在 `release/mac-arm64/` 里得到 `Pi Desktop.app`；`npm run dist` 另外再出一个 `.dmg` 和一个 `.zip`。应用只做了本机签名，拷到别的 Mac 上要先在「系统设置 → 隐私与安全性」里放行一次。项目要是放在 iCloud 云盘同步的文件夹里（桌面和文稿常常是），签名会因为同步加上的文件属性而失败，换个地方打包：`npm run pack -- -c.directories.output=/tmp/pi-desktop-release`。
