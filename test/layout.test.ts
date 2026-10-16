/**
 * 布局引擎单元测试（node --test，需先 tsc 编译或使用 tsx 运行）。
 * 覆盖：拖拽推挤、向上压实、折叠释放/回收空间、缩放边界。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compact, moveBox, resizeBox, setCollapsed, findFreePosition } from '../src/core/layout'
import type { GridBox, LayoutState } from '../src/core/types'

function box(id: string, x: number, y: number, w: number, h: number, collapsed = false): GridBox {
  return {
    id, title: id, kind: 'note',
    props: { kind: 'note', note: { text: '' } },
    style: { opacity: 1, glass: false },
    group: 'g', collapsed,
    x, y, w, h, minW: 1, minH: 1,
  }
}

function layout(boxes: GridBox[]): LayoutState {
  return { cols: 4, rowHeight: 40, gap: 10, boxes, groups: ['g'] }
}

test('moveBox：拖拽到重叠位置时，下方格子被向下推开', () => {
  // A(0,0,2,2) 与 B(2,0,2,2) 并排；把 A 拖到 (1,0) 会与 B 重叠
  const l = layout([box('A', 0, 0, 2, 2), box('B', 2, 0, 2, 2)])
  const next = moveBox(l, 'A', 1, 0)
  const a = next.boxes.find((b) => b.id === 'A')!
  const b = next.boxes.find((b) => b.id === 'B')!
  assert.equal(a.x, 1)
  assert.equal(a.y, 0)
  assert.equal(b.x, 2)
  assert.equal(b.y, 1, 'B 应被推到 A 下方')
})

test('moveBox：越界坐标被钳制在网格内', () => {
  const l = layout([box('A', 0, 0, 2, 2)])
  const next = moveBox(l, 'A', 99, -5)
  const a = next.boxes[0]
  assert.equal(a.x, 2, 'x 被钳制到 cols - w')
  assert.equal(a.y, 0, 'y 被钳制到 >= 0')
})

test('compact：消除空洞，向上压实', () => {
  // B 与 A 不在同一列，但 B 在 y=3 处，其上方有空行
  const l = layout([box('A', 0, 0, 2, 1), box('B', 2, 3, 2, 1)])
  const next = compact(l)
  const b = next.boxes.find((x) => x.id === 'B')!
  assert.equal(b.y, 0, 'B 应被压实到顶部')
})

test('setCollapsed：折叠释放空间，下方格子上浮', () => {
  // A(0,0,2,2)，B 在 A 正下方 (0,2)
  const l = layout([box('A', 0, 0, 2, 2), box('B', 0, 2, 2, 2)])
  const collapsed = setCollapsed(l, 'A', true)
  const a = collapsed.boxes.find((x) => x.id === 'A')!
  const b = collapsed.boxes.find((x) => x.id === 'B')!
  assert.equal(a.collapsed, true)
  assert.equal(b.y, 1, 'A 折叠为 1 行后，B 应上浮到第 1 行')
})

test('setCollapsed：展开时格子回原位并推开下方', () => {
  const l = layout([box('A', 0, 0, 2, 3, true), box('B', 0, 1, 2, 2)])
  const expanded = setCollapsed(l, 'A', false)
  const a = expanded.boxes.find((x) => x.id === 'A')!
  const b = expanded.boxes.find((x) => x.id === 'B')!
  assert.equal(a.collapsed, false)
  assert.equal(a.y, 0)
  assert.equal(b.y, 3, 'A 展开占 3 行，B 应被推到第 3 行')
})

test('resizeBox：遵守最小尺寸与边界', () => {
  const l = layout([box('A', 0, 0, 2, 2)])
  const next = resizeBox(l, 'A', 0, 0) // 试图缩到 0
  const a = next.boxes[0]
  assert.equal(a.w, 1, '宽度不小于 minW')
  assert.equal(a.h, 1, '高度不小于 minH')
})

test('findFreePosition：新格子落在底部且不与现有冲突', () => {
  const l = layout([box('A', 0, 0, 2, 2)])
  const { x, y } = findFreePosition(l, 2, 2)
  assert.equal(x, 0)
  assert.ok(y >= 2, '应落在 A 下方')
})
