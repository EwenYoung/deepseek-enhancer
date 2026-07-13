# 08 — 并发防护

**What to build:** 添加 `isAgentLoopRunning` 检查，防止同时启动多个 agent loop。

**Spec ref:** FR-8
**Priority:** P2
**Blocked by:** 01 (与 AgentPanel 生命周期绑定)

**Status:** done

- [x] 模块级变量 `agentLoopRunning = false`
- [x] `handleMainWorldToolCalls` 入口:
  - 若 `agentLoopRunning` 为 true → log warn + return（跳过）
  - 置 `agentLoopRunning = true`
- [x] 循环完成/出错/停止:
  - `DS_MINI_AGENT_LOOP_COMPLETE` → `agentLoopRunning = false`
  - `DS_MINI_AGENT_LOOP_ERROR` → `agentLoopRunning = false`
  - Stop button → `agentLoopRunning = false`
- [x] Cleanup: `loopDepth = 0` 路径 → `agentLoopRunning = false`

**Files:**
- `src/core/ui-tool-blocks.ts` — agentLoopRunning 变量 + 检查 (~10 lines)

**Verification:**
1. 循环运行中 → 收到第二个工具调用消息 → 跳过（log 可见 skip 警告）
2. 循环完成后 → 下次工具调用正常启动新循环
