import type { Conv } from './store'

export interface UsageView {
  cost: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  toolCalls?: number
  contextTokens?: number | null
  contextWindow?: number
}

/** 这个对话的用量：进程在跑时用它报的实时数字，否则用会话文件里算出来的 */
export function usageOf(conv: Conv, windowOf: (provider?: string, id?: string) => number | undefined): UsageView | undefined {
  if (conv.stats) {
    const s = conv.stats
    return { cost: s.cost, ...s.tokens, toolCalls: s.toolCalls, contextTokens: s.contextUsage?.tokens, contextWindow: s.contextUsage?.contextWindow }
  }
  if (conv.fileUsage) {
    const model = conv.info.model
    return { ...conv.fileUsage, contextTokens: conv.contextTokens, contextWindow: model?.contextWindow ?? windowOf(model?.provider, model?.id) }
  }
  return undefined
}

/** 上下文用了百分之几；算不出来时是 undefined */
export function contextPercent(usage: UsageView | undefined): number | undefined {
  return usage?.contextTokens != null && usage.contextWindow ? (usage.contextTokens / usage.contextWindow) * 100 : undefined
}
