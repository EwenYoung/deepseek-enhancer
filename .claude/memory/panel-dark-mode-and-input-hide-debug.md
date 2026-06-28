---
name: panel-dark-mode-and-input-hide-debug
description: "面板深色适配、输入框自动隐藏迟滞、语音快捷键等功能的调试过程"
metadata:
  type: reference
  tags: [css, debug, dark-mode, auto-hide, voice-input]
---

## 今日改动总览

### 1. 背景主题 CSS 改用 `background` 简写

**改动**：`background-color` → `background` 简写属性

**根因**：CSS-in-JS 可能用 `background` 简写（`background: #fff`）设白色背景，`background-color` 覆盖不了这个简写。改用 `background` 简写 + `!important` 才能压过。

**坑**：no-bg 透明区域也必须同步改 `background: transparent`，否则透明失效。

### 2. 面板深色模式

**方案**：面板创建时注入 `<style id="ds-panel-dark-style">`，用 class `.ds-panel-dark` 控制颜色切换

**关键洞察**：
- `[style*="hex颜色"]` 在浏览器中无效——inline style 会被序列化为 `rgb()`，不会保留 hex
- `[style*="display:grid"] > div` 可选，但最终还是用 **ID 选择器** 更可靠（如 `#ds-mini-add-skill`）
- **通杀规则** `#panel.dark [style] { background: #1e1e2e !important }` 配合例外规则覆盖全部面板元素

**踩坑记录**：
| # | 尝试 | 结果 |
|---|------|------|
| 1 | `[style*="background"]` 属性选择器 | 浏览器 CSS 样式序列化不匹配 hex 值 |
| 2 | 只覆盖特定 `button[style*="4f46e5"]` | 漏掉导出/Skills/设置按钮 |
| 3 | `> div` 选择子级 | 嵌套子级漏掉 |
| 4 | ✅ `[style]` 通杀 + ID 特例 | ✅ 全区域覆盖 |

### 3. 输入框自动隐藏 — 迟滞效应

**方案**：**显示阈值 80px，隐藏阈值 150px**，不同阈值避免来回闪烁

```
当前隐藏 + 鼠标距底 < 80px  → 显示
当前显示 + 鼠标距底 > 150px → 隐藏
80~150px 之间 → 保持当前状态
```

**关键洞察**：单一阈值 + mousemove = 输入框反复弹跳。用户下拉唤出后稍微上移一点就隐藏了。

**文本输入框焦点控制**：
- textarea focus 时强制显示输入框
- blur 后交由 mousemove 控制
- 有焦点 → 一直显示，不响应鼠标位置

### 4. SPA 重建问题（MutationObserver）

**根因**：DeepSeek 是 React SPA，切换会话时 textarea 被重建。旧的 DOM 引用失效 → 功能失效

**解决方案**：在每个持久功能中加 MutationObserver 监听 body 变化：

```typescript
// 适用于：auto-hide input、voice button、sidebar selected highlight
observer.observe(document.body, { childList: true, subtree: true });
```

检测 textarea 重建后重新初始化，带重试（4次 x 500ms）。

**涉及功能**：
- 输入框自动隐藏（`setupTextareaObserver`）
- 语音输入按钮（`setupVoiceObserver`）
- 侧边栏选中高亮（已在之前添加）

### 5. 语音输入 — Ctrl+M 快捷键

**额外逻辑**：按快捷键时先弹出隐藏的输入框，再启动录音

### 6. 滚动条隐藏 — 自定义滚动条

**根因**：DeepSeek 使用自定义 div 滚动条（`ds-scroll-area__vertical-bar`），原生 `::-webkit-scrollbar` CSS 管不了

**修复**：追加 `ds-scroll-area__vertical-bar`/`horizontal-bar`/`gutter` 的 `display: none`

### 7. 已思考区域白条（未完全解决）

**当前状态**：`_74c0879` 容器已正确着色，但用户反映仍看到白条。像素采样显示所有元素背景为 `transparent` 或 `chatBg`。遗留待查。

相关文件：`src/core/enhancer-features.ts`、`src/core/ui-panel.ts`
