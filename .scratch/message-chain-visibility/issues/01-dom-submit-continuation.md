# 01 — 续接 prompt 改用 DOM Submit

**What to build:** `handleMainWorldToolCalls` 工具执行完成后，用 `domSubmitText()` 提交续接 prompt，不走 raw XHR silent loop 路径。

**Spec ref:** D-1, D-7
**Priority:** P0
**Blocked by:** None

**Status:** done

- [ ] `handleMainWorldToolCalls` 中 `silentModeEnabled` 路径改为：直接 `domSubmitText(formatResults(ok))`，不再 postMessage DS_MINI_SILENT_RESULT
- [ ] 删除 `main-xhr-inject.ts` 中的 `handleSilentLoop` 函数（或简化为保留 fallback 的简化版）
- [ ] 删除 `main-xhr-inject.ts` 中 `DS_MINI_SILENT_RESULT` case handler
- [ ] 删除 `ui-tool-blocks.ts` 中 `computePowHeader`、`loadPowWasm`、`writeWasmString` 等 PoW 函数
- [ ] 删除 `ui-tool-blocks.ts` 中 `savedReqHeaders` 变量
- [ ] 删除 WASM import `wasmUrl`
- [ ] `domSubmitText` 调用后不等待 800ms delay，改等待 500ms（给 page 处理时间）
- [ ] `scanAndHideToolResults` 保留：DOM submit 后隐藏新出现的 `[工具执行结果]` 消息

**Files:**
- `src/core/ui-tool-blocks.ts` — 主改动
- `src/core/main-xhr-inject.ts` — 删除 silent loop

**Verification:**
1. 工具执行完成后 textarea 被填充续接 prompt 文本
2. 发送按钮被点击 → 页面发起新 XHR
3. 页面自然渲染新消息
