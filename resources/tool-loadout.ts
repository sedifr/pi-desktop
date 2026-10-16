// 桌面端每次启动 Pi 都带上的一个小扩展。
//
// Pi 1.3 起，接着一个旧对话时沿用对话里记下的那组工具，不再按这次的启动参数重新挑。
// 在桌面端里，用户可能在两次之间打开了某个扩展：它的工具注册上了，却因为旧对话里没有而不启用。
// 这里在对话开始时把它们补上，和新对话里「工具一注册就启用」是一个规矩。
// 内置工具（读文件、运行命令……）由启动参数里的 --tools +名字 / --exclude-tools 管，这里不碰。
//
// 只补「整个扩展都不在那组里」的：一个扩展只要有工具还在，说明这个对话一直带着它，
// 它别的工具没开是有意的（扩展自己收起的，或者本来就不默认启用），不去动。
// 这个扩展排在所有扩展的最前面，别的扩展要在 session_start 里收起自己的工具，排在后面照样收得起来。

type Tool = { name: string; exposure?: string; sourceInfo?: { source?: string; path?: string } }

const nameOf = (tool: string | { name: string }): string => (typeof tool === 'string' ? tool : tool.name)

export default function (pi: any) {
  pi.on('session_start', (_event: unknown, ctx: any) => {
    // 新对话里工具已经按注册的规矩启用了，用不着补
    const entries: { type?: string }[] = ctx?.sessionManager?.getBranch?.() ?? []
    if (!entries.some((entry) => entry.type === 'message')) return
    const active = new Set<string>(pi.getActiveTools().map(nameOf))
    const byExtension = new Map<string, Tool[]>()
    for (const tool of pi.getAllTools() as Tool[]) {
      if (tool.sourceInfo?.source === 'builtin') continue
      const from = tool.sourceInfo?.path ?? tool.name
      byExtension.set(from, [...(byExtension.get(from) ?? []), tool])
    }
    let added = false
    for (const tools of byExtension.values()) {
      if (tools.some((tool) => active.has(tool.name))) continue
      for (const tool of tools) {
        if (tool.exposure !== 'direct' && tool.exposure !== 'model-only') continue
        active.add(tool.name)
        added = true
      }
    }
    if (added) pi.setActiveTools([...active])
  })
}
