## Context

分类面板（`ui-categories.ts`）中的每个分类维护一个 `sessions: string[]` 数组，目前使用 `unshift` 插入新会话（最新在最前），无其他排序能力。用户需要灵活调整会话顺序。

已有基础设施：
- `chrome.storage.local` 持久化分类数据
- `categorizeSession()` 管理会话归属
- `refreshPanel()` 重建分类列表 DOM

## Goals / Non-Goals

**Goals:**
- 拖拽排序：按住会话条目拖拽到目标位置
- 条件排序：按加入时间正序/倒序、按名称排序
- 排序状态持久化到 `chrome.storage.local`

**Non-Goals:**
- 不添加第三方拖拽库（用原生 HTML5 Drag & Drop）
- 不涉及分类之间跨分类拖拽
- 不涉及侧边栏全局排序

## Decisions

### 1. 数据存储扩展

在 `CategoriesData.items[categoryName]` 中新增 `sortBy` 和 `customOrder` 字段：

```json
{
  "items": {
    "工作": {
      "createdAt": 1687948800000,
      "sessions": ["uuid1", "uuid2"],
      "sortBy": "custom",        // "time-asc" | "time-desc" | "name" | "custom"
      "customOrder": ["uuid2", "uuid1"]  // 自定义顺序（拖拽后保存）
    }
  }
}
```

**方案**：扩展现有 `CategoryItem` 接口，新增可选字段。如果 `sortBy` 不存在，默认按加入时间倒序（保持当前行为）。

### 2. 排序按钮 UI

在分类标题栏右侧（`⋯` 按钮左侧）添加排序模式切换按钮：
- 默认显示「⇅」排序图标
- hover 显示当前排序模式
- 点击循环切换：拖拽模式 → 时间倒序 → 时间正序 → 名称 → 拖拽模式…
- 拖拽模式下每个会话条目左侧出现「⠿」拖动手柄

**方案**：不额外占用分类标题行空间，用切换按钮实现多模式轮转。

### 3. 拖拽实现

使用原生 HTML5 Drag & Drop API：
- `draggable="true"` 在 `.ds-cat-item` 上启用拖拽
- `dragstart` 记录被拖拽的 sessionId
- `dragover` 阻止默认行为 + 插入占位指示线
- `drop` 更新 `customOrder` → 保存 → 刷新面板

**方案**：原生 API 零依赖，拖拽完成后自动切换到 `sortBy: "custom"` 模式。

### 4. 条件排序

在 `buildCategoryListHTML()` 中根据 `sortBy` 对 `item.sessions` 排序：
- `time-desc`: 按 `createdAt` 降序（默认）
- `time-asc`: 按 `createdAt` 升序
- `name`: 从 DOM 读取会话标题排序
- `custom`: 按 `customOrder` 数组顺序

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 拖拽在移动端不工作 | 移动端使用排序按钮切换条件排序，拖拽仅在桌面端可用 |
| 会话标题未加载时无法按名称排序 | 回退到按 sessionId 排序 |
| customOrder 与 hiddenSessions 冲突 | 隐藏条目仍保留在 customOrder 中，`getSessionTitleFromDOM` 可读取 `display:none` 元素的文本 |
