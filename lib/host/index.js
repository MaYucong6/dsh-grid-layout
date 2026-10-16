// src/host/index.ts
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";
var name = "dsh-grid-layout";
var inject = ["webServer"];
var ROUTE = "/dsh-grid-layout";
var HOME = join(homedir(), ".dsh", "grid-layout");
var LAYOUT_FILE = join(HOME, "layout.json");
var RULES_FILE = join(HOME, "rules.json");
function ensureHome() {
  try {
    mkdirSync(HOME, { recursive: true });
  } catch {
  }
}
function defaultLayout() {
  return { cols: 12, rowHeight: 42, gap: 12, boxes: [], groups: ["\u9ED8\u8BA4\u5206\u7EC4"] };
}
function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  ensureHome();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}
function sendText(res, body, status = 200) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 8e6) {
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function listDirectory(dir, showHidden, maxEntries) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    return { error: `\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55\uFF1A${String(error)}` };
  }
  const entries = [];
  const hardCap = maxEntries * 4;
  for (const entry of names) {
    if (!showHidden && entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    const isDir = st.isDirectory();
    entries.push({
      name: entry,
      path: full,
      kind: isDir ? "dir" : "file",
      ext: isDir ? "" : extname(entry).toLowerCase(),
      size: st.size,
      mtime: st.mtimeMs
    });
    if (entries.length >= hardCap) break;
  }
  const total = entries.length;
  return {
    path: dir,
    entries: entries.slice(0, maxEntries),
    total,
    truncated: total > maxEntries
  };
}
function apply(ctx) {
  ensureHome();
  const handler = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const sub = url.pathname.slice(ROUTE.length);
    try {
      if (sub === "/layout.json") {
        if (req.method === "GET") {
          const saved = readJson(LAYOUT_FILE, null);
          return sendJson(res, saved ?? defaultLayout());
        }
        if (req.method === "POST") {
          const layout = JSON.parse(await readBody(req));
          writeJson(LAYOUT_FILE, layout);
          return sendJson(res, { ok: true });
        }
        return sendText(res, "method not allowed", 405);
      }
      if (sub === "/list.json" && req.method === "GET") {
        const dir = url.searchParams.get("path");
        if (!dir) return sendJson(res, { error: "missing path" }, 400);
        const showHidden = url.searchParams.get("hidden") === "1";
        const max = Math.min(Number(url.searchParams.get("max") ?? 500) || 500, 5e3);
        return sendJson(res, listDirectory(dir, showHidden, max));
      }
      if (sub === "/rules.json") {
        if (req.method === "GET") return sendJson(res, readJson(RULES_FILE, []));
        if (req.method === "POST") {
          writeJson(RULES_FILE, JSON.parse(await readBody(req)));
          return sendJson(res, { ok: true });
        }
        return sendText(res, "method not allowed", 405);
      }
      return sendText(res, "not found", 404);
    } catch (error) {
      return sendJson(res, { error: String(error) }, 500);
    }
  };
  ctx.effect(
    () => ctx.webServer.register({ kind: "prefix", path: ROUTE, handler }),
    "dsh-grid-layout: layout + folder portal routes"
  );
}
export {
  apply,
  inject,
  name
};
