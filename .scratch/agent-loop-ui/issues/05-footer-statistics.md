# 05 — Agent Footer 统计

**What to build:** Agent loop 完成后，在 agent container 底部显示统计 footer：步数、工具调用数、成功/失败状态。

**Spec ref:** FR-5
**Priority:** P1
**Blocked by:** 01 (需要 container)

**Status:** done

- [x] `createAgentFooter(totalSteps, totalTools, isError, errorMsg)`:
  - 创建 `<div class="ds-agent-footer ok|err">`
  - 成功: `Agent complete (3 steps, 5 tool calls)` + green 指标
  - 错误: `Agent error: {errorMsg}` + red 指标
  - 被停止: `Agent stopped` + 灰色指标
- [x] 触发: `DS_MINI_AGENT_LOOP_COMPLETE` 消息 → 计算 `totalSteps = silentDepth`, `totalTools` 从 step 数据中累计
- [x] Footer 添加到 container 末尾（steps 之后）
- [x] Footer 样式: 上 border 分隔，小字号 (12px)，灰色文字

**Files:**
- `src/core/ui-tool-blocks.ts` — createAgentFooter (~25 lines)

**Verification:**
1. 循环完成后 → footer 出现在 agent panel 底部
2. "Agent complete (1 steps, 1 tool calls)" 与实际一致
3. 错误时显示红色错误信息
