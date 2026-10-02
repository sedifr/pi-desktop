import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { TrustStatus } from '@shared/types'
import { AGENT_DIR, piPackageDir, readJson } from './env'

interface TrustModule {
  hasTrustRequiringProjectResources(cwd: string): boolean
  ProjectTrustStore: new (agentDir: string) => {
    getEntry(cwd: string): { path: string; decision: boolean } | null
    set(cwd: string, decision: boolean | null): void
  }
}

let loaded: Promise<TrustModule> | undefined
/** 信任记录直接用 Pi 自己的模块读写，文件格式、加锁、路径规范化都和命令行一致 */
function pi(): Promise<TrustModule> {
  loaded ??= import(/* @vite-ignore */ pathToFileURL(path.join(piPackageDir(), 'dist', 'core', 'trust-manager.js')).href)
  return loaded
}

/**
 * Pi 只在项目被信任后才加载它自带的配置（.pi 下的技能、指令、扩展、MCP 等）。
 * 桌面端跑的是 RPC 模式，Pi 没法弹出询问，没有记录时会直接跳过，所以由界面来问。
 */
export async function trustStatus(cwd: string): Promise<TrustStatus> {
  const mod = await pi()
  const entry = new mod.ProjectTrustStore(AGENT_DIR).getEntry(cwd)
  const fallback = readJson<{ defaultProjectTrust?: string }>(path.join(AGENT_DIR, 'settings.json'), {}).defaultProjectTrust
  const decision = entry?.decision ?? null
  return { needed: mod.hasTrustRequiringProjectResources(cwd), decision, from: entry?.path, trusted: decision ?? fallback === 'always' }
}

export async function setTrust(cwd: string, decision: boolean | null): Promise<TrustStatus> {
  const mod = await pi()
  new mod.ProjectTrustStore(AGENT_DIR).set(cwd, decision)
  return trustStatus(cwd)
}
