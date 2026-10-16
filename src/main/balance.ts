import type { BalanceInfo, BalanceState } from '@shared/types'
import { readBalances } from './accounts'
import { getConfig, setConfig } from './config'

let state: BalanceState | undefined
let running: Promise<BalanceState | undefined> | undefined
let queued: Promise<BalanceState | undefined> | undefined

export const balanceState = (): BalanceState | undefined => state

/**
 * 现查一遍余额。查完通知界面；低于提醒线的，每家每天提醒一次。
 * 正在查的时候又要查（比如刚登录了一家），等这次查完再查一遍，不拿登录前的旧结果凑数
 */
export function refreshBalances(onUpdate: (state: BalanceState) => void, onLow: (info: BalanceInfo) => boolean): Promise<BalanceState | undefined> {
  if (running) {
    queued ??= running.then(() => {
      queued = undefined
      return refreshBalances(onUpdate, onLow)
    })
    return queued
  }
  running = readBalances()
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

/** onLow 返回 false 表示没有窗口能显示（比如窗口都关了），这次不算提醒过 */
export function checkAlerts(onLow: (info: BalanceInfo) => boolean): void {
  const config = getConfig()
  const lines = config.balanceAlerts ?? {}
  const alerted = { ...config.balanceAlerted }
  const today = new Date().toDateString()
  let changed = false
  for (const item of state?.items ?? []) {
    const line = lines[item.provider]
    if (line === undefined || item.amount === undefined || item.amount >= line) continue
    if (alerted[item.provider] === today) continue
    if (!onLow(item)) continue
    alerted[item.provider] = today
    changed = true
  }
  if (changed) setConfig({ balanceAlerted: alerted })
}
