# 02 — 隐藏续接消息

**What to build:** 续接 prompt 作为用户消息出现在 DOM 后，用 MutationObserver + display:none 隐藏它。参考 deepseek-pp `hideInlineAgentContinuationMessages`。

**Spec ref:** D-2, D-3
**Priority:** P0
**Blocked by:** 01 (需要 DOM submit 先产消息)

**Status:** done

- [ ] 新增 `isContinuationMessage(text: string): boolean` — 检测文本是否含 `<original_task>` + `<tool_results>` 标签
- [ ] `initToolBlocks` 的 MutationObserver 中增加续接消息检测：
  - 遍历新增的 `.ds-message` 元素
  - 检查 `textContent` 是否为续接消息
  - 设置 `data-ds-continuation="true"` + `display:none`
- [ ] 处理虚拟列表重渲染：observer 检测到已标记 `data-ds-continuation` 的节点 → 重新隐藏
- [ ] `processNewContent` 跳过续接消息：`if (el.getAttribute('data-ds-continuation')) return;`
- [ ] Agent panel 消息监听：收到续接消息相关 postMessage 时不创建新 step（避免重复）

**Files:**
- `src/core/ui-tool-blocks.ts` — isContinuationMessage + observer 增强

**Verification:**
1. DOM submit 完成后 → 新用户消息出现但 display:none
2. 模型回复正常显示
3. 刷新页面后历史正确（不在本 issue 范围）
