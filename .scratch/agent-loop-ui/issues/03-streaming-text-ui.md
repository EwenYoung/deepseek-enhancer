# 03 — 流式文本实时渲染

**What to build:** MAIN world 在静默循环 XHR 的 progress 事件中发送增量文本 chunk 到 Isolated world；Isolated world 实时渲染到 step body。

**Spec ref:** FR-3
**Priority:** P1
**Blocked by:** 02 (需要 step element 作为渲染目标)

**Status:** done

- [x] MAIN world (`main-xhr-inject.ts`):
  - `handleSilentLoop` 的 XHR progress handler 中，每次 `extractTextFromData()` 获取到文本后:
  - 发送 `postMessage({ type: 'DS_MINI_AGENT_STREAM_CHUNK', loopId, stepIndex: silentDepth, fullText: buf.text, delta: text })`
  - 从 `window.__DS_LOOP_ID__` 读取 loopId
  - throttle: 每 ~100ms 最多发送一次（用 `Date.now()` 简单限流）
- [x] Isolated world (`ui-tool-blocks.ts`):
  - 监听 `DS_MINI_AGENT_STREAM_CHUNK` 消息
  - throttle via `requestAnimationFrame`（deepseek-pp: `content.ts:3216`）
  - 调用 `updateStepStreamText(step, fullText)`:
    - `stripToolCalls(fullText)` 过滤工具 XML
    - `body.innerHTML = renderInlineMarkdown(cleanText)` (先纯文本，Phase 3 换 Markdown)
    - `scrollStepBodyToBottom()` — body.scrollTop = body.scrollHeight
  - 文本上限 8000 chars

**Files:**
- `src/core/main-xhr-inject.ts` — chunk 发送 (~20 lines)
- `src/core/ui-tool-blocks.ts` — chunk 接收 + 渲染 (~30 lines)

**Verification:**
1. 静默循环运行期间 → step body 增量显示模型流式文本
2. 文本中不含 `<web_search>` 等工具 XML
3. body 自动滚动到底部
