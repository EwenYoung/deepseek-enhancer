## 1. Panel — 移除独立 toggle

- [x] 1.1 移除 Tools 列表中每个 tool 的 `.ds-tool-toggle` 元素，只保留图标和名称
- [x] 1.2 移除 Skills 卡片中每个 skill 的 `.ds-mini-toggle` 元素，只保留名称、描述、来源标签和编辑/删除按钮
- [x] 1.3 移除 tool toggle 和 skill toggle 相关的 click 事件绑定

## 2. Panel — Agent 控制子功能可见性

- [x] 2.1 在 `toggleAgentMode()` 中增加 Tools 区块和 Skills 区块的 `display` 切换逻辑
- [x] 2.2 在 `loadAgentMode()` 初始化时根据 Agent 状态设置 Tools/Skills 初始可见性
- [x] 2.3 移除独立的 `postToolsState()` 调用（Agent 开关统一触发）

## 3. Autocomplete — Agent 关闭时禁用 `/`

- [x] 3.1 在 `/` 触发补全前读取 `ds_mini_agent_mode`，Agent 关闭时不弹出补全
- [x] 3.2 Agent 关闭时显示 toast "请先开启 Agent 模式"

## 4. MAIN World — Skill 注入跟随 Agent

- [x] 4.1 在 `augmentPrompt()` 中为 `skillInstructions` 拼接增加 `agentModeEnabled` 守卫

## 5. Panel — 移除 Tools 展示区

- [x] 5.1 移除面板 HTML 中的 Tools 区块（`#ds-tools-section`），仅保留 Skills
