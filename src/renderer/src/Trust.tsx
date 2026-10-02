import { t } from '@shared/i18n'
import { setTrust, useApp } from './store'
import { Icon } from './ui'

/**
 * 项目自带 Pi 配置、但还没被信任时的提示。Pi 在没有记录时会直接跳过这些配置，
 * 不说一声的话，用户只会发现项目里的技能和指令「不见了」。
 * 拒绝过以后默认不再提，`always` 用在设置页里，那里要一直能看到原因。
 */
export function TrustBanner({ cwd, always }: { cwd: string; always?: boolean }) {
  const status = useApp((s) => s.trust[cwd])
  if (!status?.needed || status.trusted) return null
  if (status.decision === false && !always) return null
  return (
    <div className="trust-banner">
      <Icon name="shield" size={15} />
      <div className="grow">
        <div>
          {status.decision === false
            ? t('这个项目没有被信任，它自带的技能、指令、扩展和 MCP 都没有加载。')
            : t('这个项目自带 Pi 配置（技能、指令、扩展或 MCP），现在还没有加载。')}
        </div>
        <div className="muted small">{t('项目里的扩展能在你的电脑上运行代码，只信任你清楚来源的项目。')}</div>
      </div>
      <button className="btn primary" onClick={() => void setTrust(cwd, true)}>
        {t('信任并加载')}
      </button>
      {status.decision === null && (
        <button className="btn" onClick={() => void setTrust(cwd, false)}>
          {t('不加载')}
        </button>
      )}
    </div>
  )
}
