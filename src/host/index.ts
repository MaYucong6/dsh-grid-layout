/**
 * Host 端 Cordis 插件（Node 侧）。
 *
 * 已对齐 DSH 社区插件的真实约定（参考 dsh-boot-animation）：
 * - 导出 { name, inject, apply }；
 * - 只硬依赖 ctx.webServer 一个服务（inject = ['webServer']）；
 * - 持久化 / 目录读取直接用 node:fs，不引入额外服务；
 * - 通过 HTTP 路由与 Client 通信，用 ctx.effect(...) 注册以便自动清理。
 *
 * 路由（全部挂在 /dsh-grid-layout 下）：
 *   GET  /layout.json            读取布局快照
 *   POST /layout.json            保存布局快照
 *   GET  /list.json?path=&max=&hidden=1   目录投影（文件夹内容）
 *   GET  /rules.json             读取自动归类规则
 *   POST /rules.json             保存自动归类规则
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, extname } from 'node:path'
import type { FileEntry, LayoutState } from '../core/types'

export const name = 'dsh-grid-layout'

/** webserver 路由是本插件唯一硬依赖的 Host 服务 */
export const inject = ['webServer']

const ROUTE = '/dsh-grid-layout'
const HOME = join(homedir(), '.dsh', 'grid-layout')
const LAYOUT_FILE = join(HOME, 'layout.json')
const RULES_FILE = join(HOME, 'rules.json')

// ─────────────────────────────────────────────────────────────
// 存储（node:fs，无额外服务依赖）
// ─────────────────────────────────────────────────────────────
function ensureHome(): void {
  try { mkdirSync(HOME, { recursive: true }) } catch { /* 已存在 */ }
}

function defaultLayout(): LayoutState {
  return { cols: 12, rowHeight: 42, gap: 12, boxes: [], groups: ['默认分组'] }
}

function readJson(file: string, fallback: unknown): unknown {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback }
}

function writeJson(file: string, data: unknown): void {
  ensureHome()
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

// ─────────────────────────────────────────────────────────────
// HTTP 响应助手（Node 原生 res）
// ─────────────────────────────────────────────────────────────
function sendJson(res: any, payload: unknown, status = 200): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function sendText(res: any, body: string, status = 200): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: any) => {
      data += chunk
      if (data.length > 8_000_000) { req.destroy(); reject(new Error('body too large')) }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// ─────────────────────────────────────────────────────────────
// 目录投影
// ─────────────────────────────────────────────────────────────
function listDirectory(dir: string, showHidden: boolean, maxEntries: number) {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (error) {
    return { error: `无法读取目录：${String(error)}` }
  }

  const entries: FileEntry[] = []
  const hardCap = maxEntries * 4 // 早停：超大目录只扫描有限条目
  for (const entry of names) {
    if (!showHidden && entry.startsWith('.')) continue
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    const isDir = st.isDirectory()
    entries.push({
      name: entry,
      path: full,
      kind: isDir ? 'dir' : 'file',
      ext: isDir ? '' : extname(entry).toLowerCase(),
      size: st.size,
      mtime: st.mtimeMs,
    })
    if (entries.length >= hardCap) break
  }

  const total = entries.length
  return {
    path: dir,
    entries: entries.slice(0, maxEntries),
    total,
    truncated: total > maxEntries,
  }
}

// ─────────────────────────────────────────────────────────────
// 插件入口
// ─────────────────────────────────────────────────────────────
export function apply(ctx: any): void {
  ensureHome()

  const handler = async (req: any, res: any) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const sub = url.pathname.slice(ROUTE.length)

    try {
      // 布局快照
      if (sub === '/layout.json') {
        if (req.method === 'GET') {
          const saved = readJson(LAYOUT_FILE, null)
          return sendJson(res, saved ?? defaultLayout())
        }
        if (req.method === 'POST') {
          const layout = JSON.parse(await readBody(req))
          writeJson(LAYOUT_FILE, layout)
          return sendJson(res, { ok: true })
        }
        return sendText(res, 'method not allowed', 405)
      }

      // 目录投影
      if (sub === '/list.json' && req.method === 'GET') {
        const dir = url.searchParams.get('path')
        if (!dir) return sendJson(res, { error: 'missing path' }, 400)
        const showHidden = url.searchParams.get('hidden') === '1'
        const max = Math.min(Number(url.searchParams.get('max') ?? 500) || 500, 5000)
        return sendJson(res, listDirectory(dir, showHidden, max))
      }

      // 自动归类规则
      if (sub === '/rules.json') {
        if (req.method === 'GET') return sendJson(res, readJson(RULES_FILE, []))
        if (req.method === 'POST') {
          writeJson(RULES_FILE, JSON.parse(await readBody(req)))
          return sendJson(res, { ok: true })
        }
        return sendText(res, 'method not allowed', 405)
      }

      return sendText(res, 'not found', 404)
    } catch (error) {
      return sendJson(res, { error: String(error) }, 500)
    }
  }

  // ctx.effect 保证插件卸载时路由随之注销
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }),
    'dsh-grid-layout: layout + folder portal routes',
  )
}
