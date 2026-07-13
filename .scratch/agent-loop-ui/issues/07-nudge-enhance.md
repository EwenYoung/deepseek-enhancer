# 07 — Nudge 增强

**What to build:** 增强 nudge 检测逻辑，添加 `shouldNudge()` 函数（移植 deepseek-pp），添加 nudge 次数上限和超限处理。

**Spec ref:** FR-7
**Priority:** P2
**Blocked by:** None（独立增强，不改 UI）

**Status:** done

- [x] 移植 `shouldNudge()` 逻辑到 `main-xhr-inject.ts`:
  - 正则: `/(?:我将|我会|接下来|下一步|i'll|let me|next).{0,64}(?:调用|搜索|获取|执行|call|search|fetch|run)/gi`
  - 触发条件: 正则匹配到续行动词 + 回复总长度 < 200 字符
- [x] 添加 `nudgeCount` 上限检查: `nudgeCount >= MAX_NUDGES (8)` → 强制结束
- [x] 超限后 force end:
  - 发送 `DS_MINI_FINAL_RESPONSE` 并附带 budget notice
  - log warn: `[DS-Mini:MAIN] Max nudges (8) reached, forcing end`
- [x] 与新 agent panel 联动: nudge 触发的 XHR 也发送 stream chunk

**Files:**
- `src/core/main-xhr-inject.ts` — shouldNudge 移植 + 超限处理 (~20 lines)

**Verification:**
1. 模型输出 "接下来我将搜索" 且内容短 → 触发 nudge
2. 连续 8 次 nudge → 强制结束并输出 final response
3. 正常完成不触发 nudge
