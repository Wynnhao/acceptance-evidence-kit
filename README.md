# acceptance-evidence-kit

**给小型 Web 项目出「可复现的验收证据包」：每条验收路径逐步执行，留下通过 / 失败 / 没测三态、截图和失败复验记录。**

不是「AI 全自动质检」，也不承诺「没有 bug」。它只证明：**这些步骤确实跑过，结果是这些。** 没测的部分会明确写「没测」。

![clean run](docs/sample-reports/clean-report.png)

> 配图是 2026-10-16 的存档报告。公开仓库被重新 clone 后复跑（2026-10-23、2026-10-24）结果相同：12 PASSED / 0 FAILED / 0 UNVERIFIED。

## 给谁用

- 接小型静态站交付的自由职业者 / 小工作室：交付时不想只靠「我测过了」。
- 下单方 / 客户方：想看到可复查的执行记录，而不是一句口头保证。
- 需要把「验收标准」变成可执行清单的人。

适用：静态托管的小型 Web 项目（企业站、工具站、演示页）。
不适用：需要登录的后台、支付、服务端写操作、复杂业务系统。

## 输入 / 输出

**输入**：一个公开访问地址 + 一份 `manifest.json`（3 条左右关键路径，每条写成 goto / click / hover / wait + 断言）。
**输出**：`report.html` / `report.md`，逐项给出 PASSED / FAILED / UNVERIFIED、失败步骤必附截图（通过步骤按需附图）、失败项独立重放一次再定罪的结果，以及「未测项」声明。

## 快速开始（约 5 分钟）

```bash
npm i playwright          # 或 npm ci（仓库带 package-lock.json，锁定 playwright 版本）
npx playwright install chromium

node proxy.mjs &                                  # 仅监听 127.0.0.1:8652，服务 sample-site/
node run.mjs --manifest manifest.json --out out/clean
open out/clean/report.html                        # 全绿：12 PASSED / 0 FAILED
```

> 需要 Node.js >= 18。Playwright 是外部依赖（Apache-2.0），不在本仓库内。
> 首次运行会下载 Chromium（一百多 MB），网络慢时这步另计时间；国内网络可设 `PLAYWRIGHT_DOWNLOAD_HOST` 指向镜像，例如 `export PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`。
> 上面是 macOS/Linux 的写法：Windows 把 `open` 换成 `start out\clean\report.html`，`&` 换成另开一个终端跑 `node proxy.mjs`。
> 「12 PASSED」里有 3 项是**通用抽查**（图像 alt 命名 / aria-hidden 屏蔽 / 标题对比度），在演示站上只抽到 0–1 个元素：它们记 PASSED 的意思是「抽到的元素没问题」，不等于覆盖充分。

## 跑自己的站点

执行链是 manifest 驱动的：复制一份 `manifest.json` 改 `base_url` 和路径，就能换成你自己的验收路径。

```json
{
  "base_url": "https://your-site.example",
  "limits": { "nav_timeout_ms": 15000, "step_timeout_ms": 5000, "max_total_steps": 40, "reverify": 1 },
  "abort_steps": [],
  "generic": { "root_selector": "#app", "contrast_selectors": "h1,h2,h3", "style_checks": [] },
  "known_deviations": { "url_substrings": [] },
  "unverified_note": "写清哪些场景这条链跑不到，避免被当成全覆盖。",
  "paths": [
    { "id": "P1 首屏", "steps": [
      { "id": "P1S1", "action": "goto", "expect": "首屏标题出现",
        "assert": [ { "kind": "text", "selector": "h1", "contains": "标题文字", "note": "标题正确" } ] }
    ] }
  ]
}
```

- **可用动作**：`goto` / `reload` / `click` / `hover` / `wait`（毫秒）/ `skip`（声明未执行 → 记 UNVERIFIED）。
- **可用断言**：`visible` / `not_visible` / `count0` / `text`（子串包含）/ `style`（`filter_none`、`min_size`）/ `state_change`（`min_changed`）。
- **通用抽查**（`generic` 段）：白屏、图像 alt 命名、可见内容是否被 `aria-hidden` 屏蔽、标题对比度、关键容器样式（`style_checks` 里声明选择器）。
- **基线已知偏差**（`known_deviations.url_substrings`）：登记你自己项目里已知的老问题（例如某张图固定 404），登记后不参与门控，但报告仍会原样列出，不隐藏。
- **限制**：`base_url` 目前只能写在 manifest 里（没有命令行覆盖参数）；只测公开页面与客户端交互，不做登录 / 支付 / 服务端写操作；只覆盖你写下的路径。

