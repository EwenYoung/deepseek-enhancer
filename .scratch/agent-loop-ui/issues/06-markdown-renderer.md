# 06 — Markdown 渲染器

**What to build:** 移植 deepseek-pp `core/inline-agent/markdown.ts` 的 `renderInlineMarkdown()` 到 enhancer，支持基础 Markdown 语法。

**Spec ref:** FR-6
**Priority:** P2
**Blocked by:** None（独立模块，可先写后接入）

**Status:** done

- [x] 创建 `src/core/markdown.ts`，导出 `renderInlineMarkdown(text: string): string`
- [x] 支持语法:
  - Headers: `#` / `##` / `###` → `<h1>` / `<h2>` / `<h3>`
  - Bold: `**text**` → `<strong>`
  - Italic: `*text*` → `<em>`
  - Inline code: `` `code` `` → `<code>`
  - Code blocks: ` ```...``` ` → `<pre><code>`
  - Links: `[text](url)` → `<a href="url" target="_blank">`
  - Tables: `|...|` → `<table>` 基本结构
  - Lists: `- item` → `<ul><li>`, `1. item` → `<ol><li>`
- [x] 安全: 所有文本先 `escapeHTML()` 再应用 Markdown 正则
- [x] 接入: Phase 3 中替换 `updateStepStreamText` 和最终回答渲染中的纯文本

**Files:**
- `src/core/markdown.ts` (new, ~120 lines)
- `src/core/ui-tool-blocks.ts` — 替换纯文本为 Markdown 渲染（~5 lines）

**Verification:**
1. 输入 `**bold** and *italic*` → 输出 `<strong>bold</strong> and <em>italic</em>`
2. 输入 `[link](https://example.com)` → 输出带 `target="_blank"` 的 `<a>` 标签
3. 输入 `<script>alert(1)</script>` → 输出转义后的文本，不执行脚本
