---
name: wide-mode-right-overflow
description: "宽屏模式右侧贴框问题的根因、调试历程和最终修复方案"
metadata:
  type: reference
  tags: [css, flexbox, debug, wide-mode]
---

## 问题

DeepSeek 宽屏模式下，聊天内容右侧边缘贴到浏览器窗口边框，左右不对称。

## 根因

**`chatPanel` 被 `flex: 1 1 auto !important` + `max-width: none` 撑开，宽度超过了浏览器窗口。所有子容器的 `padding-right` 落在视口不可见区域。**

诊断数据：chatPanel right edge = 1136px > window.innerWidth = 1093px

## 最终修复

```typescript
// ❌ 错误：强制撑开
chatPanel.style.setProperty('max-width', 'none', 'important');

// ✅ 正确：不设固定宽度，让 flexbox 自然分配
chatPanel.style.removeProperty('max-width');
```

同时删除所有多余的宽度约束（`flexRow.width = '100%'`、`chatPanel.width = 'auto'`、`.ds-message { overflow-x: clip }`），**只保留 padding 清理和 textarea 宽度**。

## 调试教训

1. **诊断从子到父追溯**：子元素溢出 → 先查父链是否超窗口，不要只修子元素
2. **"右侧贴框" = "容器超窗口"**：先确认容器边界在视口内，再调间距
3. **flex 子项加 `max-width: 100%` 兜底**：`flex: 1 1 auto` 可能撑出预期
4. **一次只改一处假设**：输出前用诊断脚本验证该处修改是否生效
5. **先查自己注入了什么 JS 样式**：DevTools → element.style
6. **正确的修复往往是删除，不是叠加**：5 层覆盖无效时，退一步考虑删掉错误的约束

相关文件：`src/core/enhancer-features.ts` → `toggleWideScreen()`

---

## 宽屏表格滚动条缺失问题

### 问题

宽屏模式下，宽表格的横向滚动条消失，表格右侧内容被截断不可见。

### 根因

**DeepSeek 的 CSS-in-JS 给 `.ds-scroll-area` 设了固定宽度（1425px），超过父容器 `.ds-markdown` 的约束。`overflow-x: auto` 存在但不触发，因为表格内容宽度 ≤ 1425px。**

诊断关键数据：
```
.ds-markdown 宽度: < 1200px ✅ 已正确受父容器约束
.ds-scroll-area 宽度: 1425px ❌ CSS-in-JS 固定值，跳过了 .ds-markdown 约束
```

### 错误尝试

| # | 方案 | 结果 | 原因 |
|---|------|------|------|
| 1 | `.ds-markdown { overflow-x: auto }` | ❌ 滚动条在底部 | 滚动条在 markdown 容器底部而非表格下方 |
| 2 | `ds-scroll-area { max-width: 100% }` | ❌ 无效 | 父链 `100%` = 1425px，等于没约束 |
| 3 | `ds-scroll-area { max-width: calc(100vw - 80px) }` | ❌ 影响页面滚动 | 选择器太宽泛，命中主消息列表纵向滚动条 |
| 4 | `.ds-markdown:has(table) { max-width: calc(100vw - 80px) }` | ❌ 无效果 | CSS-in-JS 直接设 scoll-area 宽度，约束 markdown 没用 |
| 5 | `.ds-assistant-message-main-content { max-width: calc(100vw - 80px) }` | ❌ 约束未收紧 | 当前宽度 < max-width，约束不生效 |
| 6 | `.ds-scroll-area { max-width: calc(100vw - 250px) }` | ⚠️ 有滚动条但偏移 | 魔数约束，左侧不对齐，不同表格表现不一致 |

### 最终修复

```typescript
/* 直接约束 scroll-area 到父级宽度，覆盖 CSS-in-JS 固定宽 */
#root .ds-markdown .ds-scroll-area {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-x: auto !important;
  margin-left: 0 !important;
  padding-left: 0 !important;
}
```

修复后布局链：
```
.ds-message → .ds-assistant-message-main-content [flex 控制宽度]
  → .ds-markdown [继承父级，< 1200px]
    → .ds-scroll-area [width: 100% = markdown 宽度] ✅
      → <table> [如果 > 父级 → overflow-x: auto 触发]
```

### 关键教训

1. **CSS-in-JS 可能在任意层级设固定宽度** — 不要假设问题只发生在你关注的那一层。`ds-markdown` 宽度正常不代表 `ds-scroll-area` 也正常。诊断时要查每个相关层级的 computed style。
2. **`vw` 方案是伪修复** — `calc(100vw - X)` 不跟随侧边栏切换，且依赖魔数。正确的做法是让 flex 布局自然控制宽度。
3. **`:has(table)` 的局限性** — 低版本浏览器不支持，且 DeepSeek 渲染不一定用 `<table>` 标签。尽量用无条件选择器 + 精确层级定位。
4. **滚动条相关的选择器必须精确限定** — `.ds-scroll-area` 同时是消息列表纵向滚动容器，宽泛选择器会破坏页面主滚动条。用 `.ds-markdown .ds-scroll-area` 限定在 markdown 内部。
5. **定位 DOM 结构优先于猜** — 花 2 分钟跑诊断确认 `.ds-markdown` 和 `.ds-scroll-area` 的宽度来源，比尝试 6 种方案节省时间。

相关文件：`src/core/enhancer-features.ts` → `toggleWideScreen()`
