# Agent Loop UI Replication Specification

> 基于 `docs/deepseek-pp-agent-loop-ui-analysis.md` 分析结论
> 目标：复刻 deepseek-pp 的 agent loop 可视化方案到 deepseek-enhancer
> 日期: 2026-07-13

## 1. Overview

当前 enhancer 的 agent loop 是"静默"的 —— 循环在后台 XHR 中运行，用户只在工具调用期间看到 loading/result block，其余步骤完全不可见。deepseek-pp 的方案使用专属 agent panel 展示每一步的实时流式文本、工具结果、最终统计。

本规格定义将 deepseek-pp 的 agent panel 体系移植到 enhancer 的方案，受浏览器扩展 MAIN/isolated world 架构约束。

### 1.1 当前问题

| 问题 | 症状 |
|------|------|
| 用户感知不到循环进度 | 工具 block 一闪而过，中间静默期间无任何反馈 |
| 无流式文本展示 | 每步的模型输出只在循环结束时一次性送达 |
| 无步骤概念 | 用户不知循环执行了几轮、用了多少工具 |
| 内部消息泄露 | `scanAndHideToolResults` 方案偶有闪烁，deepseek-pp 用 suppressPageEvents 从源头阻止渲染 |
| 无 markdown 渲染 | 工具结果和最终回答均为纯文本 |

### 1.2 目标架构

```
MAIN world (main-xhr-inject.ts)
  handleSilentLoop → XHR progress → SSE chunks
    │  postMessage DS_MINI_AGENT_STREAM_CHUNK
    │  postMessage DS_MINI_AGENT_TOOL_DETECTED
    │  postMessage DS_MINI_AGENT_LOOP_COMPLETE
    ▼
Isolated world (ui-tool-blocks.ts + content.ts)
  AgentPanel class
    ├── Container (<div class="ds-agent-container">)
    ├── Step[]  (<div class="ds-agent-step">)
    │     ├── Header (step index, status, stop button)
    │     ├── Body (incremental Markdown, auto-scroll)
    │     └── Tools (per-tool checkmark + summary)
    └── Footer (totalSteps, totalTools, status)
```

## 2. Functional Requirements

### FR-1: Agent Panel Container

**Priority:** P0
**Files:** `src/core/ui-tool-blocks.ts`

#### FR-1.1 容器结构

创建 `<div class="ds-agent-container">`，作为 agent loop 所有步骤的父容器。样式特征：
- 左边界强调色 (`border-left: 1px solid var(--ds-accent)`)
- 上 margin 8px 与上方工具 block 分隔
- 内含所有 step 元素 + footer

#### FR-1.2 挂载逻辑

- 在首次 `DS_MINI_AGENT_STEP_STARTED` 时创建容器并挂载到当前对话最后一条消息之后
- 使用 `MutationObserver` 保持容器附着（应对 DeepSeek 虚拟列表重渲染）
- 新用户消息触发时移除旧容器（`handleMainWorldToolCalls` 中 `loopDepth = 0` 重置路径）

#### FR-1.3 loopId 协调

- Isolated world 在 `handleMainWorldToolCalls` 中生成 `loopId = crypto.randomUUID()`
- 通过 `window.__DS_LOOP_ID__` 共享给 MAIN world
- 所有 agent 消息携带 `loopId` 以关联同一轮会话

### FR-2: Step 可视化

**Priority:** P0
**Files:** `src/core/ui-tool-blocks.ts`

#### FR-2.1 Step 元素结构

```
<div class="ds-agent-step" data-step-index="N">
  <div class="ds-agent-step-header">
    <span>Step N</span>
    <span class="ds-agent-step-status">streaming...</span>
    <button>Stop</button>   <!-- 可选 -->
  </div>
  <div class="ds-agent-step-body">
    <!-- 增量 Markdown 渲染内容 -->
  </div>
  <div class="ds-agent-step-tools">
    <!-- 工具结果摘要列表 -->
  </div>
</div>
```

#### FR-2.2 Step 状态

