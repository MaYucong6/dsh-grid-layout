/**
 * Client 端 React 组件 —— 无 JSX，统一用 h = React.createElement。
 * 挂载于 shell.overlay（帧级悬浮层），实现网格画布、拖拽、缩放、折叠。
 */

import * as React from 'react'
import type { GridBox, LayoutState } from '../core/types'
import * as engine from '../core/layout'
import type { GridStore } from './store'

const { useMemo, useRef, useState, useEffect, memo, useCallback } = React
const h = React.createElement

/** 暴露给挂载点的主画布组件 */
export function GridCanvas(props: { store: GridStore }) {
  const { store } = props
  const layout = useLayoutState(store)

  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hidden, setHidden] = useState(false)

  // 测量容器宽度（响应式列宽）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = width > 0 ? engine.computeGeometry(layout, width) : null
  const rows = engine.maxRow(layout)
  const canvasHeight = geo ? rows * (geo.rowHeight + geo.gap) + geo.gap : 0

  return h('div', { className: 'dgl-canvas' + (hidden ? ' is-hidden' : ''), ref },
    h(Toolbar, { store, layout }),
    h('div', {
      className: 'dgl-grid',
      style: { height: canvasHeight },
    },
      geo && layout.boxes.map((box) =>
        h(GridBoxItem, {
          key: box.id,
          box,
          geo,
          store,
        }),
      ),
    ),
    h('button', { className: 'dgl-toggle', onClick: () => setHidden(!hidden) },
      hidden ? '☰ 显示格子' : '— 隐藏格子'),
  )
}

/** 订阅整个布局（Geo 变化会全量重渲染，格子用 memo 兜底） */
function useLayoutState(store: GridStore): LayoutState {
  const [state, setState] = useState<LayoutState>(() => store.getState())
  useEffect(() => store.subscribe(setState), [store])
  return state
}

/** 顶部工具条：新建格子 / 一键整理 / 折叠全部 */
function Toolbar(props: { store: GridStore; layout: LayoutState }) {
  const { store, layout } = props

  const addNote = () => {
    const { x, y } = engine.findFreePosition(layout, 4, 3)
    store.addBox({
      id: engine.uid(), title: '便签', kind: 'note',
      props: { kind: 'note', note: { text: '双击标题栏可卷起' } },
      style: { opacity: 0.92, glass: true },
      group: '默认分组', collapsed: false,
      x, y, w: 4, h: 3, minW: 2, minH: 2,
    })
  }
  const collapseAll = () => {
    layout.boxes.forEach((b) => { if (!b.collapsed) store.toggleCollapse(b.id) })
  }

  return h('div', { className: 'dgl-toolbar' },
    h('button', { onClick: addNote }, '＋ 便签'),
    h('button', { onClick: () => store.tidy() }, '⤒ 一键整理'),
    h('button', { onClick: collapseAll }, '▁ 折叠全部'),
  )
}

// ─────────────────────────────────────────────────────────────
// 单个格子（memo：仅当几何/标题/折叠/外观变化才重渲染）
// ─────────────────────────────────────────────────────────────
const GridBoxItem = memo(function GridBoxItem(props: {
  box: GridBox
  geo: engine.Geometry
  store: GridStore
}) {
  const { box, geo, store } = props
  const px = engine.boxToPixels(box, geo)

  return h('div', {
    className: 'dgl-box' + (box.collapsed ? ' is-collapsed' : ''),
    style: {
      transform: `translate3d(${px.x}px, ${px.y}px, 0)`,
      width: px.w,
      height: px.h,
      opacity: box.style.opacity,
    },
  },
    h(TitleBar, { box, geo, store }),
    box.collapsed ? null : h(BoxBody, { box, store }),
    box.collapsed ? null : h(ResizeHandle, { box, geo, store }),
  )
}, boxPropsEqual)

function boxPropsEqual(a: any, b: any): boolean {
  const A = a.box as GridBox
  const B = b.box as GridBox
  return (
    A.id === B.id &&
    A.x === B.x && A.y === B.y && A.w === B.w && A.h === B.h &&
    A.collapsed === B.collapsed &&
    A.title === B.title &&
    A.kind === B.kind &&
    A.style === B.style &&
    A.props === B.props
  )
}

// ─────────────────────────────────────────────────────────────
// 标题栏：拖拽 + 双击折叠
// ─────────────────────────────────────────────────────────────
function TitleBar(props: { box: GridBox; geo: engine.Geometry; store: GridStore }) {
  const { box, geo, store } = props
  const drag = useRef<null | { id: number; startX: number; startY: number; x0: number; y0: number; raf: number }>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x0: box.x, y0: box.y, raf: 0 }
  }, [box.x, box.y])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const colStep = geo.colWidth + geo.gap
    const rowStep = geo.rowHeight + geo.gap
    const nx = d.x0 + Math.round((e.clientX - d.startX) / colStep)
    const ny = d.y0 + Math.round((e.clientY - d.startY) / rowStep)
    // rAF 节流：一帧内只提交一次，避免高频 setState
    if (d.raf) return
    d.raf = requestAnimationFrame(() => {
      d.raf = 0
      store.move(box.id, nx, ny)
    })
  }, [box.id, geo.colWidth, geo.gap, geo.rowHeight, store])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!drag.current || e.pointerId !== drag.current.id) return
    drag.current = null
    store.flush()
  }, [store])

  return h('div', {
    className: 'dgl-titlebar',
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick: () => store.toggleCollapse(box.id),
    title: '拖拽移动 · 双击卷起/展开',
  },
    h('span', { className: 'dgl-title' }, box.title),
    h('span', { className: 'dgl-fold-hint' }, box.collapsed ? '▸' : '▾'),
  )
}

