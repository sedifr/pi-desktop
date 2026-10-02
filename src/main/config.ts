import path from 'node:path'
import type { DesktopConfig } from '@shared/types'
import { DESKTOP_DIR, readJson, writeJson } from './env'

const CONFIG_FILE = path.join(DESKTOP_DIR, 'config.json')
const DEFAULTS: DesktopConfig = { extraSkillDirs: [] }

/** 桌面端自己的设置。默认是空的，所有可选功能都由用户自己决定要不要启用 */
export function getConfig(): DesktopConfig {
  const stored = readJson<Partial<DesktopConfig>>(CONFIG_FILE, {})
  return { ...DEFAULTS, ...stored, extraSkillDirs: Array.isArray(stored.extraSkillDirs) ? stored.extraSkillDirs : [] }
}

export function setConfig(patch: Partial<DesktopConfig>): DesktopConfig {
  const next = { ...getConfig(), ...patch }
  writeJson(CONFIG_FILE, next)
  return next
}
