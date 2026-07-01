## Why

分类面板中每个分类内部的会话列表目前按加入时间倒序排列（最新在最前），用户无法自定义顺序。当分类内会话增多时，用户需要灵活调整排列方式——既希望按特定规则排序（时间/名称），也需要自由拖拽排序来突出重要会话。

## What Changes

- 在每个分类标题栏添加排序模式切换按钮（切换拖拽模式和排序模式）
- 拖拽排序模式：HTML5 Drag & Drop API 实现会话条目拖拽重排
- 排序模式：按加入时间正序/倒序、按名称排序
- 排序状态持久化到 `chrome.storage.local`

## Capabilities

### New Capabilities
- `session-sort`: 分类内会话排序功能，支持拖拽排序和条件排序

### Modified Capabilities
- （无，不修改现有 spec 的需求）

## Impact

- `src/core/ui-categories.ts`: 新增排序按钮、拖拽事件绑定、排序状态管理
- `src/core/conversation-store.ts`: 新增排序状态字段和排序方法
- `chrome.storage.local` 存储结构扩展：每个分类新增 `sortOrder`（自定义顺序数组）和 `sortBy`（排序模式）
