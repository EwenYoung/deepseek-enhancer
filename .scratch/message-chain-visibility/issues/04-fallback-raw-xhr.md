# 04 — Raw XHR 回退路径

**What to build:** `domSubmitText` 失败时回退到 raw XHR（简化版，不包含 PoW 计算）。回退路径仅保证功能不中断，不保证消息链可见性。

**Spec ref:** D-5
**Priority:** P2
**Blocked by:** 01

**Status:** open

- [ ] `domSubmitText` 改为返回 boolean（成功/失败）
- [ ] 失败检测：textarea 未找到、send button 未找到、10s 内无网络活动
- [ ] 创建 `fallbackSilentXHR(text)` 函数：
  - 仅发 raw XHR（不 calc PoW，不带 x-ds-pow-response header）
  - 复用 `lastCtx` 的 `chat_session_id`、`parentMessageId`、`reqHeaders`
  - 响应通过 DS_MINI_FINAL_RESPONSE 发送
- [ ] console.warn 提示回退路径被触发
- [ ] 不发送 agent panel step started（回退路径 UI 已不可见）

**Files:**
- `src/core/ui-tool-blocks.ts` — domSubmitText 返回值 + fallback 函数

**Verification:**
1. Mock textarea 不存在 → 回退到 raw XHR → 最终响应正常渲染
2. Console 有 fallback warning
