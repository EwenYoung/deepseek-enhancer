# deepseek-pp Agent Loop 全面分析与改进方案

> 分析对象：`D:\project\deepseek-pp-main`（开源版 deepseek-pp）
> 对比对象：`D:\project\deepseek-enhancer`（当前项目，`feat/pow-silent-loop` 分支）
> 日期：2026-07-13

## 1. deepseek-pp Agent Loop 架构

### 1.1 核心流程

```
runInlineAgentLoop (core/inline-agent/loop.ts)
  │
  ├─ for step in 0..25 (INLINE_AGENT_MAX_STEPS):
  │   ├─ waitBetweenDeepSeekRequests (2.5-6.5s 随机延迟)
  │   ├─ buildContinuationPrompt(originalPrompt, allExecutions, locale)
  │   ├─ createPowHeaders(clientHeaders, powWasmUrl)  ← 每步新鲜 PoW
  │   ├─ submitPromptStreaming(input, callbacks, signal)
  │   │   ├─ parentMessageId = 上轮的 responseMessageId  ← 关键！
  │   │   └─ SSE 流式解析 → visibleText + toolCalls
  │   ├─ 更新 parentMessageId = turn.responseMessageId
  │   ├─ task complete? → break
  │   ├─ toolCalls found? → executeToolCallsSequentially → 追加到 allExecutions → continue
  │   ├─ no toolCalls + need nudge? → buildNudgePrompt → submitPromptStreaming again
  │   └─ no toolCalls + no nudge → resolvedFinalText → break
  │
  └─ post AGENT_LOOP_COMPLETE
```

### 1.2 parentMessageId 链式调用（最关键区别）

```typescript
// loop.ts:59
let parentMessageId: number | null = payload.parentMessageId;

// 每轮提交时 (loop.ts:89-99)
const input: SubmitPromptInput = {
    chatSessionId,
    parentMessageId,    // ← 上轮的 responseMessageId
    prompt,             // continuation prompt
    ...
};

// 收到响应后 (loop.ts:116)
parentMessageId = turn.responseMessageId;  // ← 更新为新的 messageId
```

**效果**：服务器上形成完整对话链，每轮都是正常消息延续。

### 1.3 续接提示词（buildContinuationPrompt）

```typescript
// core/inline-agent/prompt.ts:118-142
function buildContinuationPrompt(originalTask, executions, locale) {
    return [
        '以下是工具续跑任务刚刚执行的工具结果。请像真正的 Agent 一样，基于原始任务和这些工具结果继续推进。',
        '如果结果已经足够，请输出最终结论；只有确实需要更多信息、验证或文件修改时才继续调用工具。',
        '不要要求用户点击继续，也不要输出伪工具调用 JSON；需要继续操作时只输出可执行 XML 工具标签。',
        '',
        '<original_task>',
        clampText(originalTask, 8000),
        '</original_task>',
        ...(hasFailures ? ['如果有工具执行失败，请尝试其他替代方案或报告失败原因。'] : []),
        '',
        '<tool_results>',
        JSON.stringify(results, null, 2),  // ← 结构化 JSON
        '</tool_results>',
    ].join('\n');
}
```

### 1.4 工具结果结构

```typescript
// prompt.ts:174-188
function renderToolResults(executions) {
    return executions.map(e => ({
        tool: e.name,
        provider: e.provider?.displayName,
        ok: e.result.ok,            // 成功/失败
        summary: e.result.summary,
        detail: clampText(e.result.detail, 4000),
        error: e.result.error,
        output: clampText(JSON.stringify(e.result.output), 8000),
        truncated: e.result.truncated === true,
    }));
}
```

### 1.5 Nudge 机制

当模型回复不包含工具调用时，用正则检测是否暗示继续行动：
```regex
/(?:我将|我会|接下来|下一步|i'll|let me|next).{0,64}(?:调用|搜索|获取|执行|call|search|fetch|run)/gi
```
匹配到 + 后续内容很短 → 触发 nudge → 发 nudge prompt 要求模型输出工具调用或完成标记。

### 1.6 任务完成标记

模型可以通过输出 `<task_complete>{"summary": "..."}</task_complete>` 主动结束循环。

### 1.7 关键常量

| 常量 | 值 | 说明 |
|------|---|------|
| INLINE_AGENT_MAX_STEPS | 25 | 最大循环轮次 |
| INLINE_AGENT_MAX_NUDGES | 8 | 最大 nudge 次数/步 |
| STEP_TIMEOUT_MS | 120,000 | 每步超时 |
| REQUEST_DELAY_MIN/MAX | 2500/6500ms | 请求间隔 |
| FALLBACK_PARSE_MAX_CHARS | 120,000 | SSE 解析回退 |

---

## 2. 当前实现 vs deepseek-pp：差异对比

