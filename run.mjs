// runner (demo) — manifest 驱动的验收执行链 + 证据报告。
// 用法: node run.mjs [--manifest manifest.json] [--out out/名称]
// 依赖: Playwright（本目录执行 npm i playwright && npx playwright install chromium，
//       或 env PLAYWRIGHT_PATH 指向可用的 playwright 入口文件）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries((() => { const o = []; const a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o.push([a[i].replace(/^--/, ""), a[i + 1]]); return o; })());
const manifest = JSON.parse(fs.readFileSync(path.resolve(HERE, args.manifest || "manifest.json"), "utf8"));
const OUT = path.resolve(HERE, args.out || path.join("out", new Date().toISOString().replace(/[:.]/g, "-")));
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, "playwright"].filter(Boolean);
  for (const c of candidates) {
    try { return await import(c.startsWith("/") || /^[A-Za-z]:/.test(c) ? pathToFileURL(c).href : c); } catch { /* try next */ }
  }
  throw new Error("找不到 playwright：在本目录执行 npm i playwright && npx playwright install chromium，或设 PLAYWRIGHT_PATH");
}
const { chromium } = await loadPlaywright();

const L = manifest.limits;
const G = manifest.generic || {};
const results = [];
let stepsUsed = 0;
let aborted = false;
const consoleErrors = [];
const netFailures = [];

function record(step, status, detail, evidence = []) {
  results.push({ path: step.__path, step: step.id, name: step.expect || step.action || "", status, detail, evidence, reverified: !!step.__reverified });
}
async function shot(page, id) {
  const p = path.join(OUT, "screenshots", `${id}.png`);
  try { await page.screenshot({ path: p }); return path.relative(OUT, p); } catch { return null; }
}

async function runAsserts(page, step) {
  const fails = [];
  for (const a of step.assert || []) {
    const sel = a.selector;
    try {
      if (a.kind === "visible") {
        await page.waitForSelector(sel, { state: "visible", timeout: 5000 });
      } else if (a.kind === "not_visible" || a.kind === "count0") {
        await page.waitForTimeout(500);
        const c = await page.locator(sel).count();
        if (a.kind === "count0" ? c !== 0 : c !== 0 && await page.locator(sel).first().isVisible().catch(() => false)) throw new Error(`${sel} 仍可见/存在(${c})`);
      } else if (a.kind === "text") {
        await page.waitForSelector(sel, { state: "visible", timeout: 5000 });
        const t = await page.locator(sel).first().innerText();
        if (!t.includes(a.contains)) throw new Error(`${sel} 文本「${t.slice(0, 60)}」不含「${a.contains}」`);
      } else if (a.kind === "style") {
        const el = page.locator(a.selector).first();
        await el.waitFor({ state: "attached", timeout: 5000 });
        const st = await el.evaluate((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { filter: c.filter, display: c.display, visibility: c.visibility, w: r.width, h: r.height }; });
        const problems = [];
        if (a.filter_none && st.filter !== "none") problems.push(`filter=${st.filter}`);
        if (st.display === "none" || st.visibility === "hidden") problems.push(`display/visibility=${st.display}/${st.visibility}`);
        if (a.min_size && (st.w < a.min_size || st.h < a.min_size)) problems.push(`尺寸 ${Math.round(st.w)}x${Math.round(st.h)}`);
        if (problems.length) throw new Error("样式破损: " + problems.join(", "));
      } else if (a.kind === "state_change") {
        const before = step.__before || [];
        await page.waitForTimeout(600);
        const after = await page.$$eval(a.selector, (els) => els.map((e) => e.textContent.trim()));
        const diff = after.filter((v, i) => v !== (before[i] ?? "__new__")).length + Math.abs(after.length - before.length);
        if (diff < (a.min_changed || 1)) throw new Error("操作后状态无可见变化（疑似交互失效）");
      }
    } catch (e) { fails.push(`${a.note || sel}: ${e.message.split("\n")[0]}`); }
  }
  return fails;
}

