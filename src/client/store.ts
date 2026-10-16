/**
 * Client 端状态管理 —— 极简外部 Store（不引入 Redux/Zustand，控制 bundle 体积）。
 *
 * 设计：
 * - 单一 LayoutState 作为唯一事实源；
 * - 所有变更走纯函数布局引擎（src/core/layout.ts），不可变更新；
 * - 订阅器 + React hooks 集成（不依赖 useSyncExternalStore，兼容性更好）；
 * - 写回 Host 端持久化做 debounce，避免拖拽过程中频繁 RPC。
 */

import * as React from 'react'
import type { GridBox, LayoutState } from '../core/types'
import * as engine from '../core/layout'

/** Host RPC 门面（对应 src/host/index.ts 暴露的方法） */
export interface HostRpc {
  call(method: string, args?: unknown): Promise<unknown>
}

type Listener = (state: LayoutState) => void

export interface GridStore {
  /** 当前布局状态 */
  getState(): LayoutState
  subscribe(listener: Listener): () => void
  /** Host RPC（供内容渲染器读取目录/打开快捷方式） */
  host: HostRpc
  // 动作（均不可变更新 + 通知 + 延迟持久化）
  move(id: string, x: number, y: number): void
  resize(id: string, w: number, h: number): void
  toggleCollapse(id: string): void
  tidy(): void
  addBox(box: GridBox): void
  removeBox(id: string): void
  patchBox(id: string, patch: Partial<GridBox>): void
  /** 用宿主端持久化数据整体替换（初始加载） */
  replace(next: LayoutState): void
  /** 立即写回持久化（拖拽/缩放结束） */
  flush(): void
}

export function createGridStore(
  initial: LayoutState,
  host: HostRpc,
): GridStore {
  let state: LayoutState = initial
  const listeners = new Set<Listener>()
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function notify() {
    for (const l of listeners) l(state)
  }

  function set(next: LayoutState) {
    state = next
    notify()
    // 持久化 debounce：拖拽/缩放高频调用时合并写回
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void host.call('gridLayout.save', state)
    }, 400)
  }

  return {
    host,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    move(id, x, y) {
      set(engine.moveBox(state, id, x, y))
    },
    resize(id, w, h) {
      set(engine.resizeBox(state, id, w, h))
    },
    toggleCollapse(id) {
      const box = state.boxes.find((b) => b.id === id)
      if (box) set(engine.setCollapsed(state, id, !box.collapsed))
    },
    tidy() {
      set(engine.compact(state))
    },
    addBox(box) {
      set({ ...state, boxes: [...state.boxes, box] })
    },
    removeBox(id) {
      set({ ...state, boxes: state.boxes.filter((b) => b.id !== id) })
    },
    patchBox(id, patch) {
      set({
        ...state,
        boxes: state.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })
    },
    replace(next) {
      state = next
      notify()
    },
    flush() {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      void host.call('gridLayout.save', state)
    },
  }
}

/**
 * React 订阅 Hook：selector 返回的切片用 Object.is 浅比较，避免无关更新触发重渲染。
 */
export function useStoreSlice<S>(
  store: GridStore,
  selector: (state: LayoutState) => S,
  deps: readonly unknown[],
): S {
  const [slice, setSlice] = React.useState<S>(() => selector(store.getState()))
  React.useEffect(() => {
    setSlice(selector(store.getState()))
    return store.subscribe((next) => {
      const nextSlice = selector(next)
      setSlice((prev: S) => (Object.is(prev, nextSlice) ? prev : nextSlice))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return slice
}