| 维度 | deepseek-pp | 当前实现 | 影响 |
|------|-------------|---------|------|
| **parentMessageId** | 每轮更新为 `responseMessageId` | 深拷贝首条请求 body，固定不变 | **服务器端对话链断裂**，重开会话时中间消息暴露 |
| **续接提示词** | 结构化 XML + Agent 指令 + `<original_task>` | `[工具执行结果]\n工具: xxx\n结果:\n原始数据` | 模型理解度差，裸露原始数据 |
| **工具结果格式** | JSON 结构 {tool,ok,summary,detail,output} | 纯文本拼接 | 模型难以快速判断结果质量 |
| **PoW 计算** | 每步独立计算 | 每步独立计算 | ✅ 已一致 |
| **Streaming 解析** | fetch + ReadableStream | XHR + progress 事件 | 功能等效 |
| **Max steps** | 25 | 10 | 差距不大 |
| **Nudge 机制** | 完整实现（检测 + nudge prompt） | 无 | 可能错过模型"还想继续"的信号 |
| **任务完成标记** | `<task_complete>` 主动结束 | 仅靠"无工具调用"判断 | 无主动结束机制 |
| **请求间隔** | 2.5-6.5s 随机延迟 | 固定 1.5s | 抗 429 能力较弱 |

---

## 3. 分级改进方案

### P0 — 修复 parentMessageId 链

**文件**：`src/core/main-xhr-inject.ts`

当前问题：`handleSilentLoop` 深拷贝 `lastCtx.lastBody`（首条请求），`parentMessageId` 永远指向首条消息。

修复：
1. 在 SSE 解析中提取 `responseMessageId`（首个 SSE ready 事件包含此字段）
2. 将其存储到 `lastCtx` 中
3. 下轮 `handleSilentLoop` 用新的 `parentMessageId`

SSE ready 事件示例：
```json
{"request_message_id":3,"response_message_id":4,"model_type":"expert"}
```

**改动量**：约 20 行

### P0 — 续接提示词升级

**文件**：`src/core/ui-tool-blocks.ts`（`formatResults` 函数）和 `src/core/main-xhr-inject.ts`（prompt 构建）

当前：
```
[工具执行结果]
工具: 新闻聚合
结果:
原始数据...
```

改为：
```
以下是工具执行结果。请基于原始任务和这些结果继续推进。
如果结果已经足够，请输出最终结论；只有确实需要更多信息时才继续调用工具。

<original_task>
{用户原始prompt}
</original_task>

<tool_results>
[{"tool":"news_hub","ok":true,"summary":"找到N条结果","detail":"...","output":[...],"truncated":false}]
</tool_results>
```

需要存储用户原始 prompt（目前未保存）。

**改动量**：约 30 行

### P1 — 工具结果结构化

**文件**：`src/core/types.ts`（ToolResult 接口）+ `src/core/ui-tool-blocks.ts`（formatResults）

给 `ToolResult` 增加 `summary` 和 `detail` 字段。`formatResults` 输出 JSON 结构。

**改动量**：约 15 行

### P1 — 请求间隔随机化

**文件**：`src/core/main-xhr-inject.ts`（handleSilentLoop timeout）

当前固定 1500ms → 改为 2500-6500ms 随机。

**改动量**：1 行

### P2 — Nudge 机制（方案讨论）

当模型回复无工具调用但有"我还要..."的信号时，发 nudge prompt。

实现成本较大（需正则检测 + 额外 API 调用），建议先验证 P0 效果后再评估。

### P2 — 任务完成标记

模型可输出 `<task_complete>` 主动结束循环，比"无工具调用就结束"更精确。

---

## 4. 实施路线

```
第一轮（本次分支）:
  P0: parentMessageId 链修复
  P0: 续接提示词升级
  P1: 工具结果结构化
  P1: 请求间隔随机化

第二轮（后续 PR）:
  P2: Nudge 机制
  P2: 任务完成标记
```

---

## 5. 源代码索引

| 功能 | deepseek-pp 文件 | 对应项目文件 |
|------|-----------------|-------------|
| Loop 引擎 | `core/inline-agent/loop.ts` | `src/core/ui-tool-blocks.ts:handleMainWorldToolCalls` |
| 续接提示词 | `core/inline-agent/prompt.ts` | `src/core/main-xhr-inject.ts:augmentPrompt` |
| PoW 求解 | `core/deepseek/pow.ts` | `src/core/ui-tool-blocks.ts:computePowHeader` |
| 静默 API 请求 | `core/deepseek/adapter.ts:submitPromptStreaming` | `src/core/main-xhr-inject.ts:handleSilentLoop` |
| SSE 解析 | `core/interceptor/sse-parser.ts` | `src/core/main-xhr-inject.ts:extractTextFromData` |
| API 路径定义 | `core/deepseek/contracts.ts` | 内联在 main-xhr-inject.ts 中 |
