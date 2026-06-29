## Why

当前控制面板 UI 采用硬编码内联样式，深色/浅色适配靠 CSS 覆盖 hack 实现，emoji 作为图标、设置区折叠、编辑器内嵌在狭小面板内等设计问题影响使用体验。需要一次完整的 UI/UX 重设计，统一视觉语言，提升交互质量。

## What Changes

- **面板重设计**：改为玻璃毛玻璃风格（glassmorphism），340px 宽，右侧悬浮，圆角 16px
- **右下角发光圆点触发器**：替换当前右侧竖条 tab，hover 显示文字标签
- **深色/浅色双主题**：建两套 CSS 变量体系，统一管理颜色
- **设置区分页**：底部固定分页（增强功能 / API 设置）
- **编辑器弹窗**：新建/编辑 skill 弹窗改为页面中央大弹窗（~700x600px）
- **删除确认弹窗**：删除 skill 时弹出确认对话框
- **开关控件统一**：全部改为 iOS 风格 toggle
- **Tools 改为 1 列竖向排列**：每行左侧图标+名称，右侧标签说明
- **去除 GitHub 导入**：移除不稳定的 `📦` GitHub 导入按钮
- **去除技能编辑按钮**：技能卡片仅保留开关和删除按钮
- **全部 emoji 替换为 Lucide SVG 图标**

## Capabilities

### New Capabilities
- `glass-panel`: 玻璃态面板模块，含右下角发光触发器、面板骨架、动画系统
- `modal-editor`: 页面中央大弹窗系统，含编辑和确认删除两个弹窗
- `theme-system`: CSS 变量驱动的深色/浅色双主题体系

### Modified Capabilities
- 无（无现有 spec 需要修改）

## Impact

- `src/core/ui-panel.ts`：面板 HTML 重写、样式体系重构、设置区分页
- `src/core/enhancer-features.ts`：CSS 变量对接
- 删除 `src/core/skill-importer.ts` 中的 GitHub 导入功能（约 200 行）
- 新增 Lucide SVG 图标集成
