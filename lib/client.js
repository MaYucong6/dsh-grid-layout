window.__ModuleLoader__.load({
	id: "dsh-grid-layout",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		"use strict";
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
		  // If the importer is in node compatibility mode or this is not an ESM
		  // file that has been converted to a CommonJS file using a Babel-
		  // compatible transform (i.e. "__esModule" has not been set), then set
		  // "default" to the CommonJS "module.exports" for node compatibility.
		  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
		  mod
		));
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);
		var React3 = __toESM(require("react"), 1);

		// src/client/store.ts
		var React = __toESM(require("react"), 1);

		// src/core/layout.ts
		function collides(a, b) {
		  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		}
		function effectiveRows(box) {
		  return box.collapsed ? 1 : box.h;
		}
		function rect(box) {
		  return { ...box, h: effectiveRows(box) };
		}
		function clamp(v, min, max) {
		  return Math.max(min, Math.min(max, v));
		}
		function hitsAny(layout, box, others) {
		  const probe = rect({ ...box, x: box.x, y: box.y });
		  for (const other of others) {
		    if (other.id === box.id) continue;
		    if (collides(probe, rect(other))) return true;
		  }
		  return false;
		}
		function resolveCollisions(layout, boxes, pinnedId) {
		  const sorted = [...boxes].sort((a, b) => {
		    if (a.id === pinnedId) return -1;
		    if (b.id === pinnedId) return 1;
		    return a.y - b.y || a.x - b.x;
		  });
		  const placed = [];
		  for (const box of sorted) {
		    const candidate = { ...box };
		    let y = candidate.y;
		    while (hitsAny(layout, { ...candidate, y }, placed)) {
		      y += 1;
		    }
		    placed.push({ ...candidate, y });
		  }
		  return placed;
		}
		function compactList(layout, boxes) {
		  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
		  const placed = [];
		  for (const box of sorted) {
		    let y = 0;
		    while (hitsAny(layout, { ...box, y }, placed)) y += 1;
		    placed.push({ ...box, y });
		  }
		  return placed;
		}
		function compact(layout) {
		  return { ...layout, boxes: compactList(layout, layout.boxes) };
		}
		function moveBox(layout, id, nextX, nextY) {
		  const box = layout.boxes.find((b) => b.id === id);
		  if (!box) return layout;
		  const w = box.w;
		  const nx = clamp(Math.round(nextX), 0, layout.cols - w);
		  const ny = Math.max(0, Math.round(nextY));
		  if (nx === box.x && ny === box.y) return layout;
		  const others = layout.boxes.filter((b) => b.id !== id);
		  const moved = { ...box, x: nx, y: ny };
		  return { ...layout, boxes: resolveCollisions(layout, [...others, moved], id) };
		}
		function resizeBox(layout, id, nextW, nextH) {
		  const box = layout.boxes.find((b) => b.id === id);
		  if (!box || box.collapsed) return layout;
		  const minW = box.minW ?? 1;
		  const minH = box.minH ?? 1;
		  const w = clamp(Math.round(nextW), minW, layout.cols - box.x);
		  const h2 = Math.max(minH, Math.round(nextH));
		  if (w === box.w && h2 === box.h) return layout;
		  const others = layout.boxes.filter((b) => b.id !== id);
		  const resized = { ...box, w, h: h2 };
		  return { ...layout, boxes: resolveCollisions(layout, [...others, resized], id) };
		}
		function setCollapsed(layout, id, collapsed) {
		  const box = layout.boxes.find((b) => b.id === id);
		  if (!box || box.collapsed === collapsed) return layout;
		  const others = layout.boxes.filter((b) => b.id !== id);
		  const toggled = { ...box, collapsed };
		  const boxes = collapsed ? compactList(layout, [toggled, ...others]) : resolveCollisions(layout, [...others, toggled], id);
		  return { ...layout, boxes };
		}
		function computeGeometry(layout, containerWidth) {
		  const { cols, rowHeight, gap } = layout;
		  const colWidth = (containerWidth - gap * (cols + 1)) / cols;
		  return { colWidth, rowHeight, gap, cols };
		}
		function boxToPixels(box, geo) {
		  const rows = effectiveRows(box);
		  return {
		    x: box.x * (geo.colWidth + geo.gap) + geo.gap,
		    y: box.y * (geo.rowHeight + geo.gap) + geo.gap,
		    w: box.w * geo.colWidth + (box.w - 1) * geo.gap,
		    h: rows * geo.rowHeight + (rows - 1) * geo.gap
		  };
		}
		function maxRow(layout) {
		  return layout.boxes.reduce((m, b) => Math.max(m, b.y + effectiveRows(b)), 0);
		}
		function findFreePosition(layout, w, h2) {
		  const x = 0;
		  let y = maxRow(layout);
		  while (hitsAny(layout, { id: "__probe__", x, y, w, h: h2, collapsed: false }, layout.boxes)) {
		    y += 1;
		  }
		  return { x, y };
		}
		function uid() {
		  return "box-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
		}

		// src/client/store.ts
		function createGridStore(initial, host) {
		  let state = initial;
		  const listeners = /* @__PURE__ */ new Set();
		  let persistTimer = null;
		  function notify() {
		    for (const l of listeners) l(state);
		  }
		  function set(next) {
		    state = next;
		    notify();
		    if (persistTimer) clearTimeout(persistTimer);
		    persistTimer = setTimeout(() => {
		      void host.call("gridLayout.save", state);
		    }, 400);
		  }
		  return {
		    host,
		    getState: () => state,
		    subscribe(listener) {
		      listeners.add(listener);
		      return () => listeners.delete(listener);
		    },
		    move(id, x, y) {
		      set(moveBox(state, id, x, y));
		    },
		    resize(id, w, h2) {
		      set(resizeBox(state, id, w, h2));
		    },
		    toggleCollapse(id) {
		      const box = state.boxes.find((b) => b.id === id);
		      if (box) set(setCollapsed(state, id, !box.collapsed));
		    },
		    tidy() {
		      set(compact(state));
		    },
		    addBox(box) {
		      set({ ...state, boxes: [...state.boxes, box] });
		    },
		    removeBox(id) {
		      set({ ...state, boxes: state.boxes.filter((b) => b.id !== id) });
		    },
		    patchBox(id, patch) {
		      set({
		        ...state,
		        boxes: state.boxes.map((b) => b.id === id ? { ...b, ...patch } : b)
		      });
		    },
		    replace(next) {
		      state = next;
		      notify();
		    },
		    flush() {
		      if (persistTimer) {
		        clearTimeout(persistTimer);
		        persistTimer = null;
		      }
		      void host.call("gridLayout.save", state);
		    }
		  };
		}

		// src/client/components.ts
		var React2 = __toESM(require("react"), 1);
		var { useMemo, useRef, useState: useState2, useEffect: useEffect2, memo, useCallback } = React2;
		var h = React2.createElement;
		function GridCanvas(props) {
		  const { store } = props;
		  const layout = useLayoutState(store);
		  const ref = useRef(null);
		  const [width, setWidth] = useState2(0);
		  const [hidden, setHidden] = useState2(false);
		  useEffect2(() => {
		    const el = ref.current;
		    if (!el) return;
		    const measure = () => setWidth(el.clientWidth);
		    measure();
		    const ro = new ResizeObserver(measure);
		    ro.observe(el);
		    return () => ro.disconnect();
		  }, []);
		  const geo = width > 0 ? computeGeometry(layout, width) : null;
		  const rows = maxRow(layout);
		  const canvasHeight = geo ? rows * (geo.rowHeight + geo.gap) + geo.gap : 0;
		  return h(
		    "div",
		    { className: "dgl-canvas" + (hidden ? " is-hidden" : ""), ref },
		    h(Toolbar, { store, layout }),
		    h(
		      "div",
		      {
		        className: "dgl-grid",
		        style: { height: canvasHeight }
		      },
		      geo && layout.boxes.map(
		        (box) => h(GridBoxItem, {
		          key: box.id,
		          box,
		          geo,
		          store
		        })
		      )
		    ),
		    h(
		      "button",
		      { className: "dgl-toggle", onClick: () => setHidden(!hidden) },
		      hidden ? "\u2630 \u663E\u793A\u683C\u5B50" : "\u2014 \u9690\u85CF\u683C\u5B50"
		    )
		  );
		}
		function useLayoutState(store) {
		  const [state, setState] = useState2(() => store.getState());
		  useEffect2(() => store.subscribe(setState), [store]);
		  return state;
		}
		function Toolbar(props) {
		  const { store, layout } = props;
		  const addNote = () => {
		    const { x, y } = findFreePosition(layout, 4, 3);
		    store.addBox({
		      id: uid(),
		      title: "\u4FBF\u7B7E",
		      kind: "note",
		      props: { kind: "note", note: { text: "\u53CC\u51FB\u6807\u9898\u680F\u53EF\u5377\u8D77" } },
		      style: { opacity: 0.92, glass: true },
		      group: "\u9ED8\u8BA4\u5206\u7EC4",
		      collapsed: false,
		      x,
		      y,
		      w: 4,
		      h: 3,
		      minW: 2,
		      minH: 2
		    });
		  };
		  const collapseAll = () => {
		    layout.boxes.forEach((b) => {
		      if (!b.collapsed) store.toggleCollapse(b.id);
		    });
		  };
		  return h(
		    "div",
		    { className: "dgl-toolbar" },
		    h("button", { onClick: addNote }, "\uFF0B \u4FBF\u7B7E"),
		    h("button", { onClick: () => store.tidy() }, "\u2912 \u4E00\u952E\u6574\u7406"),
		    h("button", { onClick: collapseAll }, "\u2581 \u6298\u53E0\u5168\u90E8")
		  );
		}
		var GridBoxItem = memo(function GridBoxItem2(props) {
		  const { box, geo, store } = props;
		  const px = boxToPixels(box, geo);
		  return h(
		    "div",
		    {
		      className: "dgl-box" + (box.collapsed ? " is-collapsed" : ""),
		      style: {
		        transform: `translate3d(${px.x}px, ${px.y}px, 0)`,
		        width: px.w,
		        height: px.h,
		        opacity: box.style.opacity
		      }
		    },
		    h(TitleBar, { box, geo, store }),
		    box.collapsed ? null : h(BoxBody, { box, store }),
		    box.collapsed ? null : h(ResizeHandle, { box, geo, store })
		  );
		}, boxPropsEqual);
		function boxPropsEqual(a, b) {
		  const A = a.box;
		  const B = b.box;
		  return A.id === B.id && A.x === B.x && A.y === B.y && A.w === B.w && A.h === B.h && A.collapsed === B.collapsed && A.title === B.title && A.kind === B.kind && A.style === B.style && A.props === B.props;
		}
		function TitleBar(props) {
		  const { box, geo, store } = props;
		  const drag = useRef(null);
		  const onPointerDown = useCallback((e) => {
		    if (e.button !== 0) return;
		    e.currentTarget.setPointerCapture(e.pointerId);
		    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x0: box.x, y0: box.y, raf: 0 };
		  }, [box.x, box.y]);
		  const onPointerMove = useCallback((e) => {
		    const d = drag.current;
		    if (!d || e.pointerId !== d.id) return;
		    const colStep = geo.colWidth + geo.gap;
		    const rowStep = geo.rowHeight + geo.gap;
		    const nx = d.x0 + Math.round((e.clientX - d.startX) / colStep);
		    const ny = d.y0 + Math.round((e.clientY - d.startY) / rowStep);
		    if (d.raf) return;
		    d.raf = requestAnimationFrame(() => {
		      d.raf = 0;
		      store.move(box.id, nx, ny);
		    });
		  }, [box.id, geo.colWidth, geo.gap, geo.rowHeight, store]);
		  const onPointerUp = useCallback((e) => {
		    if (!drag.current || e.pointerId !== drag.current.id) return;
		    drag.current = null;
		    store.flush();
		  }, [store]);
		  return h(
		    "div",
		    {
		      className: "dgl-titlebar",
		      onPointerDown,
		      onPointerMove,
		      onPointerUp,
		      onDoubleClick: () => store.toggleCollapse(box.id),
		      title: "\u62D6\u62FD\u79FB\u52A8 \xB7 \u53CC\u51FB\u5377\u8D77/\u5C55\u5F00"
		    },
		    h("span", { className: "dgl-title" }, box.title),
		    h("span", { className: "dgl-fold-hint" }, box.collapsed ? "\u25B8" : "\u25BE")
		  );
		}
		function ResizeHandle(props) {
		  const { box, geo, store } = props;
		  const rs = useRef(null);
		  const onPointerDown = useCallback((e) => {
		    e.stopPropagation();
		    e.preventDefault();
		    e.currentTarget.setPointerCapture(e.pointerId);
		    rs.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, w0: box.w, h0: box.h, raf: 0 };
		  }, [box.w, box.h]);
		  const onPointerMove = useCallback((e) => {
		    const s = rs.current;
		    if (!s || e.pointerId !== s.id) return;
		    const nw = s.w0 + Math.round((e.clientX - s.startX) / (geo.colWidth + geo.gap));
		    const nh = s.h0 + Math.round((e.clientY - s.startY) / (geo.rowHeight + geo.gap));
		    if (s.raf) return;
		    s.raf = requestAnimationFrame(() => {
		      s.raf = 0;
		      store.resize(box.id, nw, nh);
		    });
		  }, [box.id, geo.colWidth, geo.gap, geo.rowHeight, store]);
		  const onPointerUp = useCallback((e) => {
		    if (!rs.current || e.pointerId !== rs.current.id) return;
		    rs.current = null;
		    store.flush();
		  }, [store]);
		  return h("span", {
		    className: "dgl-resize",
		    onPointerDown,
		    onPointerMove,
		    onPointerUp,
		    title: "\u62D6\u62FD\u8C03\u6574\u5927\u5C0F"
		  });
		}
		function BoxBody(props) {
		  const { box, store } = props;
		  switch (box.kind) {
		    case "note":
		      return h(NoteBody, { box, store });
		    case "files":
		      return h(FilesBody, { box, store });
		    case "shortcuts":
		      return h(ShortcutsBody, { box, store });
		    case "monitor":
		      return h(MonitorBody, { box, store });
		    default:
		      return h("div", { className: "dgl-body" }, "\u672A\u77E5\u7C7B\u578B");
		  }
		}
		function NoteBody(props) {
		  const text = props.box.props.note?.text ?? "";
		  const onChange = (e) => {
		    const b = props.box;
		    props.store.patchBox(b.id, {
		      props: { kind: "note", note: { text: e.target.value } }
		    });
		  };
		  return h("textarea", {
		    className: "dgl-note",
		    value: text,
		    onChange,
		    placeholder: "\u5199\u70B9\u4EC0\u4E48\u2026"
		  });
		}
		function ShortcutsBody(props) {
		  const items = props.box.props.items ?? [];
		  return h(
		    "div",
		    { className: "dgl-shortcuts" },
		    items.map(
		      (it) => h("button", {
		        key: it.id,
		        className: "dgl-shortcut",
		        onClick: () => props.store.host.call("shortcuts.open", it)
		      }, it.icon ? it.icon + " " : "", it.label)
		    )
		  );
		}
		function FilesBody(props) {
		  const portal = props.box.props.portal;
		  const [listing, setListing] = useState2(null);
		  useEffect2(() => {
		    if (!portal?.directory) return;
		    let alive = true;
		    void props.store.host.call("folderPortal.list", portal.directory, { maxEntries: portal.maxEntries ?? 500 }).then((r) => {
		      if (alive) setListing(r);
		    });
		    return () => {
		      alive = false;
		    };
		  }, [portal?.directory, props.store]);
		  if (!listing) return h("div", { className: "dgl-body" }, "\u52A0\u8F7D\u76EE\u5F55\u4E2D\u2026");
		  return h(
		    "div",
		    { className: "dgl-files" },
		    listing.entries.map(
		      (f) => h(
		        "div",
		        { key: f.path, className: "dgl-file" },
		        h("span", { className: "dgl-file-name" }, f.name),
		        h("span", { className: "dgl-file-meta" }, f.kind === "dir" ? "\u{1F4C1}" : formatSize(f.size))
		      )
		    ),
		    listing.truncated ? h("div", { className: "dgl-truncated" }, `\u4EC5\u663E\u793A\u524D ${listing.entries.length} \u9879\uFF0C\u5171 ${listing.total} \u9879`) : null
		  );
		}
		function MonitorBody(props) {
		  const m = props.box.props.monitor;
		  return h(
		    "div",
		    { className: "dgl-monitor" },
		    h("div", { className: "dgl-metric" }, m?.metric ?? "\u2014"),
		    h("div", { className: "dgl-metric-label" }, "\u72B6\u6001\u76D1\u63A7\u5360\u4F4D\uFF08\u53EF\u7531 Provider \u6CE8\u5165\u5B9E\u65F6\u6570\u636E\uFF09")
		  );
		}
		function formatSize(n) {
		  if (n < 1024) return n + " B";
		  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
		  return (n / 1024 / 1024).toFixed(1) + " MB";
		}

		// src/client/index.ts
		var inject = ["slots"];
		var ROUTE = "/dsh-grid-layout";
		var STYLE_ID = "dsh-grid-layout-style";
		var CSS = `
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
		`;
		function ensureStyles() {
		  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
		  const el = document.createElement("style");
		  el.id = STYLE_ID;
		  el.textContent = CSS;
		  document.head.appendChild(el);
		}
		function createHostRpc() {
		  const json = async (path, init) => {
		    const res = await fetch(ROUTE + path, init);
		    if (!res.ok) throw new Error(`${path} \u2192 HTTP ${res.status}`);
		    return res.json();
		  };
		  return {
		    async call(method, args) {
		      switch (method) {
		        case "gridLayout.get":
		          return json("/layout.json");
		        case "gridLayout.save":
		          return json("/layout.json", {
		            method: "POST",
		            headers: { "content-type": "application/json" },
		            body: JSON.stringify(args)
		          });
		        case "folderPortal.list": {
		          const [dir, opts] = args;
		          const q = new URLSearchParams({
		            path: dir,
		            max: String(opts?.maxEntries ?? 500),
		            hidden: opts?.showHidden ? "1" : "0"
		          });
		          return json("/list.json?" + q.toString());
		        }
		        default:
		          throw new Error("unknown method: " + method);
		      }
		    }
		  };
		}
		function apply(ctx) {
		  const wire = (ready) => {
		    const register = () => {
		      ensureStyles();
		      const initial = {
		        cols: 12,
		        rowHeight: 42,
		        gap: 12,
		        boxes: [],
		        groups: ["\u9ED8\u8BA4\u5206\u7EC4"]
		      };
		      const store = createGridStore(initial, createHostRpc());
		      void Promise.resolve().then(() => store.host.call("gridLayout.get")).then((saved) => {
		        if (saved) store.replace(saved);
		      }).catch(() => {
		      });
		      ready.slots.inject(
		        "shell.overlay",
		        () => ready.slots.register(
		          {
		            name: "shell.overlay",
		            id: "dsh-grid-layout",
		            order: 100,
		            label: () => "\u683C\u5B50\u5316\u5E03\u5C40"
		          },
		          () => React3.createElement(GridCanvas, { store })
		        )
		      );
		    };
		    if (typeof ready.effect === "function") ready.effect(register, "dsh-grid-layout: mounts");
		    else register();
		  };
		  if (typeof ctx.inject === "function") {
		    ctx.inject(["slots"], wire);
		    return;
		  }
		  if (ctx.slots !== void 0) wire(ctx);
		}

		return module.exports;
	}
});
