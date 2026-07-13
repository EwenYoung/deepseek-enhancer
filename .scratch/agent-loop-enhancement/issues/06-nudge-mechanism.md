# 06 — Nudge 机制

**What to build:** 当模型回复无工具调用但有续行意图时，发送 nudge prompt 要求模型输出工具调用或完成标记。

**Spec ref:** FR-6
**Priority:** P2
**Blocked by:** 05（依赖 task_complete 标记作为 nudge 引导目标）

**Status:** done

- [x] 续行意图检测正则（中英文）：
  `/(?:我将|我会|接下来|下一步|i'll|let me|next).{0,64}(?:调用|搜索|获取|执行|call|search|fetch|run)/gi`
- [x] 触发条件：
  - 正则匹配到续行动词
  - 回复总长度 < 200 字符（模型还没说完就被截断）
  - 当前 nudge 次数 < MAX_NUDGES (8)
- [x] Nudge prompt 模板
- [x] `handleSilentLoop` / `checkSilentBuf` 中集成 nudge 检测
- [x] 每步最多 8 次 nudge，超过后强制结束

**Nudge prompt template:**
```
你刚才提到了要继续行动但未输出工具调用。如果需要执行工具，请输出 XML 工具标签；如果任务已完成，请输出 <task_complete> 标记。不要输出其他内容。
```

**Files:**
- `src/core/main-xhr-inject.ts` — 检测逻辑、nudge 发送

**Verification:**
1. Mock 模型回复 "接下来我将搜索" 且内容短 → 触发 nudge
2. Nudge 后模型输出工具调用 → 正常执行
3. Nudge 后模型输出 `<task_complete>` → 循环结束
4. 连续 8 次 nudge 无结果 → 强制结束
