---
id: collapse-003
scope: docs/CONTEXT.md, README.md, README-en.md
status: pending
depends-on: [collapse-002]
---

# collapse-003：文档与术语同步

## objective

折叠机制形态变化后，同步仓库内长期维护的术语表与说明文档。

## context

- `docs/CONTEXT.md`（术语表，长期维护；AGENTS.md 要求：出现新概念就补录，重命名或含义变化就同步）
- `docs/plan/tool-call-collapse.md`
- `README.md` / `README-en.md`

## 改动要求

### 1. `docs/CONTEXT.md` 的「折叠条 (Collapse Bar)」条目

现状定义（大意）：把助手消息里的大段内容（原始工具调用、超长代码块）默认收起为一条可点击展开的横条，由 `ui-collapse` 模块在官方气泡上做非破坏性 DOM 折叠。

新形态：**不再插入自建横条 DOM**，改为给块级元素加 `data-ds-fold` 属性，标签行由 CSS `::before` 渲染；原文完整保留在 DOM 中。

请改写该条目，保留 `_Avoid_` 行（或按新形态调整）。术语名可保留「折叠条」，但定义必须反映新机制。

### 2. 术语表补录

若新引入了值得长期维护的概念（如「折叠标签行」），按 CONTEXT.md 的格式补录；没有新概念就不加。

### 3. README 同步

检查 `README.md` / `README-en.md` 中描述折叠行为的段落（如功能列表、导出说明），与实际行为对齐。若提及「工具调用自动折叠为一行」，确认措辞仍准确。

## path

- `docs/CONTEXT.md`
- `README.md`
- `README-en.md`

**不要动**：任何 `src/` 下代码。

## verification

1. `pnpm format:check` 通过（文档在 format 范围内）。
2. 术语表定义与 `src/core/ui-collapse.ts` 实际实现一致（逐条对照属性名、CSS 机制）。
3. README 中折叠相关描述与实际行为一致。

## 交付说明

报告：改了哪几条、术语表前后对比。
