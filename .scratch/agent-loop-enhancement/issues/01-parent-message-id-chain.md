# 01 — parentMessageId 链式更新

**What to build:** 静默循环每轮更新 `parentMessageId` 为上一轮 SSE ready 事件返回的 `response_message_id`，形成服务器端正确对话链。

**Spec ref:** FR-1
**Priority:** P0
**Blocked by:** None

**Status:** done

- [x] `lastCtx` 新增 `parentMessageId: number | null` 字段
- [x] SSE ready 事件解析：首条 `data:` 行提取 `response_message_id`，存入 `lastCtx.parentMessageId`
- [x] `handleSilentLoop` 请求体中设置 `parentMessageId`（非 null 时）
- [x] 新用户消息检测时重置 `parentMessageId = null`（与 `silentDepth = 0` 同行）
- [x] `checkSilentBuf` 同理解析 ready 事件更新 `parentMessageId`

**Files:**
- `src/core/main-xhr-inject.ts`

**Verification:**
1. 发起工具调用 → DevTools Network 面板查看静默 XHR 请求体中 `parentMessageId` 值
2. 多轮循环 → 验证每轮 `parentMessageId` 递增
3. 发送新用户消息 → 验证下次循环 `parentMessageId` 为 null（首轮）
