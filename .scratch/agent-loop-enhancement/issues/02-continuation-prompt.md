# 02 — 续接提示词升级

**What to build:** 将工具结果回注的提示词从纯文本拼接升级为结构化 XML 模板，包含 `<original_task>` 和 `<tool_results>`，提升模型对上下文的理解度。

**Spec ref:** FR-2
**Priority:** P0
**Blocked by:** None（可与 01 并行）

**Status:** done

- [x] `augmentPrompt` 中存储用户原始 prompt 到 `window.__DS_ORIGINAL_PROMPT__`
- [x] `formatResults` 改为读取 `window.__DS_ORIGINAL_PROMPT__` 构建续接提示词
- [x] 模板格式：引导指令 + `<original_task>` + `<tool_results>` JSON
- [x] `originalTask` 截断 8000 字符（`clampText`）
- [x] 工具结果回注时，prompt 前缀与续接提示词不重复注入工具定义（只注入一次）

**Files:**
- `src/core/main-xhr-inject.ts` — `augmentPrompt`, 变量声明
- `src/core/ui-tool-blocks.ts` — `formatResults`

**Continuation prompt template:**

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

**Verification:**
1. 发起工具调用 → 查看静默循环 XHR 请求体中 prompt 字段
2. prompt 包含 `<original_task>` 和 `<tool_results>` 标签
3. `<original_task>` 内容与用户原始输入一致
