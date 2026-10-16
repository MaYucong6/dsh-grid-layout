/**
 * 自动归类规则引擎 —— 纯函数，Host 与 Client 共用。
 *
 * 用途：给定一个文件条目，判断它应「吸附」到哪个格子。
 * 规则在 Host 端执行（避免大目录在浏览器里反复遍历），Client 端仅展示结果。
 */

import type { AutoSortRule, FileEntry, RuleMatch } from './types'

/** 匹配单个条件 */
export function matchRule(match: RuleMatch, file: FileEntry): boolean {
  switch (match.kind) {
    case 'ext':
      return match.values.some((v) => normalizeExt(file.ext) === normalizeExt(v))
    case 'name': {
      const re = globToRegExp(match.pattern)
      return re.test(file.name)
    }
    case 'tag':
      // 标签匹配需要外部标签源，这里通过文件元数据钩子扩展（默认无标签 → 不命中）
      return false
    case 'size':
      if (match.gt != null && !(file.size > match.gt)) return false
      if (match.lt != null && !(file.size < match.lt)) return false
      return true
    default:
      return false
  }
}

/** 将一条文件路由到目标格子；无命中返回 undefined */
export function routeFile(file: FileEntry, rules: AutoSortRule[]): string | undefined {
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (matchRule(rule.match, file)) return rule.targetBoxId
  }
  return undefined
}

/** 对一批文件做分组，返回 boxId → FileEntry[] 的映射（用于一次性归类） */
export function classify(
  files: FileEntry[],
  rules: AutoSortRule[],
): Map<string, FileEntry[]> {
  const map = new Map<string, FileEntry[]>()
  for (const file of files) {
    const target = routeFile(file, rules)
    if (!target) continue
    const list = map.get(target) ?? []
    list.push(file)
    map.set(target, list)
  }
  return map
}

/** 归一化扩展名：'.PNG' → '.png'，无点自动补 */
function normalizeExt(ext: string): string {
  const e = ext.trim().toLowerCase()
  return e.startsWith('.') ? e : `.${e}`
}

/** 极简 glob（* 与 ?）转正则，避免引入完整 glob 库 */
export function globToRegExp(pattern: string): RegExp {
  let re = ''
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i')
}

/** 从文件名推断扩展名（无扩展返回空串） */
export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i)
}
