# DSH 格子化布局插件（Grid Layout）

一个为 DeepSeek Harness (DSH) 设计的「腾讯桌面整理」风格插件：把杂乱的面板、文件、便签、快捷入口收进可自由拖拽/缩放/折叠的毛玻璃格子里，让界面回到整洁状态。

> 本工程已**完整对接 DSH 真实约定并实测通过**：清单格式、Host 路由、Client `slots.inject/register`、loader 打包格式，
> 均逐条对照已安装的社区插件 `dsh-boot-animation` 的产物验证（详见第五节）。`lib/` 已构建完成，可直接安装。

---

## 一、技术选型与整体架构设计

### 1.1 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 插件框架 | **Cordis** | DSH 插件体系即 Cordis；Host 端为 Node 插件，Client 端为动态客户端 |
| UI 渲染 | **React**（DSH Client 内置，无 JSX → `React.createElement`） | DSH 动态 Client 运行时注入 React，但不做 JSX 转换 |
| 布局引擎 | **纯 TypeScript 自研**（不引 react-grid-layout） | 控制 bundle 体积、避免与 DSH overlay 层的定位冲突、便于单测 |
| 状态管理 | **极简外部 Store + `useState/useEffect` 订阅**（不引 Redux/Zustand） | 动态 Client bundle 越小越好 |
| 持久化 | **Host 端 `node:fs` → `~/.dsh/grid-layout/layout.json`** | 与社区插件一致，不依赖额外 Host 服务 |
| 文件投影 | **Host 端 `node:fs` + HTTP 路由** | 目录遍历在 Node 侧并服务端截断，浏览器只拿快照 |
| 拖拽 | **原生 Pointer Events + `setPointerCapture` + rAF 节流** | 不依赖 DnD 库，触屏/鼠标统一，GPU 合成定位 |
| 主题 | **`--dsw-alias-*` CSS 变量** | 自动跟随 DSH 明暗主题 |

### 1.2 分层架构

```
┌────────────────────────────────────────────────────────────┐
│  Client（浏览器，React）                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  shell.overlay Slot（帧级悬浮层）                     │  │
│  │   GridCanvas ──┬── GridBox × N（memo）                │  │
│  │                ├── TitleBar（拖拽 / 双击折叠）        │  │
│  │                ├── BoxBody（快捷入口/文件/便签/监控）  │  │
│  │                └── ResizeHandle（缩放）               │  │
│  │   store.ts —— 外部 Store + useStoreSlice 订阅         │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │ fetch('/dsh-grid-layout/...')   (HTTP)     │
└─────────────────┼───────────────────────────────────────────┘
                  │
┌─────────────────┼───────────────────────────────────────────┐
│  Host（Node，Cordis 插件，inject = ['webServer']）           │
│  ┌──────────────┴──────────────────────────────────────┐    │
│  │ apply(ctx) → ctx.webServer.register({ prefix, handler })│  │
│  │   GET/POST  /layout.json    布局快照读写              │    │
│  │   GET       /list.json      目录投影（服务端截断）    │    │
│  │   GET/POST  /rules.json     自动归类规则              │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │ node:fs                                    │
│                 └── ~/.dsh/grid-layout/{layout,rules}.json   │
└──────────────────────────────────────────────────────────────┘
```

### 1.3 核心数据模型（见 `src/core/types.ts`）

- `LayoutState { cols, rowHeight, gap, boxes, groups }` —— 画布整体状态
- `GridBox { id, title, kind, props, style, group, collapsed, x/y/w/h, minW/minH }`
  - `kind` 决定内容渲染器：`shortcuts` / `files` / `note` / `monitor`
  - `x/y/w/h` 均为**网格单元**，与像素解耦
- `BoxStyle { opacity, glass, accent }` —— 半透明/毛玻璃外观

---

## 二、核心代码实现

### 2.1 网格布局引擎（`src/core/layout.ts`）

引擎是纯函数集合，核心算法为 **「移除 → 重插 → 向下压实（resolveCollisions）」**，与 react-grid-layout 的 vertical-compact 行为一致但更精简：

