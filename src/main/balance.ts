import type { BalanceInfo, BalanceState } from '@shared/types'
import { readBalances } from './accounts'
import { getConfig } from './config'

let state: BalanceState | undefined
let running: Promise<BalanceState | undefined> | undefined
/** 每家今天提醒过没有（日期），一天最多一次 */
const alerted = new Map<string, string>()

export const balanceState = (): BalanceState | undefined => state

/** 现查一遍余额。查完通知界面；低于提醒线的，每家每天提醒一次 */
export function refreshBalances(onUpdate: (state: BalanceState) => void, onLow: (info: BalanceInfo) => void): Promise<BalanceState | undefined> {
  running ??= readBalances()
    .then((items) => {
      state = { items, at: Date.now() }
      onUpdate(state)
      checkAlerts(onLow)
      return state
    })
    .catch((error) => {
      console.warn('[pi-desktop] balance check failed:', error)
      return state
    })
    .finally(() => (running = undefined))
  return running
}

export function checkAlerts(onLow: (info: BalanceInfo) => void): void {
  const alerts = getConfig().balanceAlerts ?? {}
  const today = new Date().toDateString()
  for (const item of state?.items ?? []) {
    const line = alerts[item.provider]
    if (line === undefined || item.amount === undefined || item.amount >= line) continue
    if (alerted.get(item.provider) === today) continue
    alerted.set(item.provider, today)
    onLow(item)
  }
}
