# Agent Loop Enhancement Specification

> 基于 `docs/deepseek-pp-analysis-report.md` 分析结论
> 目标分支: `feat/pow-silent-loop`
> 日期: 2026-07-13

## 1. Overview

本规格定义 agent loop 四个维度的增强，使静默循环行为对齐 deepseek-pp 开源版的链式调用模型，提升多轮工具调用的稳定性和模型理解度。

### 1.1 当前问题

| 问题 | 症状 | 根因 |
|------|------|------|
| 服务器端对话链断裂 | 重开会话时中间轮次消息暴露在 UI | `parentMessageId` 固定不变，始终指向首条消息 |
| 模型理解度差 | 多轮后模型输出脱离原始任务 | 续接提示词裸露原始数据，无结构化上下文 |
| 429 频率高 | 连续请求被限流 | 固定 1.5s 延迟，容易被识别为自动化 |
| 无主动结束 | 循环只能靠"无工具调用"判断结束 | 缺少 `<task_complete>` 标记解析 |

## 2. Functional Requirements

### FR-1: parentMessageId 链式更新

**Priority:** P0
**Files:** `src/core/main-xhr-inject.ts`

#### FR-1.1 SSE Ready 事件解析

SSE 流首条 data 行为 ready 事件，携带 `response_message_id`:

```json
{"request_message_id":3,"response_message_id":4,"model_type":"expert"}
```

首次收到此类事件时，提取 `response_message_id` 并存储。

#### FR-1.2 lastCtx 扩展

`lastCtx` 新增字段:

```typescript
lastCtx = {
  chat_session_id: string;
  model_type: string;
  lastBody: object | null;
  reqHeaders: Record<string, string> | null;
  parentMessageId: number | null;  // NEW
};
```

#### FR-1.3 handleSilentLoop 使用 parentMessageId

`handleSilentLoop` 构建请求体时:
- 若 `lastCtx.parentMessageId` 非空，设置 `parentMessageId` 为该值
- 不再深拷贝 `lastCtx.lastBody`（其中 `parentMessageId` 指向首条消息）

#### FR-1.4 SSE 响应后更新 parentMessageId

每个 `handleSilentLoop` 发起的 XHR，其 progress handler 解析到 ready 事件时:
- 提取 `response_message_id`
- 更新 `lastCtx.parentMessageId` 为新值

#### FR-1.5 新用户消息重置

`XMLHttpRequest.prototype.send` 检测到新用户消息（prompt 不以 `[工具执行结果]` 开头）时:
- `lastCtx.parentMessageId = null`
- 与现有 `silentDepth = 0` 重置逻辑同行

### FR-2: 续接提示词升级

**Priority:** P0
**Files:** `src/core/ui-tool-blocks.ts`, `src/core/main-xhr-inject.ts`

#### FR-2.1 原始任务存储

新增全局变量存储用户原始 prompt:

```typescript
let originalUserPrompt = '';
```

在 `augmentPrompt` 中，当检测到新用户消息（非工具结果回注）时:
- 保存 `parsed.prompt`（去除注入前缀后的用户原文）到 `originalUserPrompt`

#### FR-2.2 续接提示词模板

`formatResults` 函数输出格式变更。当前:

```
[工具执行结果]
工具: 联网搜索
结果:
原始数据...
```

变更为:

```
以下是工具执行结果。请基于原始任务和这些结果继续推进。
如果结果已经足够，请输出最终结论；只有确实需要更多信息时才继续调用工具。

<original_task>
{用户原始prompt，截断8000字符}
</original_task>

<tool_results>
[{"tool":"web_search","ok":true,"summary":"...","detail":"...","output":[...]}]
</tool_results>
```

#### FR-2.3 originalUserPrompt 传递路径