```ts
// 冲突消解：pinned 格子钉在原位，其余依次向下推到首个不冲突的行
function resolveCollisions(layout, boxes, pinnedId?) {
  const sorted = [...boxes].sort((a, b) => {
    if (a.id === pinnedId) return -1
    if (b.id === pinnedId) return 1
    return a.y - b.y || a.x - b.x
  })
  const placed = []
  for (const box of sorted) {
    let y = box.y
    while (hitsAny(layout, { ...box, y }, placed)) y += 1
    placed.push({ ...box, y })
  }
  return placed
}

// 拖拽：把目标钉在新位置，其余格子让位
export function moveBox(layout, id, nextX, nextY) {
  const box = layout.boxes.find(b => b.id === id)
  if (!box) return layout
  const nx = clamp(Math.round(nextX), 0, layout.cols - box.w)
  const ny = Math.max(0, Math.round(nextY))
  const others = layout.boxes.filter(b => b.id !== id)
  return { ...layout, boxes: resolveCollisions(layout, [...others, { ...box, x: nx, y: ny }], id) }
}

// 折叠/展开：折叠后有效高度=1 行，释放空间被下方回收
export function setCollapsed(layout, id, collapsed) {
  const box = layout.boxes.find(b => b.id === id)
  const others = layout.boxes.filter(b => b.id !== id)
  const toggled = { ...box, collapsed }
  // 折叠时不 pin，让下方格子上浮回收空间；展开时 pin，向下推开冲突者
  return { ...layout, boxes: resolveCollisions(layout, [...others, toggled], collapsed ? undefined : id) }
}
```

关键点：
- `effectiveRows(box) = box.collapsed ? 1 : box.h` —— 卷起后只占标题栏一行
- `compact()` 一键整理：把所有格子向上压实、消除空洞
- `pixelsToGrid()` / `boxToPixels()` 完成网格单元 ↔ 像素的双向换算，拖拽时用网格吸附

### 2.2 拖拽 / 缩放 / 折叠（`src/client/components.ts`）

```ts
// 标题栏：Pointer Capture 拖拽 + rAF 节流 + 双击折叠
function TitleBar({ box, geo, store }) {
  const drag = useRef(null)
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)   // 指针移出元素仍持续接收事件
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x0: box.x, y0: box.y }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const nx = d.x0 + Math.round((e.clientX - d.startX) / (geo.colWidth + geo.gap))
    const ny = d.y0 + Math.round((e.clientY - d.startY) / (geo.rowHeight + geo.gap))
    if (d.raf) return                              // 一帧只提交一次
    d.raf = requestAnimationFrame(() => { d.raf = 0; store.move(box.id, nx, ny) })
  }
  const onPointerUp = () => { drag.current = null; store.flush() } // 松手才写回持久化
  return h('div', { onPointerDown, onPointerMove, onPointerUp, onDoubleClick: () => store.toggleCollapse(box.id) }, ...)
}
```

- 位置用 `transform: translate3d(x, y, 0)` 定位（走 GPU 合成层，不触发 reflow）
- 格子用 `memo` + 字段级比较，拖拽时只有被拖格子和被「顶开」的格子重渲染

### 2.3 自动归类（`src/core/auto-sort.ts`）

规则匹配是纯函数，Host 端执行：

```ts
export function matchRule(match, file) {
  switch (match.kind) {
    case 'ext':  return match.values.some(v => normalizeExt(file.ext) === normalizeExt(v))
    case 'name': return globToRegExp(match.pattern).test(file.name)
    case 'size': return (!match.gt || file.size > match.gt) && (!match.lt || file.size < match.lt)
    case 'tag':  return false // 需外部标签源，留扩展钩子
  }
}
export function routeFile(file, rules) {
  for (const r of rules) if (r.enabled && matchRule(r.match, file)) return r.targetBoxId
}
```

### 2.4 文件夹投影（`src/host/index.ts`）

Host 端注册 HTTP 路由，用 `node:fs` 读目录并在服务端截断（超大目录早停，避免灌爆浏览器）：

