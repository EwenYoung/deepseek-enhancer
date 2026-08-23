# 经验索引

- [ui-theme-vars](ui-theme-vars.md) — 面板主题 CSS 变量的坑（3 条）
  - 元素级 CSS 变量声明永远赢过继承，html 内联覆盖对它无效；合成值用独立低层变量下发
  - ink 深色下 --accent/--danger 是浅色，按钮文字必须用 --accent-text，写死 #fff 不可读
  - 官方新组件主题冲突：--dsl-checkbox-color 元素级不走 dsw-alias 链；当前会话行 * 涂装会给行内 svg 刷方形底，覆盖须含整个子树
- [storage-config-defaults](storage-config-defaults.md) — storage 配置读取与备份的默认值处理（1 条）
  - 存储值可能是 undefined/{}/部分字段，读取侧合并默认值；备份导入缺键回填默认值
- [sidebar-dom-automation](sidebar-dom-automation.md) — 侧边栏 DOM 自动化操作（3 条）
  - 按 title/文字找按钮会误中扩展注入的按钮，查找时排除 #ds-category-panel 等扩展容器
  - 官方多选入口在会话行三点菜单「多选」项，退出在顶部栏图标按钮
  - 自动化搞坏页面后先查输入框草稿再 location.reload() 兜底；绝不碰删除类按钮
