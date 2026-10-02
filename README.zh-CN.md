# Pi Desktop

[English](./README.md)

[pi 编程 Agent](https://github.com/earendil-works/pi) 的非官方桌面端。它和 pi 用同一份本地配置和会话文件，所以对话、模型、技能、MCP 服务都和 pi 命令行共用。

> 状态：早期版本。只支持 macOS。还没有安装包，需要从源码运行。

## 能做什么

- **按项目管理对话**：本机所有 pi 会话，按项目文件夹归类。
- **干净的输入栏**：输入框里只有模型和发送按钮。下面一条小栏放项目、技能、MCP、工具。
- **决定一次对话能用什么**：每个技能、MCP 服务、工具都可以按对话开关，然后存成项目默认或全局默认。技能有三档：「自动」（模型自己判断要不要用）、「开」（一定带上）、「关」（模型看不到）。
- **用量一眼可见**：本次对话的费用、token、缓存命中率、上下文占比，以及今天和本月的合计。
- **模型**：订阅账号登录、填 API Key、添加 OpenAI 或 Anthropic 兼容的接口。每个提供商前面的圆点显示登录是否还有效。

## 环境要求

- macOS
- Node.js 22.19 或更新
- 不需要别的。应用自带一份 pi，不用另外安装 pi 命令行。

## 从源码运行

```bash
git clone https://github.com/sedifr/pi-desktop.git
cd pi-desktop
npm install
npm run build
npx electron .
```

开发时带热更新运行：

```bash
npm run dev
```

## 第一次使用

1. **添加项目文件夹。** 点侧栏「项目」旁边的 `+`，选择要让 pi 工作的文件夹。
2. **连接模型。** 打开「设置 → 模型」，选一个提供商，登录或者粘贴 API Key。出现绿点就是可用。
3. **开始对话。** 在底部输入框里打字，按回车发送。Shift+回车换行。
4. **选择技能和工具。** 用输入框下面的小栏。改动只影响当前对话，从下一条消息起生效。

如果你已经在用 pi 命令行，原有的会话、模型、技能和 MCP 服务会直接出现。

## 数据存在哪

| 内容 | 位置 |
|---|---|
| 会话、登录凭证、模型、技能、MCP 配置 | pi 自己的目录 `~/.pi/agent/` |
| 技能、MCP、工具的开关 | `~/.pi/agent/desktop/capabilities.json` |
| 界面上显示的一句话简介 | `~/.pi/agent/desktop/summaries.json` |
| 应用设置 | `~/.pi/agent/desktop/config.json` |
| 只在本应用里加载的扩展 | `~/.pi/agent/desktop/extensions/` |

应用里的开关不会改 pi 自己的 `settings.json`，所以不影响命令行。登录和添加模型会改 pi 的 `auth.json` 和 `models.json`，因为这两份是共用的。

## 工作原理

每个对话背后是一个 `pi --mode rpc` 子进程。应用通过 pi 的 JSON 协议和它通信，并把开关翻译成 pi 的启动参数。登录和模型管理用的是 pi 的 SDK。

自带的 pi 版本写死在 `package.json` 里。要换成更新的 pi：改版本号，运行 `npm install`，再确认对话还能正常进行。

## 已知限制

- 只支持 macOS，Windows 和 Linux 没有测过。
- 还没有安装包。
- MCP 的开关依赖 `pi-mcp-adapter` 扩展。

## 许可证

MIT。本项目和 pi 的作者没有关联。
