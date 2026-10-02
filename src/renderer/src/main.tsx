import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import * as store from './store'
import './styles.css'
import { t } from '@shared/i18n'

/** 界面某处渲染出错时显示出错信息，而不是整个窗口变空白 */
class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(t('界面渲染出错：'), error.stack ?? error.message)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="welcome">
        <div className="welcome-title">{t('界面出错了')}</div>
        <div className="banner error">{this.state.error.message}</div>
        <button className="btn primary" onClick={() => location.reload()}>
          {t('重新加载')}
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <Boundary>
    <App />
  </Boundary>
)
void store.init()

// 开发时把状态挂到 window 上，方便从调试端口检查
if (import.meta.env.DEV) (window as unknown as { __store: typeof store }).__store = store