1. MAIN 层 `augmentPrompt` → 写入 `window.__DS_ORIGINAL_PROMPT__`
2. Isolated 层 `formatResults` → 读取 `window.__DS_ORIGINAL_PROMPT__`
3. 或通过 `postMessage` 在 `DS_MINI_TOOL_CALLS` 消息中附带

### FR-3: 工具结果结构化

**Priority:** P1
**Files:** `src/core/types.ts`, `src/core/ui-tool-blocks.ts`, `src/core/tool-executor.ts`

#### FR-3.1 ToolResult 扩展

```typescript
export interface ToolResult {
  callId: string;
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
  // NEW fields
  summary: string;   // 单行摘要，≤100字符
  detail: string;    // 详细结果，截断4000字符
  output: unknown;   // 原始结构化输出，截断8000字符
  truncated: boolean; // 是否有字段被截断
}
```

#### FR-3.2 executeToolCall 适配

`tool-executor.ts` 中各工具执行函数返回时填充 `summary`/`detail`/`output`:
- `web_search`: summary = "找到 N 条结果", detail = 前 N 条标题+摘要, output = 原始 results 数组
- `web_fetch`: summary = "抓取成功，内容长度 N", detail = 页面正文前 4000 字符, output = 原始 markdown
- `news_hub`: summary = "聚合 N 条新闻", detail = 新闻列表, output = 原始数据
- `github_trending`: summary = "获取 N 个热门项目", detail = 项目列表, output = 原始数据

#### FR-3.3 formatResults 输出 JSON

```typescript
function formatResults(results: ToolResult[]): string {
  const structured = results.map(r => ({
    tool: r.toolName,
    ok: r.success,
    summary: r.summary,
    detail: clampText(r.detail, 4000),
    output: clampText(JSON.stringify(r.output), 8000),
    error: r.error,
    truncated: r.truncated,
  }));
  // 嵌入续接提示词模板
  return buildContinuationPrompt(structured);
}
```

### FR-4: 请求间隔随机化

**Priority:** P1
**Files:** `src/core/main-xhr-inject.ts`

#### FR-4.1 随机延迟

`handleSilentLoop` 中 `setTimeout` 延迟变更:

```typescript
// Before:
setTimeout(/* ... */, 1500);

// After:
const delay = 2500 + Math.random() * 4000; // 2.5s-6.5s
setTimeout(/* ... */, delay);
```

### FR-5: 任务完成标记

**Priority:** P2
**Files:** `src/core/main-xhr-inject.ts`, `src/core/ui-tool-blocks.ts`

#### FR-5.1 标记格式

模型可输出:

```xml
<task_complete>{"summary": "任务完成摘要"}</task_complete>
```

#### FR-5.2 解析与行为

- SSE 文本累积中检测到 `<task_complete>` 标签 → 立即结束循环
- `checkSilentBuf` 检测到 → 不触发后续工具调用
- 标签内容从最终回复中移除
- summary 用于 UI 显示（可选）

#### FR-5.3 提示词更新

工具注入提示词追加:

```
任务完成后请输出 <task_complete>{"summary": "你的总结"}</task_complete> 标记结束。
```

### FR-6: Nudge 机制

**Priority:** P2
**Files:** `src/core/main-xhr-inject.ts`

#### FR-6.1 检测正则

当模型回复不包含工具调用时，检测:

```regex
/(?:我将|我会|接下来|下一步|i'll|let me|next).{0,64}(?:调用|搜索|获取|执行|call|search|fetch|run)/gi
```

#### FR-6.2 触发条件

1. 正则匹配到续行动词
2. 后续内容 < 200 字符（模型还没说完）
3. 当前 nudge 次数 < MAX_NUDGES (8)

#### FR-6.3 Nudge Prompt

```
你刚才提到了要继续行动但未输出工具调用。如果需要执行工具，请输出 XML 工具标签；如果任务已完成，请输出 <task_complete> 标记。不要输出其他内容。
```

## 3. Non-Functional Requirements

### NFR-1: 向后兼容

