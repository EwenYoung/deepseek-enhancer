# 04 — 请求间隔随机化

**What to build:** 将静默循环 `setTimeout` 的固定 1500ms 延迟改为 2500-6500ms 均匀随机延迟。

**Spec ref:** FR-4
**Priority:** P1
**Blocked by:** None

**Status:** done

- [x] `handleSilentLoop` 中 `setTimeout` 第二个参数由 `1500` 改为 `2500 + Math.random() * 4000`

**Files:**
- `src/core/main-xhr-inject.ts` (1 行改动)

**Verification:**
1. 多次循环 → DevTools Console 查看 `[DS-Mini:MAIN] Silent loop #N` 日志时间戳间隔
2. 验证间隔在 2500-6500ms 范围内
3. 验证连续间隔不完全相同（随机性）
