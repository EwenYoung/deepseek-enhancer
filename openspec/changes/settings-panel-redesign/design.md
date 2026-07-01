## Context

当前面板（`ui-panel.ts`）结构：

```
标题栏 → Agent 模式 → Tools 列表 → 导出 → Skills 标题 + 列表 → [折叠设置区]
```

设置区折叠在底部，内分 3 个标签页（增强功能/面板设置/API），每个标签页内容约 4-6 行开关。

面板整体 340px × 100vh，Skills 列表区 `flex: 1` 撑满剩余空间。设置区被折叠后只有 40px 高。

## Goals / Non-Goals

**Goals:**
- 去掉「设置」折叠 + 3 标签页，以卡片形式展示
- 固定区：Agent 模式、Tools、Skills、导出会话（不滚动）
- 滚动区：增强功能、面板设置、API 设置（overflow-y: auto）
- Skills 列表在固定区内独立滚动（overflow-y: auto）

**Non-Goals:**
- 不修改设置项的实际功能逻辑
- 不修改面板外部触发机制
- 不改 Agent 模式、Tools 列表、导出、Skills 区的功能

## Decisions

### 1. 布局结构

**新结构**：

```
标题栏
Agent 模式
Tools 列表
─── 卡片分隔 ───
⚡ 增强功能 (内联开关行)
─── 卡片分隔 ───
🎨 面板设置 (透明度滑块)
─── 卡片分隔 ───
🔑 API 设置 (Key 输入)
─── 卡片分隔 ───
导出 (Markdown / HTML)
─── 卡片分隔 ───
Skills 标题 + 导入/新建按钮
Skills 列表 (可滚动)
```

**方案**：移除 `border-bottom` 分隔线，改用 `margin` + `border-radius` 卡片容器 + 背景色区分。每张卡片内部 compact 排列，所有开关/滑块/输入 inline 展示。

### 2. 卡片样式

每个设置卡片：
- `background: var(--card-bg)`
- `border: 1px solid var(--card-border)`
- `border-radius: 10px`
- `padding: 10px 12px`
- 卡片标题：`font-size: 11px; font-weight: 600; color: var(--panel-text-secondary)` + SVG 图标
- 开关行：`display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 12px`

### 3. 滚动行为

整个面板（不含标题栏）统一 `overflow-y: auto`，不再分区。Skills 列表不再单独 `flex: 1`，而是跟随面板整体滚动。

### 4. 移除的代码

- `#ds-settings-section` 整个折叠区 HTML
- `#ds-settings-toggle` 点击事件
- `switchSettingsTab()` 函数
- 所有 3 个标签页的切换逻辑

### 5. 动画

卡片使用 `@keyframes cardReveal` 从 `translateY(8px) opacity(0)` 到 `translateY(0) opacity(1)`，通过 `animation-delay` 依次入场（50ms 间隔）。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 面板内容变多，首次打开滚动条出现 | 卡片高度 compact（每行 28px），内容不超过 650px |
| 移除折叠后 Skills 列表可用空间减少 | Skills 列表跟随整体滚动，不再作为 flex-grow 区域 |
| 现有 `bindPanelEvents` 中设置区事件需要重构 | 只移除 `settingsToggle` 和 `switchSettingsTab`，其他事件保留 |
