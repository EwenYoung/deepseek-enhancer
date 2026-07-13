# 03 — 导出器续接消息清理

**What to build:** `chat-exporter.ts` 在导出时检测续接消息，替换 XML 内容为可读 placeholder。

**Spec ref:** D-4
**Priority:** P1
**Blocked by:** 02 (需要 isContinuationMessage 函数)

**Status:** done

- [ ] 导出 `isContinuationMessage` 或复用到 chat-exporter
- [ ] `scrapeMessages` 或 `mergeInjectedPrefixes` 中：对每条消息检查是否为续接消息
- [ ] 续接消息内容替换：
  - Markdown: `> [Agent 内部续接消息 — 工具执行结果已提交]`
  - HTML: `<blockquote>[Agent 内部续接消息 — 工具执行结果已提交]</blockquote>`
- [ ] 模型回复正常保留：每条续接消息后的 assistant 回复是正常内容，不处理
- [ ] 单元测试：`src/core/__tests__/chat-exporter.test.ts` 增加续接消息过滤用例

**Files:**
- `src/core/chat-exporter.ts` — 增加清理逻辑
- `src/core/__tests__/chat-exporter.test.ts` — 增加测试

**Verification:**
1. 多轮 agent 会话 → 导出 → 结果包含所有轮次的模型回复
2. 续接消息显示为 placeholder，不是 XML
3. 轮次计数正确（如 3 轮 agent = 3 条续接 + 3 条回复 + 1 条用户消息 = 7 条总消息入导出）
