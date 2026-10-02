import path from 'node:path'
import type { DesktopConfig } from '@shared/types'
import { DESKTOP_DIR, readOwnJson, writeJson } from './env'

const CONFIG_FILE = path.join(DESKTOP_DIR, 'config.json')
const DEFAULTS: DesktopConfig = { extraSkillDirs: [], favoriteModels: [] }

/** 桌面端自己的设置。默认是空的，所有可选功能都由用户自己决定要不要启用 */
export function getConfig(): DesktopConfig {
  const stored = readOwnJson<Partial<DesktopConfig>>(CONFIG_FILE, {})
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  return { ...DEFAULTS, ...stored, extraSkillDirs: list(stored.extraSkillDirs), favoriteModels: list(stored.favoriteModels) }
}

export function setConfig(patch: Partial<DesktopConfig>): DesktopConfig {
  const next = { ...getConfig(), ...patch }
  writeJson(CONFIG_FILE, next)
  return next
}