```ts
function listDirectory(dir: string, showHidden: boolean, maxEntries: number) {
  const entries: FileEntry[] = []
  const hardCap = maxEntries * 4                    // 早停上限
  for (const name of readdirSync(dir)) {
    if (!showHidden && name.startsWith('.')) continue
    const st = statSync(join(dir, name))
    entries.push({ name, path: join(dir, name),
                   kind: st.isDirectory() ? 'dir' : 'file',
                   ext: extname(name).toLowerCase(), size: st.size, mtime: st.mtimeMs })
    if (entries.length >= hardCap) break
  }
  return { path: dir, entries: entries.slice(0, maxEntries),
           total: entries.length, truncated: entries.length > maxEntries }
}

// 路由：GET /dsh-grid-layout/list.json?path=&max=&hidden=1
ctx.effect(
  () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }),
  'dsh-grid-layout: layout + folder portal routes',
)
```

---

## 三、性能优化建议（防止内容过多时卡顿）

1. **GPU 合成定位**：格子用 `translate3d` 而非 `left/top`，拖拽只在合成层上移动，避免布局重排。
2. **rAF 节流 + 松手才持久化**：`pointermove` 内用 `requestAnimationFrame` 合并一帧内的多次移动；写回走 `fetch POST /dsh-grid-layout/layout.json` 并做 400ms debounce（见 `store.ts`），拖拽过程零请求。
3. **`memo` + 字段级比较**：`GridBoxItem` 用 `boxPropsEqual` 只比较 `x/y/w/h/collapsed/...`，拖拽时无关格子不重渲染。
4. **文件列表虚拟滚动**：目录投影每次只取 `maxEntries`（默认 500）并在 Host 端截断；条目多时引入窗口化渲染（只渲染可视区 ±N 行），避免 DOM 节点爆炸。
5. **折叠优先 / 惰性内容**：`collapsed` 的格子不渲染 `BoxBody`；离开视口或折叠的格子内容懒加载，减少常驻 DOM。
6. **Host 端处理重活**：目录遍历、归类匹配都在 Node 侧完成，浏览器只拿结果快照。
7. **目录 watch 用 debounce/throttle**：`fs.watch` 的回调做节流，批量变更合并成一次刷新。
8. **不可变 + 归一化更新**：`LayoutState` 单事实源，所有动作走纯函数引擎，状态可预测、可 diff、可回放。
9. **事件委托**：拖拽/缩放只用每个格子的 `pointerdown` 捕获，`pointermove` 由被捕获元素接收，不挂全局监听。
10. **`will-change: transform`**：对即将拖拽的格子临时开启，提示浏览器提前建合成层；空闲时移除。

---

## 四、工程结构

```
dsh-grid-layout/
├── package.json              # DSH bundle 清单（dsh.bundle / dsh.client / dsh.engines）
├── cordis.patch.yml          # profile 层补丁：让包真正挂载进 profile
├── tsconfig.json
├── scripts/
│   └── build.mjs             # 打包：Host → lib/host，Client → loader 外壳单文件
├── src/
│   ├── core/                 # 纯逻辑，无 React/DOM 依赖，可单测
│   │   ├── types.ts          # 共享类型
│   │   ├── layout.ts         # 网格布局引擎（碰撞/压实/拖拽/缩放/折叠）
│   │   └── auto-sort.ts      # 自动归类规则引擎
│   ├── host/
│   │   └── index.ts          # Cordis 插件：HTTP 路由 + node:fs 持久化 + 目录投影
│   └── client/
│       ├── index.ts          # slots.inject/register 挂载 + fetch RPC + CSS 注入
│       ├── store.ts          # 外部 Store + useStoreSlice 订阅
│       └── components.ts     # GridCanvas / GridBox / 内容渲染器
├── demo/
│   └── index.html            # 零依赖演示页（纯原生 JS 版同一套引擎）
├── test/
│   └── layout.test.ts        # 布局引擎单元测试（拖拽推挤/压实/折叠）
├── lib/                      # 构建产物（发布内容）
│   ├── index.js              # → export { apply, name, inject } from './host/index.js'
│   ├── host/index.js         # Host 实现
│   ├── client.js             # Client（__ModuleLoader__.load 外壳）
│   └── types/*.d.ts
└── README.md
```

## 五、集成说明（已对照真实插件源码逐条验证）

本工程的接线方式**逐条对照了已安装的社区插件 `dsh-boot-animation@0.4.2` 的真实产物**
（`~/.dsh/profiles/desktop/node_modules/dsh-boot-animation`），不是猜测。

### 5.1 清单格式（`package.json`）

