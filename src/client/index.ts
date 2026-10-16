/**
 * Client 端插件（浏览器侧）。
 *
 * 已对齐 DSH 社区插件的真实约定（参考 dsh-boot-animation 的 lib/client.js）：
 *   - 导出 { inject, apply }；
 *   - apply(ctx) 里用 ctx.inject(['slots'], wire) 取得 slots 服务；
 *   - ready.slots.inject('shell.overlay', () => ready.slots.register({...}, renderFn))
 *     注册到帧级悬浮层；renderFn 返回一个 React 元素。
 *   - ready.effect(register, '...') 让 DSH 托管生命周期（卸载自动清理）。
 *
 * 与 Host 通信走 HTTP 路由（与 dsh-boot-animation 一致）。
 */

import * as React from 'react'
import type { LayoutState } from '../core/types'
import { createGridStore } from './store'
import { GridCanvas } from './components'

/** 本插件需要 DSH 提供的 client 服务 */
export const inject = ['slots']

const ROUTE = '/dsh-grid-layout'
const STYLE_ID = 'dsh-grid-layout-style'

const CSS = `
.dgl-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
.dgl-canvas.is-hidden .dgl-grid, .dgl-canvas.is-hidden .dgl-toolbar { display: none; }
.dgl-toggle { position: fixed; right: 16px; bottom: 16px; pointer-events: auto; z-index: 2;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 8px 14px;
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  cursor: pointer; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.15); }
.dgl-toolbar { position: fixed; top: 16px; right: 16px; pointer-events: auto; display: flex; gap: 8px; z-index: 2; }
.dgl-toolbar button { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 12px;
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 13px; }
.dgl-grid { position: relative; width: 100%; pointer-events: auto; }
.dgl-box { position: absolute; top: 0; left: 0; display: flex; flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; overflow: hidden;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  background: rgba(255,255,255,.55); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%);
  transition: box-shadow .15s ease; will-change: transform; }
@media (prefers-color-scheme: dark) { .dgl-box { background: rgba(20,22,28,.55); } }
.dgl-box:hover { box-shadow: 0 12px 36px rgba(0,0,0,.25); }
.dgl-box.is-collapsed { border-radius: 10px; }
.dgl-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px; cursor: grab; user-select: none; touch-action: none;
  color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600;
  border-bottom: 1px solid var(--dsw-alias-border-l1); flex: 0 0 auto; }
.dgl-titlebar:active { cursor: grabbing; }
.dgl-fold-hint { opacity: .6; font-size: 11px; }
.dgl-body { flex: 1 1 auto; overflow: auto; padding: 8px 10px; color: var(--dsw-alias-label-primary); }
.dgl-note { flex: 1; border: none; background: transparent; resize: none; outline: none;
  font: inherit; color: var(--dsw-alias-label-primary); padding: 8px 10px; }
.dgl-shortcuts { display: flex; flex-direction: column; gap: 6px; }
.dgl-shortcut { text-align: left; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-primary); padding: 6px 10px; cursor: pointer; }
.dgl-files { display: flex; flex-direction: column; }
.dgl-file { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 13px; }
.dgl-file-meta { opacity: .6; font-size: 12px; }
.dgl-truncated { opacity: .6; font-size: 12px; padding-top: 6px; }
.dgl-monitor { text-align: center; padding: 16px; }
.dgl-metric { font-size: 24px; font-weight: 700; color: var(--dsw-alias-brand-primary); }
.dgl-metric-label { opacity: .6; font-size: 12px; }
.dgl-resize { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px;
  cursor: nwse-resize; touch-action: none; }
.dgl-resize::after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 8px; height: 8px;
  border-right: 2px solid var(--dsw-alias-border-l2); border-bottom: 2px solid var(--dsw-alias-border-l2); }
`

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/**
 * Host RPC 门面：对应 src/host/index.ts 注册的 HTTP 路由。
 * （DSH 的 host.call 仅用于动态 client half；预打包 client 用 HTTP 路由，与 dsh-boot-animation 一致。）
 */
function createHostRpc() {
  const json = async (path: string, init?: RequestInit) => {
    const res = await fetch(ROUTE + path, init)
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
    return res.json()
  }
  return {
    async call(method: string, args?: unknown): Promise<unknown> {
      switch (method) {
        case 'gridLayout.get':
          return json('/layout.json')
        case 'gridLayout.save':
          return json('/layout.json', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(args),
          })
        case 'folderPortal.list': {
          const [dir, opts] = args as [string, { maxEntries?: number; showHidden?: boolean }?]
          const q = new URLSearchParams({
            path: dir,
            max: String(opts?.maxEntries ?? 500),
            hidden: opts?.showHidden ? '1' : '0',
          })
          return json('/list.json?' + q.toString())
        }
        default:
          throw new Error('unknown method: ' + method)
      }
    },
  }
}

export function apply(ctx: any): void {
  const wire = (ready: any) => {
    const register = () => {
      ensureStyles()

      const initial: LayoutState = {
        cols: 12, rowHeight: 42, gap: 12, boxes: [], groups: ['默认分组'],
      }
      const store = createGridStore(initial, createHostRpc())

      // 异步合并宿主持久化数据（失败则保留默认布局）
      void Promise.resolve()
        .then(() => store.host.call('gridLayout.get'))
        .then((saved) => { if (saved) store.replace(saved as LayoutState) })
        .catch(() => { /* 无持久化 */ })

      // 注册到帧级悬浮层 shell.overlay
      ready.slots.inject('shell.overlay', () =>
        ready.slots.register(
          {
            name: 'shell.overlay',
            id: 'dsh-grid-layout',
            order: 100,
            label: () => '格子化布局',
          },
          () => React.createElement(GridCanvas, { store }),
        ),
      )
    }

    // 交给 DSH 托管：插件卸载时自动执行清理
    if (typeof ready.effect === 'function') ready.effect(register, 'dsh-grid-layout: mounts')
    else register()
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['slots'], wire)
    return
  }
  if (ctx.slots !== undefined) wire(ctx)
}
