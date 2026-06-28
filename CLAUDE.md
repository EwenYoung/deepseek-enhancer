# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run build              # Build Chrome MV3 production extension
npm run dev                # Watch mode (HMR)
npm run dev:firefox        # Watch mode for Firefox
npm run zip                # Package extension for distribution
npm run test               # Run tests (vitest)
```

Built artifacts go to `dist/chrome-mv3/`. Deploy target: `D:\deepseek-enhancer\` (Windows desktop via WSL2 mount at `/mnt/d/deepseek-enhancer/`).

To test in Chrome: `chrome://extensions` → "Load unpacked" → point to the deploy directory.

## 测试

每次代码改动后按以下分工验证：

**Claude 测试**（确定性/可自动化）：
- 纯函数逻辑（SSE 解析、导出、技能合并、类型定义）
- CSS 选择器正确性
- 数据转换/格式化
- 方法：内联 `assert` 或 `npm run test`（vitest）

**用户手动测试**（需在 chat.deepseek.com 浏览器中验证）：
- 各主题下视觉颜色、按钮、高亮
- Agent 模式端到端工具调用
- React 条件渲染后的 UI 状态
- SPA 导航后的状态保持

## Architecture

### Three-Layer Runtime

| Layer | File | World | Role |
|-------|------|-------|------|
| **MAIN** | `src/entrypoints/main-world.content.ts` + `src/core/main-xhr-inject.ts` | page (via `<script>` injection) | XHR hook, prompt injection, SSE parsing |
| **Isolated** | `src/entrypoints/content.ts` | isolated (content script) | UI management, tool execution, event coordination |
| **Background** | `src/entrypoints/background.ts` | service worker | CORS proxy for Tavily API |

Communication: MAIN ↔ Isolated via `window.postMessage` with `source: 'DS_MINI_ISOLATED'` / `'DS_MINI_MAIN'`.

### Agent Tool Call Loop

1. MAIN world `XMLHttpRequest.prototype.send` hook → augment prompt with tool definitions
2. SSE progress event → parse text → detect `<web_search>{...}</web_search>` (regex)
3. → postMessage → Isolated world → `chrome.runtime.sendMessage` → Background → Tavily API
4. → result via `domSubmitText()` (fill textarea + click send button)
5. → page XHR fires → loop repeats or model replies naturally

### Key Files

- **`src/core/main-xhr-inject.ts`** — MAIN world IIFE (injected as string). XHR hook, prompt augmentation, SSE parsing, tool call detection. Stores injection records in hidden `<div>` for export
- **`src/core/ui-tool-blocks.ts`** — Tool call result UI (loading → result blocks), handles DOM submission for loop
- **`src/core/ui-panel.ts`** — Floating side panel (⚡ tab), skill CRUD, API key, Agent mode toggle, export buttons
- **`src/core/ui-autocomplete.ts`** — `/` dropdown for skill selection. Uses `ignoreNextInput` flag to handle React 18 re-render interference
- **`src/core/skill-registry.ts`** — Skill storage in `chrome.storage.local`, `getSkillByName()` for injection
- **`src/core/chat-exporter.ts`** — Markdown/HTML export. Wraps tool result sections in code blocks
- **`src/entrypoints/background.ts`** — Tavily Search and Extract API calls with `advanced` search depth

### Important Patterns

- **Agent mode**: Toggle in panel controls whether tool definitions are injected into prompts. Off by default
- **Skill injection**: `onInput` detects `/skillname` → `postMessage( SET_SKILL )` → MAIN world includes `skillInstructions` in `augmentPrompt`
- **SSE buffer isolation**: Data is stored on `xhr.__ds_buf` per-instance to avoid concurrent request pollution
- **Mode detection**: Reads active mode class `_31a22b0` from DOM to decide which tools to inject (fast=only web_fetch, expert/web=both)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
