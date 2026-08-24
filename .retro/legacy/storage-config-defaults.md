# Storage 配置默认值

## storage 读出的配置可能是 undefined / {} / 部分字段，读取侧必须合并默认值

- **症状**：两类。① `getConfig` 用 `(存储值) || 默认值`，备份 round-trip 写入 `{}` 后返回全 undefined 字段对象，面板主题名显示 "undefined"、themeIdx 算出 NaN；② 导入旧格式备份（新增键进 BACKUP_KEYS 之前导出的）时，"先 clear() 再只写备份里存在的键"会把新键静默清空（透明度不恢复的真因）。
- **原因**：`||` 只防 undefined 不防 `{}`（空对象是真值）；全量替换语义下"缺键=丢弃"与"缺键=默认值"不等价，后者才是恢复语义。
- **解法**：读取侧 `{ ...DEFAULT_CONFIG, ...存储值 }` 合并（默认值收敛为单一常量）；导入侧 `Object.hasOwn(data, key) ? data[key] : BACKUP_KEYS[key]` 回填。给 BACKUP_KEYS 新增键时两条路径自动安全，勿回退成"只写存在的键"。回归测试见 `__tests__/enhancer-features.test.ts`（空对象/部分字段）与 `__tests__/data-backup.test.ts`（旧格式备份回填）。
- **置信度**：验证过（两组测试锁定）
- **首次记录**：2026-08-24
- 已升级至 AGENTS.md