| 状态 | CSS 特征 | 触发事件 |
|------|---------|---------|
| `streaming` | 左框线 accent 色，body 自动滚动到底 | `DS_MINI_AGENT_STREAM_CHUNK` 持续更新 |
| `tool-executing` | 左框线 warning 色 | `DS_MINI_AGENT_TOOL_DETECTED` |
| `complete` | 800ms 后 auto-collapse | `DS_MINI_AGENT_STEP_COMPLETE` |
| `error` | 左框线 error 色 | `DS_MINI_AGENT_LOOP_ERROR` |

#### FR-2.3 Auto-collapse

- Step 完成后 800ms 自动折叠 (deepseek-pp: `content.ts:3277-3279`)
- 折叠时保留 header 可见，body+tools 隐藏
- 点击 header 手动 toggle 展开/收起

### FR-3: 流式文本实时渲染

**Priority:** P1
**Files:** `src/core/main-xhr-inject.ts`, `src/core/ui-tool-blocks.ts`

#### FR-3.1 MAIN world 端

`handleSilentLoop` 的 XHR progress handler 中，每次 `extractTextFromData()` 提取到文本后：
- 累积到 buffer（已有逻辑）
- 额外 postMessage `DS_MINI_AGENT_STREAM_CHUNK: { loopId, stepIndex: silentDepth, fullText: buf.text, delta: text }`

#### FR-3.2 Isolated world 端

- 接收 `DS_MINI_AGENT_STREAM_CHUNK` → throttle via `requestAnimationFrame` (deepseek-pp: `content.ts:3216`)
- 调用 `updateStepStreamText(step, fullText)` → `body.innerHTML = renderInlineMarkdown(fullText)` + `scrollStepBodyToBottom()`
- 文本上限 8000 字符 (`INLINE_AGENT_STEP_RENDER_MAX_CHARS`)

#### FR-3.3 工具 XML 过滤

流式文本在渲染前须过滤工具 XML 标签，避免用户看到 `<web_search>{"query":"..."}</web_search>`：
- deepseek-pp: `core/interceptor/streaming-tool-text.ts` — `createStreamingToolTextAccumulator`
- enhancer: 复用现有 `stripToolCalls()` from `sse-parser.ts`

### FR-4: 工具结果 Step 内展示

**Priority:** P1
**Files:** `src/core/ui-tool-blocks.ts`

#### FR-4.1 工具结果项

每个工具的 `<div class="ds-agent-step-tool-item ok|err">`:
- success: `[OK] toolName — summary (≤100 chars)`
- error: `[ERR] toolName — error`
- 嵌入 step 的 `.ds-agent-step-tools` 区域

#### FR-4.2 与现有 Tool Block 共存

- 当前的工具 loading/result block 保留（提供详细可展开视图）
- agent panel 的工具结果项作为精简摘要显示在 step 内
- 用户可点击 tool block 查看详情，agent panel 提供概览

### FR-5: Agent Footer 统计

**Priority:** P1
**Files:** `src/core/ui-tool-blocks.ts`

#### FR-5.1 结构

```
<div class="ds-agent-footer ok|err">
  <span>[OK]</span>
  <span>Agent complete (3 steps, 5 tool calls)</span>
</div>
```

#### FR-5.2 内容

- 成功: `Agent complete (N steps, M tool calls)`
- 错误: `Agent error: {errorMessage}`
- 操作: "Agent stopped" (用户手动停止)

### FR-6: Markdown 渲染器

**Priority:** P2
**Files:** `src/core/markdown.ts` (新文件)

#### FR-6.1 移植范围

移植 deepseek-pp `core/inline-agent/markdown.ts` 的 `renderInlineMarkdown()`:
- Headers: `#` / `##` / `###`
- Bold: `**...**`
- Italic: `*...*`
- Inline code: `` `...` ``
- Code blocks: ` ```...``` `
- Links: `[...](url)`
- Tables: `|...|`
- Lists: `- ...` / `1. ...`

#### FR-6.2 安全约束