```json
{
  "main": "./lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json",
    "./cordis.patch.yml": "./cordis.patch.yml"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": ["@deepseek-ai/dsh-client-ui-slots"], "platform": "web" },
    "engines": { "dsh": ">=0.1.5-rc.1" }
  }
}
```

`dsh.bundle.patch` 指向 `cordis.patch.yml`，这是让包成为 **profile 层（layer）** 的关键；
缺了它，包会被安装但**不生效**，DSH 只会给出 `declares no dsh.bundle` 警告。

### 5.2 Host 端约定

```js
export const name = 'dsh-grid-layout'
export const inject = ['webServer']          // 唯一硬依赖

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/dsh-grid-layout', handler }),
    'dsh-grid-layout: layout + folder portal routes',
  )
}
```

- Host ↔ Client 通信走 **HTTP 路由**（`ctx.webServer.register`，Node 原生 `res.writeHead/res.end`），
  **不是** `host.call`（那个只用于动态 client half）。
- 持久化直接用 `node:fs` 写 `~/.dsh/grid-layout/layout.json`（与参考插件写
  `~/.dsh/boot-animation/selection.json` 一致），不依赖 `ctx.storage` / `ctx.fs`。

### 5.3 Client 端 Slot 注册（关键 API）

```js
export const inject = ['slots']

export function apply(ctx) {
  const wire = (ready) => {
    const register = () => {
      ready.slots.inject('shell.overlay', () =>
        ready.slots.register(
          { name: 'shell.overlay', id: 'dsh-grid-layout', order: 100, label: () => '格子化布局' },
          () => React.createElement(GridCanvas, { store }),
        ))
    }
    if (typeof ready.effect === 'function') ready.effect(register, 'dsh-grid-layout: mounts')
    else register()
  }
  if (typeof ctx.inject === 'function') { ctx.inject(['slots'], wire); return }
  if (ctx.slots !== undefined) wire(ctx)
}
```

### 5.4 Client 打包格式

DSH 要求 Client 产物是**单文件**并包在 loader 外壳里（`react` 由外壳的 `require` 提供）：

```js
window.__ModuleLoader__.load({
  id: "dsh-grid-layout",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    /* ... 打包后的代码 ... */
    return module.exports;
  }
});
```

### 5.5 已验证结果（实测）

| 检查项 | 结果 |
|---|---|
| `npm run build` 产出 `lib/` | ✅ `client.js` 22.9KB / `host/index.js` 4.2KB / `index.js` / `types/*.d.ts` |
| Host 导出形状 | ✅ `["apply","inject","name"]`，`inject=["webServer"]` |
| Host 路由注册 | ✅ `effect` + `register{kind:'prefix', path:'/dsh-grid-layout'}` |
| 布局持久化往返 | ✅ POST 保存 → GET 回读一致，落盘 `~/.dsh/grid-layout/layout.json` |
| 目录投影 + 上限截断 | ✅ `total=10, truncated=true`（max=5 生效） |
| Client 加载器格式 | ✅ `window.__ModuleLoader__.load({id:"dsh-grid-layout", ...})` |
| Client 导出 | ✅ `["apply","inject"]`，`inject=["slots"]` |
| **Slot 注册调用链** | ✅ `ctx.inject(['slots'])` → `effect` → `slots.inject('shell.overlay')` → `slots.register({name,id,order,label})` → `React.createElement(GridCanvas)` |

### 5.6 安装与启用

```bash
cd dsh-grid-layout
npm install --registry=https://registry.npmmirror.com   # 仅构建期需要（esbuild）
npm run build                                           # 产出 lib/

# 安装进 profile
dsh plugin --profile desktop add dsh-grid-layout
# 或在 DSH 对话里用内置工具：plugin_manager → install_bundle
```

重启 DSH 后，网格画布会出现在帧级悬浮层；布局自动存到 `~/.dsh/grid-layout/layout.json`。

**纯前端快速验证（不接 DSH）：** 直接双击 `demo/index.html`（零依赖，纯原生 JS 版同一套引擎），
用真实浏览器打开即可体验拖拽 / 双击折叠 / 缩放 / 一键整理。注意：**不要用 DSH 自带的文档预览器打开**，
该预览器出于安全会禁用脚本，页面会停在「脚本未执行」。
