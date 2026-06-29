---
name: autocomplete-fix-and-sort
description: "Autocomplete下拉列表bug修复（高亮消失、不翻页、不联想）+ Skill排序"
metadata:
  type: reference
  tags: [autocomplete, debug, ui]
---

## Skills Autocomplete 修复复盘

### 问题列表

| # | 问题 | 浅色/深色 | 根因 |
|---|------|-----------|------|
| 1 | 键入 `/` 不弹出列表 | 都有 | `buildDropdownItems()` 中使用了父函数局部变量 `wrap`，提取后变成 undefined → JS 异常崩溃 |
| 2 | 方向键后高亮消失 | 浅色 | `ignoreNextInput` 单次布尔值只能跳过 1 个 input 事件，浅色模式下 React 触发 >= 2 个 → 第二个 input 执行 `selectedIndex = 0` |
| 3 | 方向键后高亮消失 | 深色 | 同上根因，但深色模式下 React 行为不同，触发频率低所以好一些 |
| 4 | 方向键无效 | 深色 | `e.target !== boundInput` 在 React capture phase 中不匹配 → 整个 `onKeyDown` 被跳过 |
| 5 | 首字母不联想 | 都有 | `showDropdown` 复用已有 `dropdownEl` 时只更新位置不重建内容 → `matchSkills` 返回新列表但显示的是旧的 |
| 6 | 一直 ↓ 不翻页 | 都有 | `updateSelection` 只改背景色，没有 `scrollIntoView` |

### 修复方案

#### 1. `ignoreNextInput` → `ignoreInputUntil` 时间窗口
```typescript
// 旧：单次跳过，只能拦一个input
ignoreNextInput = true;
// 新：200ms 时间窗口，拦所有input
ignoreInputUntil = Date.now() + 200;
```

#### 2. `selectedIndex = 0` → 钳位
```typescript
// 旧：每次 input 重置为 0，被ignore后的input会覆盖箭头键
selectedIndex = 0;
// 新：钳位到有效范围，保留箭头键的改动
selectedIndex = Math.min(selectedIndex, currentMatches.length - 1);
```

#### 3. 复用 dropdown 时重建内容
```typescript
// 之前：复用路径直接 return，不更新列表
// 之后：innerHTML = '' + buildDropdownItems() + updateSelection()
```

#### 4. 去掉 `onKeyDown` 的 `e.target` 守卫
直接检查 `dropdownEl` 存在就处理方向键，不再校验 `e.target`。

#### 5. `updateSelection` 中加 `scrollIntoView`
```typescript
if (i === selectedIndex) item.scrollIntoView({ block: 'nearest' });
```

### Skills 排序
- 在 `loadSkills()` 最后加 `.sort((a,b) => a.name.localeCompare(b.name))`
- 影响范围：面板列表 + autocomplete 下拉 + 所有展示位置
- 方式A（源头排序）优于方式B（展示排序），因为一致性更好

### 教训
1. **提取函数时必须检查局部变量引用** — `wrap` 变成 `undefined` 导致整个功能静默崩溃
2. **`ignoreNextInput` 布尔值脆弱** — 时间窗口更可靠
3. **`selectedIndex = 0` 破坏箭头键状态** — 改成钳位
4. **两组色值不统一导致状态差异** — 同一功能在浅色/深色下行为不同，永远是 React 事件系统的差异，不可能是 CSS

相关文件：`src/core/ui-autocomplete.ts`、`src/core/skill-registry.ts`
