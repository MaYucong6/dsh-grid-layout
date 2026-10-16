/**
 * 网格布局引擎 —— 纯 TypeScript，不依赖 React / DOM。
 *
 * 设计要点：
 * 1. 所有几何用「网格单元」表达，像素换算在 `pixels.ts` 之外完成，便于单元测试。
 * 2. 拖拽/缩放采用「移除 → 重插 → 向下压实（resolveCollisions）」的经典算法：
 *    被拖拽的格子保持用户指针位置（pinned），其余格子在其下方自动让位。
 *    这与 react-grid-layout 的 vertical-compact 行为一致，但实现更精简。
 * 3. 折叠（卷起）复用同一套压实算法：折叠后有效高度变为 1 行，释放的空间
 *    被下方格子向上回收；展开时格子回到记忆位置并把冲突者向下推开。
 */

import type { GridBox, LayoutState } from './types'

/** 两个矩形是否相交（含边界接触不算相交） */
export function collides(a: GridBox, b: GridBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** 折叠时格子的有效行数：卷起后只占标题栏 1 行 */
export function effectiveRows(box: GridBox): number {
  return box.collapsed ? 1 : box.h
}

/** 用有效高度构造用于碰撞检测的矩形 */
function rect(box: GridBox): GridBox {
  return { ...box, h: effectiveRows(box) }
}

/** 约束数值到 [min, max] */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 格子是否在网格边界内（列方向必须 ≥0 且不越界；行方向允许无限向下） */
export function inBounds(layout: LayoutState, box: GridBox): boolean {
  return box.x >= 0 && box.x + box.w <= layout.cols && box.y >= 0
}

/** 判断把 box 放到 (x, y) 后是否与 others 中任一格子冲突（不含自身） */
function hitsAny(
  layout: LayoutState,
  box: GridBox,
  others: GridBox[],
): boolean {
  const probe = rect({ ...box, x: box.x, y: box.y })
  for (const other of others) {
    if (other.id === box.id) continue
    if (collides(probe, rect(other))) return true
  }
  return false
}

/**
 * 冲突消解：把「优先级更高」的格子钉在原位，其余格子依次向下推到第一个不冲突的行。
 * pinnedId 通常是被拖拽/缩放的格子；为空则所有格子一起向上压实（compact）。
 */
function resolveCollisions(layout: LayoutState, boxes: GridBox[], pinnedId?: string): GridBox[] {
  // 排序：pinned 格子最前；其余按 (y, x) 升序，保证视觉顺序稳定
  const sorted = [...boxes].sort((a, b) => {
    if (a.id === pinnedId) return -1
    if (b.id === pinnedId) return 1
    return a.y - b.y || a.x - b.x
  })

  const placed: GridBox[] = []
  for (const box of sorted) {
    const candidate: GridBox = { ...box }
    // pinned 格子不再上移（保留用户拖到的位置）；普通格子允许向下推
    let y = candidate.y
    while (hitsAny(layout, { ...candidate, y }, placed)) {
      y += 1
    }
    placed.push({ ...candidate, y })
  }
  return placed
}

/** 把一组格子向上压实：从顶部开始逐个放到首个不冲突的行（消除空洞） */
function compactList(layout: LayoutState, boxes: GridBox[]): GridBox[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: GridBox[] = []
  for (const box of sorted) {
    let y = 0
    while (hitsAny(layout, { ...box, y }, placed)) y += 1
    placed.push({ ...box, y })
  }
  return placed
}

/** 向上压实：整理画布，消除空洞，把所有格子堆到顶部（「一键整理」按钮调用） */
export function compact(layout: LayoutState): LayoutState {
  return { ...layout, boxes: compactList(layout, layout.boxes) }
}

/** 移动格子到新的列/行位置（拖拽核心），返回新布局（不可变更新） */
export function moveBox(
  layout: LayoutState,
  id: string,
  nextX: number,
  nextY: number,
): LayoutState {
  const box = layout.boxes.find((b) => b.id === id)
  if (!box) return layout
  const w = box.w
  const nx = clamp(Math.round(nextX), 0, layout.cols - w)
  const ny = Math.max(0, Math.round(nextY))
  if (nx === box.x && ny === box.y) return layout

  const others = layout.boxes.filter((b) => b.id !== id)
  const moved: GridBox = { ...box, x: nx, y: ny }
  return { ...layout, boxes: resolveCollisions(layout, [...others, moved], id) }
}

/** 缩放格子（右下角手柄），保证不小于最小尺寸、不越界 */
export function resizeBox(
  layout: LayoutState,
  id: string,
  nextW: number,
  nextH: number,
): LayoutState {
  const box = layout.boxes.find((b) => b.id === id)
  if (!box || box.collapsed) return layout
  const minW = box.minW ?? 1
  const minH = box.minH ?? 1
  const w = clamp(Math.round(nextW), minW, layout.cols - box.x)
  const h = Math.max(minH, Math.round(nextH))
  if (w === box.w && h === box.h) return layout

  const others = layout.boxes.filter((b) => b.id !== id)
  const resized: GridBox = { ...box, w, h }
  return { ...layout, boxes: resolveCollisions(layout, [...others, resized], id) }
}

/** 折叠/展开：折叠时向上压实释放空间，展开时格子回原位并向下推开冲突者 */
export function setCollapsed(layout: LayoutState, id: string, collapsed: boolean): LayoutState {
  const box = layout.boxes.find((b) => b.id === id)
  if (!box || box.collapsed === collapsed) return layout
  const others = layout.boxes.filter((b) => b.id !== id)
  const toggled: GridBox = { ...box, collapsed }
  const boxes = collapsed
    ? compactList(layout, [toggled, ...others])       // 折叠：有效高度=1，整体向上压实
    : resolveCollisions(layout, [...others, toggled], id) // 展开：钉回原位，向下推开
  return { ...layout, boxes }
}

/** 判断两个格子是否可以互换（用于「自动归类吸附」时把文件塞进目标格子） */
export function boxesOverlap(a: GridBox, b: GridBox): boolean {
  return collides(rect(a), rect(b))
}

/**
 * 像素 → 网格换算。
 * 行高固定，列宽由容器宽度自适应（响应式），拖拽时用网格单元做吸附。
 */
export interface Geometry {
  colWidth: number
  rowHeight: number
  gap: number
  cols: number
}

export function computeGeometry(layout: LayoutState, containerWidth: number): Geometry {
  const { cols, rowHeight, gap } = layout
  const colWidth = (containerWidth - gap * (cols + 1)) / cols
  return { colWidth, rowHeight, gap, cols }
}

export function boxToPixels(box: GridBox, geo: Geometry): { x: number; y: number; w: number; h: number } {
  const rows = effectiveRows(box)
  return {
    x: box.x * (geo.colWidth + geo.gap) + geo.gap,
    y: box.y * (geo.rowHeight + geo.gap) + geo.gap,
    w: box.w * geo.colWidth + (box.w - 1) * geo.gap,
    h: rows * geo.rowHeight + (rows - 1) * geo.gap,
  }
}

/** 像素 → 网格（拖拽吸附用） */
export function pixelsToGrid(
  layout: LayoutState,
  geo: Geometry,
  px: number,
  py: number,
): { x: number; y: number } {
  const x = Math.round((px - geo.gap) / (geo.colWidth + geo.gap))
  const y = Math.round((py - geo.gap) / (geo.rowHeight + geo.gap))
  return { x: clamp(x, 0, layout.cols - 1), y: Math.max(0, y) }
}

/** 计算当前布局占用的最大行数（用于画布高度） */
export function maxRow(layout: LayoutState): number {
  return layout.boxes.reduce((m, b) => Math.max(m, b.y + effectiveRows(b)), 0)
}

/** 新增格子的默认落点：放在内容最底部，避免与现有格子重叠 */
export function findFreePosition(layout: LayoutState, w: number, h: number): { x: number; y: number } {
  const x = 0
  let y = maxRow(layout)
  // 每次迭代用当前 y 重新构造探针，避免碰撞时死循环
  while (hitsAny(layout, { id: '__probe__', x, y, w, h, collapsed: false } as GridBox, layout.boxes)) {
    y += 1
  }
  return { x, y }
}

/** 生成短 id */
export function uid(): string {
  return 'box-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
