# Agent Loop UI — Map

**Effort:** agent-loop-ui
**Branch:** `feat/agent-loop-ui`
**Spec:** `docs/specs/agent-loop-ui-replication.md`
**Source:** `docs/deepseek-pp-agent-loop-ui-analysis.md`

## Decisions so far

- **分 5 个 Phase**: Phase 1-2 为核心（panel + streaming），Phase 3 增强（footer + markdown），Phase 4 健壮性（nudge + concurrency），Phase 5 可选（trace persistence）
- **不与现有 tool block 冲突**: agent panel 提供精简摘要，tool block 保留详情展开，两者共存
- **loopId 生成**: Isolated world 生成 UUID，通过 `window.__DS_LOOP_ID__` 共享给 MAIN world
- **Throttle 策略**: `requestAnimationFrame` per deepseek-pp 方案，每帧最多渲染一次

## Fog

- 虚拟列表重渲染频率未知，MutationObserver 能否可靠保持容器附着需实测
- `renderInlineMarkdown` 移植后的 HTML 注入安全性需仔细审查
- 流式 chunk 频率过高时 postMessage 性能是否可接受
