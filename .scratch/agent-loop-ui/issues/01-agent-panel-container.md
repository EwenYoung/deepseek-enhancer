# 01 — Agent Panel 容器 + 挂载

**What to build:** 创建 `<div class="ds-agent-container">` 作为 agent loop 所有步骤的父容器，实现挂载/卸载逻辑和虚拟列表重附着。

**Spec ref:** FR-1
**Priority:** P0
**Blocked by:** None

**Status:** done

- [x] 创建 `AgentPanel` 类:
  - `container`: `<div class="ds-agent-container">` — 左边界强调色
  - `loopId`: UUID
  - `steps`: Map<number, HTMLElement>
  - `mount(atElement: Element)`: 插入容器到指定位置
  - `unmount()`: 移除容器
- [x] 挂载逻辑: `handleMainWorldToolCalls` 中首次 `loopDepth === 1` 时创建 AgentPanel，挂载到最后一条消息之后
- [x] MutationObserver 保持附着: 检测容器 detached 时重新挂载
- [x] `loopId` 生成与共享: `window.__DS_LOOP_ID__ = crypto.randomUUID()`
- [x] 新用户消息 → `loopDepth = 0` 路径 → cleanup 旧容器
- [x] 容器样式: `padding-left: 16px; border-left: 1px solid var(--ds-accent, #4e6ef2); margin: 8px 0;`

**Files:**
- `src/core/ui-tool-blocks.ts` — AgentPanel 类 + 挂载
- `src/core/main-xhr-inject.ts` — 读取 `window.__DS_LOOP_ID__` 并在消息中回传

**Verification:**
1. 开启 Agent 模式 → 工具调用 → 验证 agent container 出现在 DOM 中
2. 工具调用完成后容器仍存在（未被虚拟列表清除）
3. 发送新消息 → 旧容器被移除