// ─────────────────────────────────────────────────────────────
// 右下角缩放手柄
// ─────────────────────────────────────────────────────────────
function ResizeHandle(props: { box: GridBox; geo: engine.Geometry; store: GridStore }) {
  const { box, geo, store } = props
  const rs = useRef<null | { id: number; startX: number; startY: number; w0: number; h0: number; raf: number }>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    rs.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, w0: box.w, h0: box.h, raf: 0 }
  }, [box.w, box.h])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = rs.current
    if (!s || e.pointerId !== s.id) return
    const nw = s.w0 + Math.round((e.clientX - s.startX) / (geo.colWidth + geo.gap))
    const nh = s.h0 + Math.round((e.clientY - s.startY) / (geo.rowHeight + geo.gap))
    if (s.raf) return
    s.raf = requestAnimationFrame(() => {
      s.raf = 0
      store.resize(box.id, nw, nh)
    })
  }, [box.id, geo.colWidth, geo.gap, geo.rowHeight, store])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!rs.current || e.pointerId !== rs.current.id) return
    rs.current = null
    store.flush()
  }, [store])

  return h('span', {
    className: 'dgl-resize',
    onPointerDown,
    onPointerMove,
    onPointerUp,
    title: '拖拽调整大小',
  })
}

// ─────────────────────────────────────────────────────────────
// 格子内容体：按 kind 分发
// ─────────────────────────────────────────────────────────────
function BoxBody(props: { box: GridBox; store: GridStore }) {
  const { box, store } = props
  switch (box.kind) {
    case 'note':
      return h(NoteBody, { box, store })
    case 'files':
      return h(FilesBody, { box, store })
    case 'shortcuts':
      return h(ShortcutsBody, { box, store })
    case 'monitor':
      return h(MonitorBody, { box, store })
    default:
      return h('div', { className: 'dgl-body' }, '未知类型')
  }
}

function NoteBody(props: { box: GridBox; store: GridStore }) {
  const text = (props.box.props as { kind: 'note'; note: { text: string } }).note?.text ?? ''
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const b = props.box
    props.store.patchBox(b.id, {
      props: { kind: 'note', note: { text: e.target.value } },
    })
  }
  return h('textarea', {
    className: 'dgl-note',
    value: text,
    onChange,
    placeholder: '写点什么…',
  })
}

function ShortcutsBody(props: { box: GridBox; store: GridStore }) {
  const items = (props.box.props as { kind: 'shortcuts'; items: Array<{ id: string; label: string; icon?: string }> }).items ?? []
  return h('div', { className: 'dgl-shortcuts' },
    items.map((it) =>
      h('button', {
        key: it.id,
        className: 'dgl-shortcut',
        onClick: () => props.store.host.call('shortcuts.open', it),
      }, it.icon ? it.icon + ' ' : '', it.label),
    ),
  )
}

/** 文件夹投影：异步加载目录 + 上限截断；大数据量用虚拟滚动（见性能建议） */
function FilesBody(props: { box: GridBox; store: GridStore }) {
  const portal = (props.box.props as { kind: 'files'; portal: { directory: string; maxEntries?: number } }).portal
  const [listing, setListing] = useState<any>(null)

  useEffect(() => {
    if (!portal?.directory) return
    let alive = true
    void props.store.host
      .call('folderPortal.list', portal.directory, { maxEntries: portal.maxEntries ?? 500 })
      .then((r) => { if (alive) setListing(r) })
    return () => { alive = false }
  }, [portal?.directory, props.store])

  if (!listing) return h('div', { className: 'dgl-body' }, '加载目录中…')
  return h('div', { className: 'dgl-files' },
    listing.entries.map((f: any) =>
      h('div', { key: f.path, className: 'dgl-file' },
        h('span', { className: 'dgl-file-name' }, f.name),
        h('span', { className: 'dgl-file-meta' }, f.kind === 'dir' ? '📁' : formatSize(f.size)),
      ),
    ),
    listing.truncated
      ? h('div', { className: 'dgl-truncated' }, `仅显示前 ${listing.entries.length} 项，共 ${listing.total} 项`)
      : null,
  )
}

function MonitorBody(props: { box: GridBox; store: GridStore }) {
  const m = (props.box.props as { kind: 'monitor'; monitor: { metric: string } }).monitor
  return h('div', { className: 'dgl-monitor' },
    h('div', { className: 'dgl-metric' }, m?.metric ?? '—'),
    h('div', { className: 'dgl-metric-label' }, '状态监控占位（可由 Provider 注入实时数据）'),
  )
}

function formatSize(n: number): string {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
