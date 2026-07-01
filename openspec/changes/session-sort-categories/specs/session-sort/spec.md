# Session Sort

## Overview
分类内会话排序功能，支持拖拽自定义排序和条件排序两种模式。

## Requirements

### R1: 排序模式切换
- 每个分类标题栏右侧添加排序模式按钮
- 点击循环切换：拖拽模式 → 时间倒序 → 时间正序 → 名称排序 → 拖拽模式
- 按钮上显示当前模式的图标/标识
- 当前模式在会话列表中生效

### R2: 拖拽排序（`sortBy: "custom"`）
- 拖拽模式下每个会话条目显示拖动手柄（⠿）
- 使用 HTML5 Drag & Drop API
- 拖拽过程中显示占位指示线
- 松开后保存新顺序到 `customOrder`
- 自动切换到 `sortBy: "custom"` 模式

### R3: 条件排序
- 时间倒序（`time-desc`）：最新创建的在最前（默认）
- 时间正序（`time-asc`）：最早创建的在最前
- 名称排序（`name`）：按会话标题字母/拼音顺序
- 切换到条件排序时清除 `customOrder`

### R4: 数据持久化
- 排序模式保存到 `CategoryItem.sortBy`
- 自定义顺序保存到 `CategoryItem.customOrder`
- 通过 `saveCategories()` 统一持久化到 `chrome.storage.local`
- 页面刷新后恢复排序状态

### R5: 与现有功能兼容
- 归类新会话时遵循当前排序模式插入
- 隐藏的会话条目不参与拖拽排序
- 移出分类后不会破坏其他会话的排序
