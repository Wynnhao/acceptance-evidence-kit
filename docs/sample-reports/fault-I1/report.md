# 验收证据包 · 2026-10-16T02:22:35.260Z

_环境: http://127.0.0.1:8652 · 步数 8/40 · 复验策略: 失败候选独立复验 1 次_

## 汇总

PASSED 11 · FAILED 1 · UNVERIFIED 0

## 逐项

| 路径 | 步骤 | 预期 | 结果 | 说明 | 证据 |
|---|---|---|---|---|---|
| P1 开站 | P1S1 | 首页加载且标题正确（正常项） | **PASSED** | 通过 | - |
| P1 开站 | P1S2 | CSV 数据渲染为列表（正常项） | **PASSED** | 通过 | - |
| P1 开站 | P1S3 | 趋势图样式完整（正常项） | **PASSED** | 通过 | - |
| P2 交互 | P2S1 | 切到任务页（正常项） | **FAILED**（复验1次） | 动作失败(click [data-testid="tab-tasks"]): page.click: Timeout 5000ms exceeded. | 拦截元素: NAV.tabs# < DIV.#app < BODY.# < HTML.# | screenshots/P2S1-fail.png |
| P2 交互 | P2S2 | 切回销售页（正常项） | **PASSED** | 通过 | screenshots/P2S2-ok.png |
| P2 交互 | P2S3 | 记一笔后列表增长（交互生效） | **PASSED** | 通过 | - |
| P3 重载 | P3S1 | 重新开局（演示站无持久化，口径如实） | **PASSED** | 通过 | - |
| G | G1-blank | 非白屏检查 | **PASSED** | 通过 | - |
| G | G2-a11y-img | 图像可达性命名 | **PASSED** | 无命名图像 0/1  | - |
| G | G6-aria-hidden | 可见内容不得 aria-hidden | **PASSED** | 抽查 0 个 aria-hidden 均非可见内容 | - |
| G | G5-contrast | 标题对比度抽查 | **PASSED** | 抽查 1 个通过 | - |
| G | G7-chart | 关键容器样式完整（chart） | **PASSED** | filter=none display=block 240x90 | - |

## 基线已知偏差（不参与门控，如实发布）
- 无

## 未验证声明
- 演示站无终局类场景；真实项目里不可达的用例在此链中一律标 UNVERIFIED，不冒充覆盖。
