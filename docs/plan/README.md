# 实施计划索引

| 计划 | 状态 | 说明 |
|---|---|---|
| [tool-call-collapse.md](tool-call-collapse.md) | 进行中 | 工具调用原始输出折叠改为 CSS 裁剪方案 |

## 任务

| id | 状态 | 依赖 | 说明 |
|---|---|---|---|
| [collapse-001](tasks/collapse-001.md) | done | — | 重写 ui-collapse.ts（纯逻辑 + DOM 打标 + CSS） |
| [collapse-002](tasks/collapse-002.md) | done | collapse-001 | 联动清理：删 hideRawToolCalls、导出适配 |
| [collapse-003](tasks/collapse-003.md) | done | collapse-002 | 文档与术语同步 |

审查记录：[collapse-001-01](reviews/collapse-001-01.md)（pass）、[collapse-002-01](reviews/collapse-002-01.md)（pass）。

**当前状态**：三项检查（test 347 / typecheck / lint / format）+ build 全过；**等待用户人工验证**（见计划第六节）。

## 约定

- 开发/验证分离：develop agent 写代码，verify agent 审查，同一 agent 不兼两职。
- 串行执行：三个任务的 `path` 存在依赖，不并行。
- 每个任务完成即跑 `pnpm typecheck` + 任务要求的测试。
- **不提交**：遵循仓库工作流，代码停在未提交状态，等用户在 `chrome://extensions` 人工验证通过后再提交（AGENTS.md「提交时机」）。