- 输入必须 sanitize，防止 XSS
- 不做完整 Markdown 解析，仅做正则替换即可

### FR-7: Nudge 增强

**Priority:** P2
**Files:** `src/core/main-xhr-inject.ts`

#### FR-7.1 shouldNudge 移植

移植 deepseek-pp `prompt.ts:92-100` 的 `shouldNudge()` 逻辑 — 检测中英文续行动词:

```regex
/(?:我将|我会|接下来|下一步|i'll|let me|next).{0,64}(?:调用|搜索|获取|执行|call|search|fetch|run)/gi
```

匹配 + 文本 < 200 字符 + `nudgeCount < 8` → 触发 nudge。

#### FR-7.2 超限处理

nudgeCount >= 8 时强制结束循环，输出 budget notice。

### FR-8: 并发防护

**Priority:** P2
**Files:** `src/core/ui-tool-blocks.ts`

#### FR-8.1 isAgentLoopRunning

- 模块级变量 `agentLoopRunning = false`
- `handleMainWorldToolCalls` 入口检查：若 `agentLoopRunning` 为 true，跳过新循环并 log warn
- 循环完成/出错/停止时重置为 false

## 3. Non-Functional Requirements

### NFR-1: 性能

- UI 更新 throttle via `requestAnimationFrame`，每帧最多渲染一次
- 流式文本上限 8000 chars 防止 DOM 膨胀
- postMessage 消息频率：chunk 合并后再发送（每 ~100ms 一次而非每个 SSE chunk）

### NFR-2: 兼容性

- 所有新增 DOM 元素使用 `ds-` 前缀 class，避免与 DeepSeek 自身样式冲突
- 不修改 DeepSeek 页面的原生渲染管线
- 回退：若 agent panel 初始化失败，回退到现有静默循环行为

### NFR-3: DOM Cleanup

- 新用户消息 → 移除旧 agent panel 容器
- 页面导航 → MutationObserver 检测容器 detached → cleanup
- 不超过 1 个活跃的 agent panel

### NFR-4: 安全

- `renderInlineMarkdown()` 输入必须经过 HTML 转义
- 不接受外部 URL 作为渲染内容

## 4. Implementation Plan

### Phase 1: Core Agent Panel + Step Basics (FR-1, FR-2)

| ID | Task | Files | Est. Lines |
|----|------|-------|-----------|
| FR-1.1 | 创建 AgentPanel 类（container, mount/unmount） | `ui-tool-blocks.ts` | ~60 |
| FR-1.2 | 挂载逻辑 + MutationObserver | `ui-tool-blocks.ts` | ~30 |
| FR-1.3 | loopId 生成与协调 | `ui-tool-blocks.ts` + `main-xhr-inject.ts` | ~15 |
| FR-2.1 | Step 元素创建 (createAgentStepElement) | `ui-tool-blocks.ts` | ~80 |
| FR-2.2 | Step auto-collapse | `ui-tool-blocks.ts` | ~15 |
| FR-3.2 | DS_MINI_AGENT_STREAM_CHUNK 处理 | `ui-tool-blocks.ts` | ~25 |

### Phase 2: Streaming Text + Tool Results (FR-3, FR-4)

| ID | Task | Files | Est. Lines |
|----|------|-------|-----------|
| FR-3.1 | MAIN world 发送 stream chunks | `main-xhr-inject.ts` | ~20 |
| FR-3.3 | 工具 XML 过滤 in stream | `ui-tool-blocks.ts` | ~10 |
| FR-4.1 | 工具结果项创建 (addToolResultToStep) | `ui-tool-blocks.ts` | ~25 |
| FR-4.2 | 与现有 Tool Block 共存 | `ui-tool-blocks.ts` | ~10 |

### Phase 3: Footer + Markdown (FR-5, FR-6)

| ID | Task | Files | Est. Lines |
|----|------|-------|-----------|
| FR-5.1 | Footer 创建 (createAgentFooter) | `ui-tool-blocks.ts` | ~30 |
| FR-6.1 | renderInlineMarkdown 移植 | `src/core/markdown.ts` (new) | ~120 |

