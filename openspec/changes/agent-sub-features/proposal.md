## Why

当前 Agent 模式、Tools、Skills 是面板中三个独立的功能区块，用户可以在 Agent 关闭时独立开关 Tools 和 Skills，但 Tools 和 Skills 的 prompt 注入实际上只在 Agent 循环中才有意义。这种解耦造成了认知负担（三个开关 vs 一个开关）和无效操作（关 Agent 但开 Tools 不会产生任何效果）。

## What Changes

- Tools 和 Skills 面板区块只在 Agent 开启时显示，Agent 关闭时隐藏（`display:none`）
- 移除 Tools 和 Skills 的独立 toggle 开关，Agent 总开关统一控制
- Agent 关闭时，`/` 自动补全不触发，并提示用户"请先开启 Agent 模式"
- Agent 关闭时，Skill 指令注入同步停用（与 Tool 注入行为一致）
- Export、增强功能、面板设置、API 设置不受影响，保持原有布局

## Capabilities

### New Capabilities

- `agent-sub-features`: Agent 模式作为 Tools 和 Skills 的统一入口，控制面板可见性和功能启用

### Modified Capabilities

<!-- 无现有 spec 被修改 -->

## Impact

- `src/core/ui-panel.ts` — 面板 HTML 结构、Tools/Skills 区块显示逻辑、toggle 事件绑定
- `src/core/ui-autocomplete.ts` — `/` 触发时检查 Agent 状态、toast 提示
- `src/core/main-xhr-inject.ts` — Skill 指令注入需跟随 Agent 开关