async function snapshotState(page, step) {
  for (const a of step.assert || []) {
    if (a.kind === "state_change") {
      step.__before = await page.$$eval(a.selector, (els) => els.map((e) => e.textContent.trim())).catch(() => []);
    }
  }
}

async function doAction(page, step) {
  const base = manifest.base_url;
  switch (step.action) {
    case "goto": await page.goto(base + "/", { waitUntil: "networkidle", timeout: L.nav_timeout_ms }); break;
    case "reload": await page.reload({ waitUntil: "networkidle", timeout: L.nav_timeout_ms }); break;
    case "click": await page.click(step.selector, { timeout: L.step_timeout_ms }); break;
    case "hover": await page.hover(step.selector, { timeout: L.step_timeout_ms }); break;
    case "wait": await page.waitForTimeout(step.ms || 300); break;
    case "skip": throw new Error("declared-only：本链未执行该步骤");
  }
}

async function execStep(page, step) {
  stepsUsed++;
  await snapshotState(page, step);
  try { await doAction(page, step); } catch (e) {
    if (step.action === "click" || step.action === "hover") {
      try { await page.waitForTimeout(400); await doAction(page, step); }
      catch (e2) {
        let blocker = "";
        try {
          const box = await page.locator(step.selector).boundingBox({ timeout: 2000 });
          if (box) blocker = " | 拦截元素: " + await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y); if (!el) return "null";
            const chain = []; let n = el;
            for (let i = 0; i < 4 && n; i++) { chain.push(n.tagName + "." + (typeof n.className === "string" ? n.className.slice(0, 40) : "") + "#" + (n.getAttribute("data-testid") || n.id)); n = n.parentElement; }
            return chain.join(" < ");
          }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        } catch { /* 目标不存在时跳过诊断 */ }
        return `动作失败(${step.action} ${step.selector || ""}): ${e2.message.split("\n")[0]}${blocker}`;
      }
    } else return `动作失败(${step.action} ${step.selector || ""}): ${e.message.split("\n")[0]}`;
  }
  const fails = await runAsserts(page, step);
  return fails.length ? fails.join("；") : null;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ text: m.text().slice(0, 300), url: m.location()?.url || "" }); });