- `parentMessageId` 为 null 时行为不变（首轮循环）
- 工具结果新字段均有默认值，旧调用方不受影响
- 续接提示词变更不影响 DOM 提交路径

### NFR-2: 性能

- SSE ready 事件解析增加开销 < 0.1ms
- 结构化 JSON 序列化增加开销 < 1ms
- 随机延迟不影响首次请求响应时间

### NFR-3: 安全

- `originalUserPrompt` 存储在 `window`（MAIN world），不写入 DOM 或持久化存储
- 提示词模板不引入外部输入拼接，无注入风险

## 4. Implementation Plan

### Phase 1 (current branch `feat/pow-silent-loop`)

| ID | Task | Est. Lines | Dependencies |
|----|------|-----------|--------------|
| FR-1 | parentMessageId 链式更新 | ~25 | None |
| FR-2 | 续接提示词升级 | ~30 | FR-1 (同文件) |
| FR-3 | 工具结果结构化 | ~25 | FR-2 (formatResults) |
| FR-4 | 请求间隔随机化 | ~1 | None |

### Phase 2 (后续 PR)

| ID | Task | Est. Lines | Dependencies |
|----|------|-----------|--------------|
| FR-5 | 任务完成标记 | ~20 | FR-3 (提示词模板) |
| FR-6 | Nudge 机制 | ~40 | FR-5 (标记解析共用) |

## 5. Test Criteria

### TC-1: parentMessageId 链

1. 发起工具调用 → 验证静默循环 XHR 请求体中 `parentMessageId` 为 SSE ready 返回的 `response_message_id`
2. 多轮循环 → 验证每轮 `parentMessageId` 递增
3. 新用户消息 → 验证 `parentMessageId` 重置为 null

### TC-2: 续接提示词

1. 发起工具调用 → 验证静默循环 prompt 包含 `<original_task>` 和 `<tool_results>` 标签
2. `<original_task>` 内容与用户原始输入一致
3. `<tool_results>` 包含 JSON 数组，每项具有 `tool`/`ok`/`summary` 字段

### TC-3: 工具结果结构

1. `web_search` 工具调用 → 验证 `ToolResult.summary` 非空
2. 包含大量结果的输出 → 验证 `output` 截断生效、`truncated` 为 true

### TC-4: 请求间隔

1. 多次循环 → 验证延迟在 2500-6500ms 范围内
2. 验证连续两次延迟不相等（随机性）

### TC-5: 任务完成标记

1. 模型回复包含 `<task_complete>` → 验证循环结束、不触发下一轮
2. 验证标记内容从 UI 可见文本中移除

## 6. Appendix

### A. 完整 SSE Ready 事件示例

```json
{
  "request_message_id": 3,
  "response_message_id": 4,
  "model_type": "expert"
}
```

首次 `data:` 行即为 ready 事件，后续为增量文本。

### B. 续接提示词完整模板

```
以下是工具执行结果。请基于原始任务和这些结果继续推进。
如果结果已经足够，请输出最终结论；只有确实需要更多信息时才继续调用工具。

<original_task>
{clampText(originalTask, 8000)}
</original_task>

<tool_results>
{JSON.stringify(results, null, 2)}
</tool_results>
```

### C. 源代码索引

| 功能 | 文件 | 关键函数/变量 |
|------|------|-------------|
| XHR 拦截 & 静默循环 | `src/core/main-xhr-inject.ts` | `handleSilentLoop`, `lastCtx`, `augmentPrompt` |
| 工具结果格式化 | `src/core/ui-tool-blocks.ts` | `formatResults`, `handleMainWorldToolCalls` |
| 工具执行 | `src/core/tool-executor.ts` | `executeToolCall` |
| 类型定义 | `src/core/types.ts` | `ToolResult`, `ToolCall` |
| SSE 解析 | `src/core/sse-parser.ts` | `extractContent`, `parseSSEChunk` |
