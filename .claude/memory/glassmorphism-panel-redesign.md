---
name: glassmorphism-panel-redesign
description: "完整UI重设计：玻璃面板、Tools开关、Modal编辑器、设置重构的复盘"
metadata:
  type: reference
  tags: [ui, panel, glassmorphism, tools-toggle, modal]
---

## UI 重设计复盘

### 1. 玻璃毛玻璃面板（Glassmorphism）

**核心方案**：用 CSS 变量 + `backdrop-filter: blur(20px)` 替代内联样式

**关键洞察**：
- CSS 变量作用域从 `#ds-mini-panel` 移到 `:root` / `html.ds-dark`，确保弹窗 Modal 也能继承变量
- 深色模式切换通过 `document.documentElement.classList.toggle('ds-dark')` 全局生效
- 面板宽度从 360px 改为 340px，右侧悬浮 12px，圆角 16px
- 右下角发光圆点 `✦` 触发器，hover 展开「DeepSeek Enhancer」标签
- 面板变换从 `translateX(100%)` 改为 `translateX(calc(100% + 20px))`，隐藏时彻底移出

**移除**：
- 旧的 `.ds-panel-dark` 覆盖 hack（`!important` 通杀规则）
- 拖拽逻辑（不再需要 tab 位置持久化）
- 旧的 `ds-mini-panel-tab` 触发器

### 2. 设置区 3 tab 布局

**最终方案**：增强功能 | 面板设置 | API 设置 三个 tab，通过 `switchSettingsTab()` 函数切换

**坑**：之前的 `sed` 命令在增强功能尾部追加「面板透明度」代码，导致重复内容。手动删除第 341-346 行的重复块。

### 3. Tools 开关 — 跨世界通信

**架构**：
- `ui-panel.ts`（isolated world）→ toggle 开关 → 写 `localStorage` + `window.__DS_TOOLS_STATE__` + `postMessage`
- `main-xhr-inject.ts`（MAIN world）→ `buildToolDefs()` 每次实时从 `localStorage` 读 + `disabledTools` 合并
- `inject-context.ts`（isolated world）→ `buildInjectionContext()` 从 `window.__DS_TOOLS_STATE__` 读 + `setDisabledTools()`

**踩坑记录**：
| # | 尝试 | 问题 |
|---|------|------|
| 1 | 仅用 `postMessage` | MAIN world 监听器注册有时序问题 |
| 2 | 仅用 `chrome.storage.local` | MAIN world 无法访问 |
| 3 | 仅用 `localStorage` | 隔离世界和 MAIN 世界不一定共享（MV3），且 `localStorage` 的 `false` 与 `undefined` 判断逻辑容易写反 |
| 4 | ✅ 三路合并：`disabledTools` + `localStorage` + `__DS_TOOLS_STATE__` | 最可靠方案 |

**关键 bug**：`buildToolDefs` 过滤逻辑 `disabled[t.name] !== false` 当值为 `undefined` 时 `undefined !== false` 为 `true`，不会过滤。正确做法是 `!disabledTools[t.name]` 或构建白名单。

**注入记录累积**：`storeInjectionRecord` 通过 `el.textContent +=` 追加存储，切换工具状态后旧记录仍存在。导出时会匹配到旧注入。修复：在 `SET_TOOLS_STATE` 收到时清空 `ds-mini-injected` 元素内容。

### 4. Modal 弹窗系统

**拖拽**：标题栏 `mousedown` → 同步 `document mousemove/mouseup`。拖动时设 `position: fixed; left/top`，禁用 `transform`。

**拉伸**：右下角 `resizeHandle` div → `cursor:nwse-resize` → `mousedown` 记录起始宽高，`mousemove` 计算增量，最小 480x360，最大 90vw/90vh。

**深色适配**：CSS 变量在 `:root` / `html.ds-dark`，弹窗继承变量，不需要单独设色。

### 5. Token 速度开关

**问题**：关闭后页面残留速度显示。
**修复**：关闭时立即 `postMessage({ type: 'DS_MINI_TOKEN_SPEED_TOGGLE', enabled: false })` → content.ts **立即** `speedEl.remove() + speedEl = null`
**z-index**：从 999999 降到 99999（低于面板的 999999）

### 6. 输入框自动隐藏优化

**迟滞效应**：显示阈值 80px，隐藏阈值 150px，防止上下抖动
**有文字时不隐藏**：`onMouseMove` + `onTextareaBlur` + 初始状态全都检查 `ta.value.trim().length > 0`
**SPA 重建**：`MutationObserver` 监听 body，textara 重建后自动重新绑定

### 7. 图标选型

最终 Agent 模式图标用 🔥 火焰（代表力量/增强），此前尝试了：
- 机器人脸（用户说像锁）❌
- AI 星标 ❌
- 大脑 ❌
- 肌肉 💪 → 用户觉得不贴切 → 换
- 五角星 → 太普通 ❌
- 火焰 ✅

## 总结：MV3 扩展开发要点

1. **隔离世界 ↔ MAIN 世界通信**：`postMessage` 有监听器注册时序问题，配合 `localStorage` 或 `window` 全局变量做兜底
2. **CSS 变量优于 `[style*=""]` 选择器**：浏览器序列化问题，`[style*="hex"]` 不可靠
3. **SPA 重建**：DeepSeek 切换页面/会话时重建大量 DOM，持久功能必须用 `MutationObserver` 重新绑定
4. **CSS-in-JS**：DeepSeek 的 Emotion `background` 简写覆盖 `background-color`，需要用 `background` 简写 + `!important`

相关文件：`src/core/ui-panel.ts`、`src/core/main-xhr-inject.ts`、`src/core/inject-context.ts`、`src/core/enhancer-features.ts`、`src/entrypoints/content.ts`
