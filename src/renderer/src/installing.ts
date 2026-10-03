import { api } from './store'

/**
 * 正在进行的安装或移除。放在组件外面，这样离开这一页它也不会丢；
 * 「插件」页的「市场」和「已安装」两边共用同一个，谁在装都看得到。
 */
export const installing = {
  label: undefined as string | undefined,
  lines: [] as string[],
  listeners: new Set<() => void>(),
  set(label: string | undefined, lines: string[]) {
    this.label = label
    this.lines = lines
    for (const listener of this.listeners) listener()
  }
}
api.onPackageLine((line) => {
  if (installing.label) installing.set(installing.label, [...installing.lines.slice(-5), line])
})
