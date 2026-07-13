# 04 — 工具结果 Step 内展示

**What to build:** 工具执行完成后，在 step 内显示精简摘要（checkmark + toolName + summary），与现有 tool block 详情共存。

**Spec ref:** FR-4
**Priority:** P1
**Blocked by:** 02 (需要 step element)

**Status:** done

- [x] `addToolResultToStep(step, toolName, ok, summary)`:
  - 创建 `<div class="ds-agent-step-tool-item ok|err">`
  - ok: `[OK] toolName — summary` (summary 截断 100 chars)
  - err: `[ERR] toolName — error`
  - 追加到 `step` 内的 `.ds-agent-step-tool-tools`
- [x] 触发时机: `DS_MINI_AGENT_STEP_COMPLETE` 消息携带 `toolExecutions` 数组
- [x] 数据处理: `handleMainWorldToolCalls` 中 `results.map(r => ({ name, ok, summary }))` → postMessage 给 MAIN world → MAIN world 在 step complete 消息中携带
- [x] 与现有 Tool Block 共存:
  - Agent panel 工具项 = 精简摘要
  - 现有 tool block = 详情展开（保留不变）
  - 两者由不同的代码路径生成，不冲突

**Files:**
- `src/core/ui-tool-blocks.ts` — addToolResultToStep (~25 lines)
- `src/core/main-xhr-inject.ts` — step complete 消息携带工具数据

**Verification:**
1. 工具执行完成后 → step 内出现工具结果项
2. 成功: `[OK] 联网搜索 — 找到 5 条结果`
3. 失败: `[ERR] 联网搜索 — Tavily 搜索失败`
