# 02 — Step 可视化

**What to build:** 每个 loop 迭代创建一个 step 元素，显示步骤编号、状态标签、可选的 Stop 按钮、auto-collapse。

**Spec ref:** FR-2
**Priority:** P0
**Blocked by:** 01 (需要 AgentPanel 容器就位)

**Status:** done

- [x] `createAgentStepElement(stepIndex, onStop)`:
  - Header: `Step {N}` + status label `[streaming...]`
  - Body (`.ds-agent-step-body`): 空内容，等 stream chunk 填充
  - Tools (`.ds-agent-step-tools`): 空，等工具结果填充
  - Stop button (可选): 点击调用 `onStop()`
- [x] Step 状态样式:
  - `data-status="streaming"`: 左框线 accent 色 (`#4e6ef2`)
  - `data-status="tool-executing"`: 左框线 warning 色 (`#ff8800`)
  - `data-status="complete"`: 左框线 green 色
  - `data-status="error"`: 左框线 error 色 (`#f53f3f`)
- [x] `updateStepStatus(step, statusLabel, statusType)`: 更新 header 状态文本和 `data-status`
- [x] Auto-collapse: step 完成后 800ms → `setAttribute('data-collapsed', '')` → body+tools 隐藏
- [x] Header click toggle: `data-collapsed` 切换
- [x] Step 创建时机: 收到 MAIN world 的 step 事件 (`DS_MINI_AGENT_STEP_STARTED`)

**Files:**
- `src/core/ui-tool-blocks.ts` — createAgentStepElement, updateStepStatus, toggle

**Verification:**
1. 多轮循环 → 每个 step 分别显示 "Step 1" / "Step 2" / ...
2. Streaming 期间状态为 "streaming..."
3. 完成后 800ms step 自动折叠
4. 点击 header 可展开/收起