page.on("pageerror", (e) => consoleErrors.push({ text: "[uncaught] " + String(e.message).slice(0, 300), url: page.url() }));
page.on("requestfailed", (r) => netFailures.push(`${r.url().replace(manifest.base_url, "")} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400) netFailures.push(`${r.url().replace(manifest.base_url, "")} HTTP ${r.status()}`); });

for (const p of manifest.paths) {
  for (const step of p.steps) {
    step.__path = p.id;
    if (step.action === "skip") { record(step, "UNVERIFIED", "声明未执行（declared-only），不冒充覆盖"); continue; }
    if (aborted || stepsUsed >= L.max_total_steps) { record(step, "UNVERIFIED", aborted ? "前序失败级联，未执行" : "超出步数上限，未执行"); continue; }
    let err = await execStep(page, step);
    let evidence = [];
    if (err && (step.assert || []).length) {
      step.__reverified = true; // 候选缺陷：独立复验一次，非放宽断言
      const err2 = await execStep(page, step);
      err = err2;
      const s = await shot(page, `${step.id}-${err ? "fail" : "reverify-ok"}`);
      if (s) evidence.push(s);
    }
    if (err) {
      record(step, "FAILED", err, evidence.length ? evidence : [(await shot(page, `${step.id}-fail`))].filter(Boolean));
      if ((manifest.abort_steps || []).includes(step.id)) aborted = true;
      continue;
    }
    record(step, "PASSED", "通过", stepsUsed % 6 === 0 ? [(await shot(page, `${step.id}-ok`))].filter(Boolean) : []);
  }
}

await page.goto(manifest.base_url + "/", { waitUntil: "networkidle", timeout: L.nav_timeout_ms }).catch(() => {});
await page.waitForTimeout(900);

const KNOWN = (manifest.known_deviations?.url_substrings || []);
const knownHits = netFailures.filter((f) => KNOWN.some((k) => f.includes(k)));
const realNetFailures = netFailures.filter((f) => !KNOWN.some((k) => f.includes(k)));
const knownConsole = consoleErrors.filter((c) => KNOWN.some((k) => c.url.includes(k)));
const realConsole = consoleErrors.filter((c) => !KNOWN.some((k) => c.url.includes(k)));
const rootSel = G.root_selector || "#root";

const blank = await page.evaluate((rs) => { const r = document.querySelector(rs); return !r || r.children.length === 0 || (document.body.innerText || "").trim().length < 50; }, rootSel).catch(() => true);
record({ __path: "G", id: "G1-blank", expect: "非白屏检查", action: "generic" }, blank ? "FAILED" : "PASSED", blank ? "页面空白/未渲染" : "通过");

const a11y = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")];
  const bad = imgs.filter((i) => !i.alt && !i.getAttribute("aria-label") && !i.title);
  return { total: imgs.length, unnamed: bad.length, sample: bad.slice(0, 5).map((i) => i.src.split("/").pop()) };
}).catch(() => null);
record({ __path: "G", id: "G2-a11y-img", expect: "图像可达性命名", action: "generic" },
  a11y && a11y.unnamed > 0 ? "FAILED" : a11y ? "PASSED" : "UNVERIFIED",
  a11y ? `无命名图像 ${a11y.unnamed}/${a11y.total} ${a11y.sample.join(",")}` : "无法读取DOM");

if (realConsole.length) record({ __path: "G", id: "G3-console", expect: "console/未捕获异常（已剔除基线已知偏差）", action: "generic" }, "FAILED", `${realConsole.length} 条: ${realConsole[0].text}`);
if (realNetFailures.length) record({ __path: "G", id: "G4-network", expect: "网络请求失败（已剔除基线已知偏差）", action: "generic" }, "FAILED", `${new Set(realNetFailures).size} 个: ${[...new Set(realNetFailures)].slice(0, 3).join(" | ")}`);

const ariaHid = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[aria-hidden="true"]')];
  const bad = els.filter((e) => {
    if (!e.offsetParent && getComputedStyle(e).position !== "fixed") return false;
    const txt = (e.textContent || "").trim();
    return txt.length > 0 || !!e.querySelector("button,a,[data-testid]");
  });
  return { total: els.length, bad: bad.length, sample: bad.slice(0, 5).map((e) => e.className || e.tagName) };
}).catch(() => null);
if (ariaHid) record({ __path: "G", id: "G6-aria-hidden", expect: "可见内容不得 aria-hidden", action: "generic" },
  ariaHid.bad > 0 ? "FAILED" : "PASSED", ariaHid.bad > 0 ? `${ariaHid.bad} 个可见元素被 aria-hidden 屏蔽: ${ariaHid.sample.join(",")}` : `抽查 ${ariaHid.total} 个 aria-hidden 均非可见内容`);

const contrast = await page.evaluate((sels) => {
  function lum(rgb) { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function parse(c) { const m = (c || "").match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
  const bg = parse(getComputedStyle(document.body).backgroundColor);
  let bad = 0, checked = 0;
  for (const el of document.querySelectorAll(sels)) {
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
    const fg = parse(getComputedStyle(el).color);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    checked++; if (ratio < 3) bad++;
  }
  return { checked, bad };
}, G.contrast_selectors || "h1,h2,h3").catch(() => null);
if (contrast) record({ __path: "G", id: "G5-contrast", expect: "标题对比度抽查", action: "generic" },
  contrast.bad > 0 ? "FAILED" : contrast.checked ? "PASSED" : "UNVERIFIED",
  contrast.bad > 0 ? `${contrast.bad}/${contrast.checked} 元素对比度<3:1` : `抽查 ${contrast.checked} 个通过`);

for (const sc of G.style_checks || []) {
  const st = await page.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return null;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { filter: cs.filter, display: cs.display, w: Math.round(r.width), h: Math.round(r.height) };
  }, sc.selector).catch(() => null);
  if (st === null) continue; // 容器不存在时不报错（不同项目结构不同）
  const bad = st.filter !== "none" || st.display === "none" || st.w === 0;
  record({ __path: "G", id: `G7-${sc.label}`, expect: `关键容器样式完整（${sc.label}）`, action: "generic" },
    bad ? "FAILED" : "PASSED", `filter=${st.filter} display=${st.display} ${st.w}x${st.h}`);
}

await browser.close();

const sum = { PASSED: 0, FAILED: 0, UNVERIFIED: 0 };
results.forEach((r) => (sum[r.status] = (sum[r.status] || 0) + 1));
const index = { ran_at: new Date().toISOString(), manifest: path.basename(args.manifest || "manifest.json"), base_url: manifest.base_url, steps_used: stepsUsed, limits: L, summary: sum, console_errors: realConsole.map((c) => c.text).slice(0, 10), console_errors_known_deviation: knownConsole.length, network_failures: [...new Set(realNetFailures)].slice(0, 10), known_baseline_deviations: [...new Set(knownHits)], results };
fs.writeFileSync(path.join(OUT, "evidence-index.json"), JSON.stringify(index, null, 2));

const rows = results.map((r) => `| ${r.path} | ${r.step} | ${r.name} | **${r.status}**${r.reverified ? "（复验1次）" : ""} | ${r.detail} | ${(r.evidence || []).join(" ") || "-"} |`).join("\n");
const md = `# 验收证据包 · ${index.ran_at}\n\n_环境: ${manifest.base_url} · 步数 ${stepsUsed}/${L.max_total_steps} · 复验策略: 失败候选独立复验 ${L.reverify} 次_\n\n## 汇总\n\nPASSED ${sum.PASSED} · FAILED ${sum.FAILED} · UNVERIFIED ${sum.UNVERIFIED}\n\n## 逐项\n\n| 路径 | 步骤 | 预期 | 结果 | 说明 | 证据 |\n|---|---|---|---|---|---|\n${rows}\n\n## 基线已知偏差（不参与门控，如实发布）\n${index.known_baseline_deviations.length ? index.known_baseline_deviations.map((k) => `- ${k}`).join("\n") : "- 无"}\n${manifest.unverified_note ? `\n## 未验证声明\n- ${manifest.unverified_note}\n` : ""}`;
fs.writeFileSync(path.join(OUT, "report.md"), md);
const html = `<!doctype html><meta charset="utf-8"><title>acceptance evidence ${index.ran_at}</title><style>body{font-family:system-ui;max-width:960px;margin:2rem auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.4rem .6rem;font-size:14px}.PASSED{color:#0a7a2f}.FAILED{color:#c02020}.UNVERIFIED{color:#8a6d00}.known{background:#fff8e1;padding:2px 6px}</style><h1>验收证据包</h1><p>${manifest.base_url} · 步数 ${stepsUsed}/${L.max_total_steps} · ${index.ran_at}</p><p><b>PASSED ${sum.PASSED} · FAILED ${sum.FAILED} · UNVERIFIED ${sum.UNVERIFIED}</b></p>${index.known_baseline_deviations.length ? `<p class="known">基线已知偏差（不参与门控）: ${index.known_baseline_deviations.join("；")}</p>` : ""}<table><tr><th>路径</th><th>步骤</th><th>预期</th><th>结果</th><th>说明</th></tr>${results.map((r) => `<tr><td>${r.path}</td><td>${r.step}</td><td>${r.name}</td><td class="${r.status}">${r.status}${r.reverified ? " ↻" : ""}</td><td>${r.detail}</td></tr>`).join("")}</table>`;
fs.writeFileSync(path.join(OUT, "report.html"), html);

console.log(JSON.stringify({ out: OUT, summary: sum, steps_used: stepsUsed }));
