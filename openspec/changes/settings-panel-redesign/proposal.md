## Why

当前设置面板采用底部折叠 + 3 标签页（增强功能 / 面板设置 / API 设置）的布局，需要两步才能访问：先点展开「设置」，再切换 Tab。交互路径长、内容割裂、标签页之间切换也不直观。用户希望在打开面板时所有设置一目了然。

## What Changes

- 去掉底部「设置」折叠区和 3 个标签页
- 将所有设置项以**内联卡片形式**整合到面板主内容区
- 每个设置组（增强功能 / 面板设置 / API）作为独立卡片，自然分区
- 面板整体统一滚动（不再分区固定）

## Capabilities

### New Capabilities
- `inline-settings`: 设置项内联展开到面板主内容区

### Modified Capabilities
- （无）

## Impact

- `src/core/ui-panel.ts`: 重写 `buildPanelHTML()`，移除折叠/标签页逻辑；移除 `switchSettingsTab()`；更新 `bindPanelEvents()` 绑定方式
- `src/core/ui-categories.ts`: 无影响
- 面板视觉风格统一（卡片分隔、过渡动画）
