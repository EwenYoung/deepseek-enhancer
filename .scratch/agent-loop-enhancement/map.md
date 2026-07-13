# Agent Loop Enhancement — Map

**Effort:** agent-loop-enhancement
**Branch:** `feat/pow-silent-loop`
**Spec:** `docs/specs/agent-loop-enhancement.md`
**Source:** `docs/deepseek-pp-analysis-report.md` (deepseek-pp 开源版对比分析)

## Decisions so far

- **Phase 1 / Phase 2 拆分**: P0+P1 当前分支完成；P2（nudge + task_complete）后续 PR，因其依赖 Phase 1 的提示词模板基础设施就位
- **parentMessageId 来源**: SSE 首条 `data:` 行（ready 事件）携带 `response_message_id`，不需要额外 API 调用
- **originalUserPrompt 传递**: 用 `window.__DS_ORIGINAL_PROMPT__` 跨 world 传递，不经过 postMessage（减少消息类型）
- **请求间隔**: 采用 deepseek-pp 同款 2.5-6.5s 均匀随机，不引入指数退避（过度设计）

## Fog

- SSE ready 事件的 `response_message_id` 是否在所有模型类型（fast/expert/web）下都存在？需实测验证
- Nudge 机制的误触发率如何？P2 阶段需 A/B 测试
