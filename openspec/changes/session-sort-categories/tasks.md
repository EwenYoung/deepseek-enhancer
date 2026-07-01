## 1. 会话排序（分类内部）

- [x] 1.1 扩展 `CategoryItem` 接口：添加 `sortBy` 字段（`time-desc` / `time-asc`）
- [x] 1.2 实现 `toggleSortMode()` / `getSortIcon()` / `getSortLabel()` 方法
- [x] 1.3 在分类标题栏注入排序按钮（点击切换 ↓ 最新优先 ↔ ↑ 最早优先）
- [x] 1.4 `buildCategoryListHTML()` 按模式排序会话列表

## 2. 分类拖拽（分类之间）

- [x] 2.1 `.ds-cat-item` 添加 `draggable="true"`
- [x] 2.2 实现 `reorderCategory()` 分类顺序重排函数
- [x] 2.3 拖拽事件绑定（dragstart / dragover / drop）
- [x] 2.4 拖拽完成自动保存并刷新面板

## 3. 集成

- [ ] 3.1 验证刷新页面后排序状态恢复
- [ ] 3.2 验证切换排序模式后列表正确重排
- [ ] 3.3 验证分类拖拽后顺序正确持久化
