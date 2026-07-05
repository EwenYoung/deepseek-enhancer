## Context

当前面板有三个独立的功能区块：Agent 模式、Tools、Skills。它们各自有独立的 toggle 开关和存储 key，通过 `window.postMessage` 分别通知 MAIN world。但实际上 Tools 和 Skills 的 prompt 注入只在 Agent 循环中生效——Agent 关闭时，注入的 tool 定义和 skill 指令不会产生任何效果。当前的解耦设计增加了认知负担，用户可能开关组合无效。

## Goals / Non-Goals

**Goals:**
- Agent 开关作为 Tools 和 Skills 的统一入口
- Agent 关闭时，面板中的 Tools 和 Skills 区块隐藏
- Agent 关闭时，`/` 自动补全不触发并提示用户
- Agent 关闭时，Skill 指令注入停用
- 移除 Tools 和 Skills 的独立 toggle

**Non-Goals:**
- 不改动 Export、增强功能、面板设置、API 设置
- 不改变 Tools 和 Skills 的数据存储结构
- 不改变 silent loop 逻辑（已有 agentModeEnabled 守卫）

## Decisions

### D1: 面板隐藏策略 — `display:none`

用 CSS `display:none` 直接切换 Tools/Skills 区块的可见性，不做折叠动画。

**理由**：面板本身已有 slide-in 动画，内部区块不需要叠加第二层动画。Agent slider 的视觉反馈已经足够。

### D2: 移除独立 toggle

Tools 列表移除 `.ds-tool-toggle` 元素，Skills 卡片移除 `.ds-mini-toggle` 元素。Tool/Skill 的启用状态仍存储但不再暴露 UI 开关。

**理由**：Agent 总开关统一控制，嵌套开关增加不必要的复杂度。

### D3: `/` 自动补全 — 读 storage 判断

`ui-autocomplete.ts` 在弹出下拉前读取 `ds_mini_agent_mode`，Agent 关闭时不弹补全并显示 toast "请先开启 Agent 模式"。

**理由**：autocomplete 在 isolated world，可以直接读 `chrome.storage.local`，不需要新增消息通道。

### D4: Skill 注入跟随 Agent

`main-xhr-inject.ts` 的 `augmentPrompt()` 中，`skillInstructions` 拼接增加 `agentModeEnabled` 守卫。

**理由**：与 tool 定义注入的守卫逻辑保持一致，一处判断覆盖所有 prompt 增强。

## Risks / Trade-offs

- [Risk] 用户习惯单独开关某个 Tool → **Mitigation**: 简化后用户体验更清晰，Agent 开关语义明确
- [Risk] 已存储的 Tool/Skill 开关状态在 UI 中不可见 → **Mitigation**: 数据保留不删，未来如需恢复独立开关可从 storage 恢复
