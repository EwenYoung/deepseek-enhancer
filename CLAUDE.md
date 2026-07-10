# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 流程性规则（Skills）

以下操作规则已独立为 skill，按需调用：

| Skill | 触发 | 用途 |
|-------|------|------|
| network-proxy | `/network-proxy` | 网络命令前配置代理 127.0.0.1:7897 |
| dev-workflow | `/dev-workflow` | 测试分工 + Chrome 扩展部署 |
| graphify | `/graphify` | 知识图谱构建/查询 |

## 行动原则

- **脚本优先**：能用脚本自动化执行的重复性任务，优先写脚本执行，避免逐步手动操作。多步骤、批处理、文件操作等场景先考虑脚本化。
- **Commit 前检查**：执行 `git commit` 前，按序运行 `npm run typecheck`、`npm run lint`、`npm run format:check`。typecheck/lint 失败需修复；format 失败则 `npm run format` 后重新 add。三项全部通过后方可提交。
- **Review 委托**：用户要求 review 代码时，主 agent 不要亲自 review，必须分派 subagent（Agent tool, subagent_type="general-purpose"）执行。简要 review 用 caveman-review skill，标准+规格 review 用 code-review skill。
- **危险 Git 操作**：`git reset --hard`、`git clean -fd`、`git branch -D`、`git push --force` 等不可逆操作，执行前必须向用户确认，并展示会丢失的内容。

## Build Commands

```bash
npm run build              # Build Chrome MV3 production extension
npm run dev                # Watch mode (HMR)
npm run dev:firefox        # Watch mode for Firefox
npm run zip                # Package extension for distribution
npm run test               # Run tests (vitest)
```

Built artifacts go to `dist/chrome-mv3/`. Deploy target: `D:\deepseek-enhancer\`.

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

## Knowledge Graph

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships. See `.claude/skills/graphify/SKILL.md` for usage.

## Agent Skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

All five canonical triage roles use default label names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