### Phase 4: Nudge + Concurrency (FR-7, FR-8)

| ID | Task | Files | Est. Lines |
|----|------|-------|-----------|
| FR-7.1 | shouldNudge 增强 | `main-xhr-inject.ts` | ~15 |
| FR-7.2 | nudge 超限处理 | `main-xhr-inject.ts` | ~10 |
| FR-8.1 | isAgentLoopRunning 防护 | `ui-tool-blocks.ts` | ~10 |

### Phase 5 (Optional): Trace Persistence

| ID | Task | Files | Est. Lines |
|----|------|-------|-----------|
| — | localStorage trace + restore | `agent-trace.ts` (new) + `ui-tool-blocks.ts` | ~100 |

## 5. Test Criteria

### TC-1: Agent Panel Creation
1. 开启 Agent 模式 → 发起工具调用 → 验证 agent panel 容器出现在聊天中
2. 容器包含第一个 step 元素，header 显示 "Step 1" + "streaming..."

### TC-2: Streaming Text
1. 静默循环发起后 → 验证 step body 增量显示模型流式文本
2. 文本中不含 `<web_search>` 等工具 XML 标签
3. body 自动滚动到底部

### TC-3: Step Completion
1. 工具调用检测到 + 执行完成 → step header 状态变为 "Completed"
2. 800ms 后 step 自动折叠
3. 点击 header 可展开/收起

### TC-4: Footer Statistics
1. 循环完成后 → footer 显示 "Agent complete (N steps, M tool calls)"
2. 数字与实际步数和工具调用数一致

### TC-5: Cleanup
1. 发送新用户消息 → 旧 agent panel 被移除
2. 不会出现两个以上 agent panel 同时存在

## 6. Appendix

### A. 消息协议定义

```typescript
// MAIN → Isolated
interface AgentStepStarted {
  type: 'DS_MINI_AGENT_STEP_STARTED';
  loopId: string;
  stepIndex: number;
}

interface AgentStreamChunk {
  type: 'DS_MINI_AGENT_STREAM_CHUNK';
  loopId: string;
  stepIndex: number;
  fullText: string;  // 累积的全部文本
  delta: string;     // 本次增量
}

interface AgentToolDetected {
  type: 'DS_MINI_AGENT_TOOL_DETECTED';
  loopId: string;
  stepIndex: number;
  call: { name: string; payload: Record<string, unknown> };
}

interface AgentStepComplete {
  type: 'DS_MINI_AGENT_STEP_COMPLETE';
  loopId: string;
  stepIndex: number;
  toolExecutions: Array<{
    name: string;
    ok: boolean;
    summary: string;
  }>;
}

interface AgentLoopComplete {
  type: 'DS_MINI_AGENT_LOOP_COMPLETE';
  loopId: string;
  totalSteps: number;
  totalTools: number;
  finalText: string;
}

interface AgentLoopError {
  type: 'DS_MINI_AGENT_LOOP_ERROR';
  loopId: string;
  stepIndex: number;
  error: string;
}
```

### B. deepseek-pp Source References

| 功能 | 源文件 | 行号 |
|------|--------|------|
| 容器创建 + 挂载 | `entrypoints/content.ts` | 3021-3038 |
| Step 元素 | `core/inline-agent/renderer.ts` | 244-294 |
| 流式更新 | `core/inline-agent/renderer.ts` | 296-312 |
| Auto-collapse | `entrypoints/content.ts` | 3277-3279 |
| 工具结果 | `core/inline-agent/renderer.ts` | 324-337 |
| Footer | `core/inline-agent/renderer.ts` | 339-358 |
| CSS | `core/inline-agent/renderer.ts` | 20-233 |
| Markdown | `core/inline-agent/markdown.ts` | 1-118 |
| 事件路由 | `entrypoints/content.ts` | 3158-3192 |
| Stream 文本过滤 | `core/interceptor/streaming-tool-text.ts` | — |
| shouldNudge | `core/inline-agent/prompt.ts` | 92-100 |
