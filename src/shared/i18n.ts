import { en } from './locales/en'

export type Lang = 'zh' | 'en'

/**
 * 界面文字的翻译。
 *
 * 源码里直接写中文，中文本身就是查找用的键：`t('新对话')`。
 * 显示英文时到 locales/en.ts 里找对应的句子，找不到就原样显示中文。
 * 句子里的变量写成 `{名字}`，调用时把值传进去，比如条数 n。
 */
let lang: Lang = 'zh'

// 界面进程里，语言要在这个模块加载时就定下来：有些文字表是在模块加载时求值的，
// 所以切换语言之后界面会整个重新加载。主进程没有 localStorage，由界面启动时告诉它。
if (typeof localStorage !== 'undefined') {
  try {
    const choice = JSON.parse(localStorage.getItem('prefs') ?? '{}').language
    lang = choice === 'zh' || choice === 'en' ? choice : resolveLang(navigator.language)
  } catch {
    lang = resolveLang(navigator.language)
  }
}

export function setLang(next: Lang): void {
  lang = next
}

export function getLang(): Lang {
  return lang
}

/** 把系统或浏览器报告的语言（如 zh-CN、en-US、ja）归到我们支持的两种之一 */
export function resolveLang(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const base = lang === 'en' ? (en[text] ?? text) : text
  return vars ? base.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : base
}
