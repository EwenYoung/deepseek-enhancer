# 05 — 任务完成标记

**What to build:** 支持模型通过输出 `<task_complete>{"summary":"..."}</task_complete>` 主动结束循环，比"无工具调用就结束"更精确。

**Spec ref:** FR-5
**Priority:** P2
**Blocked by:** 02, 03（依赖提示词模板和工具结果格式就位）

**Status:** done

- [x] 工具注入提示词追加：告诉模型完成后输出 `<task_complete>` 标记
- [x] `checkSilentBuf` 和 `checkToolCallsBoth` 增加 `<task_complete>` 检测正则
- [x] 检测到标记 → 立即结束循环，不触发下一轮工具调用
- [x] 标记内容从 UI 可见文本中移除（`stripToolCalls` 同级逻辑）
- [x] summary 提取并通过 postMessage 传递（可选 UI 展示）

**Detection regex:**
```
/<task_complete>\s*(\{[\s\S]*?\})\s*<\/task_complete>/
```

**Files:**
- `src/core/main-xhr-inject.ts` — 检测逻辑、提示词更新
- `src/core/ui-tool-blocks.ts` — 可选 UI 展示

**Verification:**
1. Mock SSE 流包含 `<task_complete>` 标记 → 验证循环结束
2. 标记内容从最终 display text 中移除
