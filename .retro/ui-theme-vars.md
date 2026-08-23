# UI 主题变量

## 元素级 CSS 变量声明优先于继承——html 内联覆盖对它无效

- **症状**：`applyOpacity` 把 `--panel-bg` 写在 `document.documentElement.style` 上，滑杆拖动面板毫无反应；直觉以为"内联样式 > 样式表"应该生效。
- **原因**：ink 主题的 `#ds-mini-panel[data-ds-theme="ink"] { --panel-bg: … }` 把变量声明在**面板元素自身**。CSS 自定义属性按"元素上匹配的声明（任意优先级）> 从父级继承的值"解析——html 的内联值只对没有自身声明的后代有效。已在真实浏览器实测：html 内联已生效，元素计算背景仍取元素级声明。
- **解法**：不要在主题块里声明最终合成变量再用祖先内联覆盖；把可变的部分拆成独立低层变量（本例 `--panel-alpha`），主题块内写 `rgba(底色, var(--panel-alpha, 原值))`，JS 只写低层变量。默认外观不变，四种主题分支（:root / html.ds-dark / ink 浅 / ink 深）全部自动跟随。
- **置信度**：验证过（浏览器复现 + 修复后验证）
- **首次记录**：2026-08-24
- 已升级至 AGENTS.md

## ink 深色主题下 --accent/--danger 是浅色，按钮文字必须用 --accent-text

- **症状**：深色模式下"确认恢复"按钮文字不可见（白字落在浅灰 `--accent: #e4e4e7` 上，对比度 1.27:1）。这是 ink 主题改造（c26fe50）批量改色时漏改写死 `color:#fff` 的按钮所致。
- **原因**：ink 深色把 accent 系从深色反转为浅色，但文字色没跟着换。危险态同理：深色 `--danger: #f87171` 也是浅色，白字只有 2.77:1。
- **解法**：凡 `background: var(--accent)` 或 `var(--danger)` 的按钮，文字一律 `color: var(--accent-text,#fff)`（浅色 #fff / 深色 #18181b，两模式均 ≥4.5:1）。新增弹窗按钮时照抄 ui-categories.ts 三个确认按钮的模式，不要写死 #fff。排查手段：grep `color:\s*#fff` + 按 WCAG 公式算对比度。
- **置信度**：验证过（对比度数值计算）
- **首次记录**：2026-08-24
- 已升级至 AGENTS.md
