# 经验索引

- [ui-theme-vars](ui-theme-vars.md) — 面板主题 CSS 变量的两个坑（2 条）
  - 元素级 CSS 变量声明永远赢过继承，html 内联覆盖对它无效；合成值用独立低层变量下发
  - ink 深色下 --accent/--danger 是浅色，按钮文字必须用 --accent-text，写死 #fff 不可读
- [storage-config-defaults](storage-config-defaults.md) — storage 配置读取与备份的默认值处理（1 条）
  - 存储值可能是 undefined/{}/部分字段，读取侧合并默认值；备份导入缺键回填默认值
- [agent-dispatch](agent-dispatch.md) — 子 agent 派发通道故障的降级（1 条）
  - Agent 工具持续报 captcha verify failed 时内联执行，别反复重试
