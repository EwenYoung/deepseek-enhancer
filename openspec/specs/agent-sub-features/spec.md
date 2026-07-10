# agent-sub-features Specification

## Purpose
TBD - created by archiving change agent-sub-features. Update Purpose after archive.
## Requirements
### Requirement: Agent 控制 Tools 和 Skills 可见性

系统 SHALL 在 Agent 模式开启时显示 Tools 和 Skills 面板区块，在 Agent 模式关闭时隐藏这两个区块。

#### Scenario: 开启 Agent 显示子功能

- **WHEN** 用户开启 Agent 模式 toggle
- **THEN** Tools 区块和 Skills 区块立即显示（`display:block`）

#### Scenario: 关闭 Agent 隐藏子功能

- **WHEN** 用户关闭 Agent 模式 toggle
- **THEN** Tools 区块和 Skills 区块立即隐藏（`display:none`）

### Requirement: 移除 Tools 和 Skills 独立 toggle

系统 SHALL 移除 Tools 列表中每个 tool 的独立开关，以及 Skills 卡片中每个 skill 的独立开关。Tool 和 Skill 的启用状态仅由 Agent 总开关统一控制。

#### Scenario: Agent 开启时 Tools 全部生效

- **WHEN** Agent 模式开启
- **THEN** 所有已存储为启用状态的 Tool 一并生效，面板中不展示独立 toggle

#### Scenario: Agent 开启时 Skills 全部生效

- **WHEN** Agent 模式开启
- **THEN** 所有已存储为启用状态的 Skill 一并生效，面板中不展示独立 toggle

### Requirement: Agent 关闭时 `/` 自动补全禁用并提示

系统 SHALL 在 Agent 模式关闭时，禁止 `/` 触发 skill 自动补全下拉，并向用户显示 toast 提示"请先开启 Agent 模式"。

#### Scenario: Agent 关闭时输入 `/` 不弹补全

- **WHEN** Agent 模式关闭且用户在聊天输入框输入 `/`
- **THEN** 系统不弹出 skill 补全下拉列表，显示 toast "请先开启 Agent 模式"

#### Scenario: Agent 开启时输入 `/` 正常补全

- **WHEN** Agent 模式开启且用户在聊天输入框输入 `/`
- **THEN** 系统正常弹出 skill 补全下拉列表

### Requirement: Agent 关闭时 Skill 指令不注入

系统 SHALL 在 Agent 模式关闭时，不将 skill 指令注入到 prompt 中。

#### Scenario: Agent 关闭时 skill 注入被阻止

- **WHEN** Agent 模式关闭且用户通过 `/` 或其他方式尝试注入 skill 指令
- **THEN** `augmentPrompt` 返回的 prompt 中不包含 `skillInstructions`

#### Scenario: Agent 开启时 skill 正常注入

- **WHEN** Agent 模式开启且用户触发 skill 注入
- **THEN** `augmentPrompt` 返回的 prompt 中包含 `skillInstructions`