## 反馈与试用

跑通之后请开 issue：<https://github.com/Wynnhao/acceptance-evidence-kit/issues>
最有用的三类反馈是——**哪一步看不懂**、**哪条断言不可信**、**哪个失败样例其实没复现**；如果卡在装环境或写 manifest，也请直接贴现象。指出问题比点 star 有用得多。

## 看它真的能抓到缺陷

```bash
Ctrl+C            # 停掉上一步的代理（bash 下也可用 kill %1）
node proxy.mjs --injections faults-demo.json --only I1 &
node run.mjs --manifest manifest.json --out out/fault-I1
open out/fault-I1/report.html                     # P2S1 FAILED + 拦截元素诊断
```

公开的 `faults-demo.json` 包含 6 类常见缺陷注入，每类都有预登记签名：

| id | 注入 | 单独注入时的签名（全家桶会互相掩蔽，见下图） |
|---|---|---|
| W1 | 关键 JS 资源 403 | 数据列表步骤 FAILED + 网络失败清单 |
| B1 | 未捕获异常 | G3-console FAILED（pageerror 通道） |
| D1 | CSV 数据行损坏 | 汇总文本断言 FAILED（合计 8 笔→7 笔） |
| S1 | 图表 blur 样式回归 | style FAILED + G7-chart FAILED |
| A1 | 主列表被 aria-hidden | G6-aria-hidden FAILED |
| I1 | 按钮 pointer-events 关闭 | 动作失败 + 拦截元素诊断 |

```bash
# 全家桶：注入之间会互相掩蔽
node proxy.mjs --injections faults-demo.json --only W1,B1,D1,S1,A1,I1 &
```

![fault run](docs/sample-reports/fault-all-report.png)

**关于掩蔽（如实说明）**：全家桶里 W1 会先让 `/app.js` 挂掉，于是页面半坏——A1（aria-hidden 退化）在这种情况下**观察不到**，报告里的 G6 仍会显示「抽查 1 个 aria-hidden 均非可见内容 → PASSED」。执行链**不会自动标注哪条缺陷被谁掩蔽**：它按设计不读取注入规格（答案卷隔离），所以掩蔽只在你的 manifest 与预登记签名层面处理。换句话说：报告里的 PASSED 只说明「这一步没发现异常」，不说明「所有注入都命中」。真实项目里请用 `known_deviations` 与事先登记的签名来对齐期望（见「跑自己的站点」）。

## 为什么这比「我测过了」可信

- **答案卷隔离**：执行链不读取注入规格；命中与否以事先登记的签名为准。
- **失败如实公开**：漏检、掩蔽、不可达用例都写进报告（UNVERIFIED / 基线已知偏差），不做「看起来都过了」。
- **复验机制**：失败候选独立重放一次再定罪，降低瞬态误报。
- **受限执行**：代理只监听 127.0.0.1、只服务指定目录；不改被测项目、不请求外部网络。

## 示例报告

- 全绿：[docs/sample-reports/clean/report.md](docs/sample-reports/clean/report.md)
- 单缺陷命中：[docs/sample-reports/fault-I1/report.md](docs/sample-reports/fault-I1/report.md)

## 边界与成本（如实）

- 只覆盖 `manifest.json` 里写下的路径（外加固定通用体检项：白屏 / console / 网络 / 无障碍 / 对比度），不覆盖全站；没写的 = 没测。
- 不是安全扫描、不是性能测试、不代表无 bug。
- 不做登录、支付、服务端写操作；仅公开页面 + 客户端交互。
- 成本：MIT，免费；一次 3–5 分钟；无托管服务、无账号体系。
- 这是 v0.1 实验版本：接口与报告格式仍可能变化。

## 仓库结构

```
proxy.mjs            受限静态服务器 + 缺陷注入层（仅 127.0.0.1）
run.mjs              执行器：manifest → 报告
manifest.json        3 条演示路径（可替换成你的验收路径）
faults-demo.json     6 类公开缺陷注入
sample-site/         合成演示站（数据全虚构）
docs/sample-reports/ 成功 / 失败样例
```

## English (short)

**acceptance-evidence-kit** produces reproducible acceptance evidence for small static web projects: per-step PASSED / FAILED / UNVERIFIED, screenshots, one independent re-check of failures, and an explicit "not tested" list. It is not a security scan and does not claim "no bugs". MIT licensed. Playwright is an external Apache-2.0 dependency.

Full English version: **[README.en.md](README.en.md)** (quick start, running it on your own site, assertion reference).

## License

MIT © 2026 Wynn. See [LICENSE](LICENSE).
