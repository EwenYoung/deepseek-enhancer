# Glass Panel

## Overview
玻璃毛玻璃浮层面板的整体布局、触发器、动画和基本交互。

## Requirements

### R1: 面板样式
- 宽度 340px，高度 `calc(100vh - 24px)`
- `position: fixed; right: 12px; top: 12px`
- 圆角 16px，`backdrop-filter: blur(20px)`
- 由 CSS 变量驱动：`--panel-bg`、`--panel-text`、`--panel-border`、`--accent`
- 面板滑入动画 0.25s `ease-out`

### R2: 右下角触发器
- 28x28px 圆点，`bottom: 16px; right: 16px`
- 图标 `✦`，`#007AFF` 蓝色 + `box-shadow: 0 0 8px #007AFF`
- Agent 开启时变青色 `#5E5CE6` + `box-shadow: 0 0 8px #5E5CE6`
- hover 扩展显示文字标签「DeepSeek Enhancer」（0.2s 动画）
- 不支持拖拽

### R3: 面板布局（从上到下）
1. 标题栏：图标 + 标题「DeepSeek Enhancer」+ 关闭按钮
2. Agent 模式：图标 + 文字 + toggle 开关
3. Tools 列表：1 列竖向排列
4. 导出按钮：MD / HTML 两个按钮
5. Skills 列表（可滚动，flex:1）
6. 设置区（底部固定，分页 tab）

### R4: 开关控件
- iOS 风格 toggle，宽 44px，高 24px
- 开启色 `var(--toggle-on)`，关闭色 `var(--toggle-off)`
- 切换动画 0.2s
- 用于 Agent 模式和增强功能所有开关

### R5: 动画
- 面板滑入/隐藏：0.25s ease-out
- 开关切换：0.2s
- hover 状态：0.15s
- 触发器标签展开：0.2s
- 尊重 `prefers-reduced-motion`
