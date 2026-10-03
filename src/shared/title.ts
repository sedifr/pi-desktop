/**
 * 拿第一条消息当对话标题时，去掉写给模型看的那些部分：引用的原文、附上的文档和别的对话那几行、
 * 一长串的文件路径（只留文件名）。去完什么都不剩就用原话。
 */
export function titleFrom(text: string): string {
  const cleaned = text
    .split('\n')
    .filter((line) => !line.startsWith('>') && !/@\S+\/(transcripts|attachments)\/\S+\.md/.test(line))
    .join(' ')
    .replace(/@(\/\S+|\S+\/\S+)/g, (path) => `@${path.split('/').pop()}`)
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || text.replace(/\s+/g, ' ').trim()
}
