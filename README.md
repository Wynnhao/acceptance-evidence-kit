# acceptance-evidence-kit

**给小型 Web 项目出「可复现的验收证据包」：每条验收路径逐步执行，留下通过 / 失败 / 没测三态、截图和失败复验记录。**

不是「AI 全自动质检」，也不承诺「没有 bug」。它只证明：**这些步骤确实跑过，结果是这些。** 没测的部分会明确写「没测」。

![clean run](docs/sample-reports/clean-report.png)

## 给谁用

- 接小型静态站交付的自由职业者 / 小工作室：交付时不想只靠「我测过了」。
- 下单方 / 客户方：想看到可复查的执行记录，而不是一句口头保证。
- 需要把「验收标准」变成可执行清单的人。

适用：静态托管的小型 Web 项目（企业站、工具站、演示页）。
不适用：需要登录的后台、支付、服务端写操作、复杂业务系统。

## 输入 / 输出

**输入**：一个公开访问地址 + 一份 `manifest.json`（3 条左右关键路径，每条写成 goto / click / hover / wait + 断言）。
**输出**：`report.html` / `report.md`，逐项给出 PASSED / FAILED / UNVERIFIED、截图、失败项独立复验一次的结果，以及「未测项」声明。

## 快速开始（约 5 分钟）

```bash
npm i playwright
npx playwright install chromium

node proxy.mjs &                                  # 仅监听 127.0.0.1:8652，服务 sample-site/
node run.mjs --manifest manifest.json --out out/clean
open out/clean/report.html                        # 全绿：12 PASSED / 0 FAILED
```

> 需要 Node.js >= 18。Playwright 是外部依赖（Apache-2.0），不在本仓库内。

## 看它真的能抓到缺陷

```bash
kill %1
node proxy.mjs --injections faults-demo.json --only I1 &
node run.mjs --manifest manifest.json --out out/fault-I1
open out/fault-I1/report.html                     # P2S1 FAILED + 拦截元素诊断
```

公开的 `faults-demo.json` 包含 6 类常见缺陷注入，每类都有预登记签名：

| id | 注入 | 报告中的签名 |
|---|---|---|
| W1 | 关键 JS 资源 403 | 数据列表步骤 FAILED + 网络失败清单 |
| B1 | 未捕获异常 | G3-console FAILED（pageerror 通道） |
| D1 | CSV 数据行损坏 | 汇总文本断言 FAILED（合计 8 笔→7 笔） |
| S1 | 图表 blur 样式回归 | style FAILED + G7-chart FAILED |
| A1 | 主列表被 aria-hidden | G6-aria-hidden FAILED |
| I1 | 按钮 pointer-events 关闭 | 动作失败 + 拦截元素诊断 |

```bash
# 全家桶：会互相掩蔽，用于演示「掩蔽必须如实标注」
node proxy.mjs --injections faults-demo.json --only W1,B1,D1,S1,A1,I1 &
```

![fault run](docs/sample-reports/fault-all-report.png)

## 为什么这比「我测过了」可信

- **答案卷隔离**：执行链不读取注入规格；命中与否以事先登记的签名为准。
- **失败如实公开**：漏检、掩蔽、不可达用例都写进报告（UNVERIFIED / 基线已知偏差），不做「看起来都过了」。
- **复验机制**：失败候选独立重放一次再定罪，降低瞬态误报。
- **受限执行**：代理只监听 127.0.0.1、只服务指定目录；不改被测项目、不请求外部网络。

## 示例报告

- 全绿：[docs/sample-reports/clean/report.md](docs/sample-reports/clean/report.md)
- 单缺陷命中：[docs/sample-reports/fault-I1/report.md](docs/sample-reports/fault-I1/report.md)

## 边界与成本（如实）

- 只覆盖 `manifest.json` 里写下的路径，不覆盖全站；没写的 = 没测。
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

## License

MIT © 2026 Wynn. See [LICENSE](LICENSE).
