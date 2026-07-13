# Message Chain Visibility Specification

> 基于 `docs/deepseek-pp-message-chain-analysis.md`
> 目标：多轮 agent loop 的每轮交互在 DOM 和导出的会话中完整可见
> 日期: 2026-07-13

## Problem Statement

Agent loop 使用 raw XHR 发送续接 prompt。服务端正确创建了消息链（parentMessageId 递增），但页面 DOM 不感知这些消息——raw XHR 响应被扩展捕获处理，不经过 DeepSeek 页面的 React 渲染管线。导致会话导出只抓取到 DOM 中可见的最后一轮内容，中间轮次完全丢失。

## Solution

改回 `domSubmitText()` 提交续接 prompt。每条续接消息作为真实的用户消息通过页面发送按钮提交 → 页面自然渲染 → DOM 包含所有轮次 → 导出完整。用 `display:none` 隐藏丑陋的 XML prompt 消息，只显示模型回复。

参考 deepseek-pp 的三层方案：
1. 正常 API 调用（`fetch` / DOM submit）→ 服务端消息 + 页面渲染
2. DOM hiding → MutationObserver 隐藏续接消息
3. 导出清理 → 替换 XML 为 placeholder

## User Stories

1. 作为用户，导出 agent 会话时看到所有轮次的完整交互链路（每轮工具调用 + 模型回复），而不只是最后一轮
2. 作为用户，刷新页面后能看到完整的多轮对话历史（每轮续接 prompt 显示为 placeholder 而非 XML 裸文）
3. 作为用户，agent loop 运行期间不应看到丑陋的 `<original_task>` / `<tool_results>` XML 出现在聊天界面
4. 作为用户，agent 执行的每步流式文本和最终回复在聊天框内正确渲染，与普通对话无异
5. 作为插件的导出功能，能够区分正常用户消息和内部续接消息，对后者做内容替换

## Implementation Decisions

### D-1: 续接 prompt 改用 domSubmitText 发送

当前 raw XHR 路径废弃。续接 prompt 通过填充 textarea + 点击发送按钮提交，走页面原生消息流。

- 优点：PoW 由页面自动处理，消息在服务端和 DOM 双重持久
- 需处理：text 填充后触发 input 事件，send 按钮 click 事件，等待页面发起 XHR
- 限流：send 后延迟 500ms 给 page handlers 完成

### D-2: 续接消息 DOM 隐藏

参考 deepseek-pp `hideInlineAgentContinuationMessages`。在 `initToolBlocks` 的 MutationObserver 中增加检测逻辑：

- 识别含 `<original_task>` + `<tool_results>` 标签的消息 DOM 元素
- 设置 `display:none`
- 避免 CSS transition 闪烁：同步隐藏（不延迟）

### D-3: 续接检测防护

续接 prompt 触发页面发送后，页面 SSE 流中的 assistant 回复可能再次被 `processNewContent` 扫描出工具调用 → 触发 `handleMainWorldToolCalls`。需防护：

- 在 `processNewContent` 中：含 `<original_task>` 的消息直接跳过处理
- 在 `handleMainWorldToolCalls` 中：`agentLoopRunning` 已存在，作为双重防护

### D-4: 导出清理

`chat-exporter.ts` 的 `scrapeMessages` 增加续接消息处理：

- 遍历抓取到的消息，检测 `isContinuationMessage(text)`
- 续接消息内容替换为 `[Agent 续接消息 — 内容省略]`
- 注意处理 Markdown 格式：占位符作为 `<details>` 折叠块

### D-5: 静默回退路径

保留 raw XHR 作为 fallback（`domSubmitText` 失败时回退）。两种情况：
1. textarea 找不到 → fallback raw XHR
2. send 按钮找不到 → fallback raw XHR
3. 页面 XHR 超时 (10s 无响应) → fallback raw XHR

回退时 console.warn 提示消息链可能不完整。

### D-6: 消息结构

续接消息在 DOM 中结构：
```
[user message — hidden]   续接 prompt (<original_task>...)
[assistant message]       模型回复（含工具调用 XML 或最终回答）
```

下一轮循环：
```
[user message — hidden]   续接 prompt (新一轮)
[assistant message]       模型回复
```

### D-7: handleMainWorldToolCalls 调整

当前流程：工具执行 → DS_MINI_SILENT_RESULT → MAIN handleSilentLoop → raw XHR

新流程：
- 工具执行 → 如果 `ok.length > 0` → `domSubmitText(formatResults(ok))`（用 DOM 提交）
- 去掉 raw XHR silent loop 路径
- `handleSilentLoop` 函数删除或改为 no-op
- `handleMainWorldToolCalls` 尾部不需要等待 800ms → 改为等待 domSubmit 完成后返回

工具检测路径不变：MAIN world SSE progress → 检测工具调用 XML → postMessage → Isolated world `handleMainWorldToolCalls` → 执行工具 → domSubmitText 续接。

### D-8: PoW 处理

`domSubmitText` 走页面原生发送流程，PoW 由页面自动计算和附加。不需要扩展侧手动 PoW。

删除 `computePowHeader`、`loadPowWasm` 等 PoW 相关代码（仅在 silent loop 路径使用）。

## Testing Decisions

### 测试原则

不测 DOM 交互细节（textarea 填充、按钮点击），只测业务逻辑层：
- `isContinuationMessage` 判断函数
- `sanitizeContinuationContent` 替换函数
- 消息抓取 + 过滤逻辑

### 测试文件

- `src/core/__tests__/chat-exporter.test.ts` — 增加续接消息过滤测试
- `src/core/__tests__/sse-parser.test.ts` — 不需要改动

## Out of Scope

- 服务端消息删除/清理
- 历史消息 API 拦截（当前 enhancer 不劫持 fetch，只劫持 XHR）
- deepseek-pp 的 `XmlToolStreamFilter` SSE 流过滤（当前用 regex + DOM hiding 已足够）
- localStorage trace 持久化

## Further Notes

- deepseek-pp 的 `suppressPageEvents` 机制核心作用是阻止扩展自身的 callback 递归触发，enhancer 的 `agentLoopRunning` 标志已覆盖此场景
- deepseek-pp 的 `BYPASS_HOOK_HEADER` 是为了跳过自己的 fetch interceptor 避免递归，enhancer 不劫持 fetch 所以不需要
- deepseek-pp 的 history-cleanup 劫持 IndexedDB fetch，enhancer 不做这个——导出时清理即可
