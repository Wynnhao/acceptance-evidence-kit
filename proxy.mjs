// fault-proxy (demo) — 受限静态服务器 + 缺陷注入层。只监听 127.0.0.1。
// 用法: node proxy.mjs [--root sample-site] [--port 8652] [--injections faults-demo.json] [--only W1,S1]
// 边界：不服务 root 之外路径；注入规格只在启动时读取——换故障场景需重启进程（确定性保证）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries((() => { const o = []; const a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o.push([a[i].replace(/^--/, ""), a[i + 1]]); return o; })());
const ROOT = path.resolve(HERE, args.root || "sample-site");
const PORT = Number(args.port || 8652);
const INJ = args.injections
  ? JSON.parse(fs.readFileSync(path.resolve(HERE, args.injections), "utf8"))
  : { injections: [] };
const active = new Map(
  (INJ.injections || [])
    .filter((x) => !args.only || args.only.split(",").map((s) => s.trim()).includes(x.id))
    .map((x) => [x.id, x])
);
const log = (m) => console.log(`[proxy] ${m}`);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".csv": "text/csv",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".map": "application/json",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp",
};

function patchHtml(html) {
  let out = html;
  const headScripts = [...active.values()].filter((x) => x.type === "html_head_script");
  const headCss = [...active.values()].filter((x) => x.type === "html_head_css");
  if (headScripts.length) out = out.replace("</head>", headScripts.map((x) => `<script>${x.content}</script>`).join("\n") + "</head>");
  if (headCss.length) out = out.replace("</head>", headCss.map((x) => `<style>${x.content}</style>`).join("\n") + "</head>");
  return out;
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  log(`${req.method} ${p}`);
  if (p.includes("..")) { res.writeHead(400).end(); return; }

  for (const inj of active.values()) {
    if (inj.type === "block" && p.startsWith(inj.path)) {
      res.writeHead(403, { "content-type": "text/plain" }).end("injected-fault");
      return;
    }
  }

  let file = path.join(ROOT, p === "/" ? "index.html" : p);
  if (!file.startsWith(ROOT)) { res.writeHead(400).end(); return; }
  if (!fs.existsSync(file) && !path.extname(file)) file += ".html";
  if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }

  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  if (ext === ".html") body = Buffer.from(patchHtml(body.toString("utf8")), "utf8");
  for (const inj of active.values()) {
    if ((inj.type === "string_replace" || inj.type === "full_replace") && p === inj.path) {
      let text = body.toString("utf8");
      if (inj.type === "string_replace") {
        if (!text.includes(inj.find)) { log(`WARN replace-miss ${inj.id}`); continue; }
        text = text.split(inj.find).join(inj.with);
      } else text = inj.content;
      body = Buffer.from(text, "utf8");
    }
  }
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-store" });
  res.end(body);
}).listen(PORT, "127.0.0.1", () => log(`serving ${ROOT}:${PORT} active-injections=${[...active.keys()].join(",") || "none"}`));
