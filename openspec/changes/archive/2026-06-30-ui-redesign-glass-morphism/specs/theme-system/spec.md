# Theme System

## Overview
CSS 变量驱动的深色/浅色双主题体系，用于面板和弹窗，跟随 DeepSeek 页面主题自动切换。

## Requirements

### R1: CSS 变量定义
在 `<head>` 中注入 `<style id="ds-panel-vars">`，包含两套变量：

**浅色**（默认）：
```
--panel-bg: rgba(255,255,255,0.92)
--panel-blur: blur(20px)
--panel-text: #1f2937
--panel-text-secondary: #6b7280
--panel-border: rgba(0,0,0,0.08)
--accent: #007AFF
--accent-secondary: #5E5CE6
--danger: #FF3B30
--card-bg: rgba(255,255,255,0.5)
--card-border: rgba(0,0,0,0.06)
--toggle-on: #007AFF
--toggle-off: rgba(0,0,0,0.2)
--toggle-knob: #fff
--input-bg: rgba(255,255,255,0.7)
--input-border: rgba(0,0,0,0.12)
--overlay-bg: rgba(0,0,0,0.3)
```

**深色**（检测到 `body.dark` 时切换）：
```
--panel-bg: rgba(0,0,0,0.88)
--panel-text: #e0e0e0
--panel-text-secondary: #a0a0b0
--panel-border: rgba(255,255,255,0.08)
--accent: #5E5CE6
--accent-secondary: #007AFF
--danger: #FF453A
--card-bg: rgba(255,255,255,0.08)
--card-border: rgba(255,255,255,0.06)
--toggle-on: #5E5CE6
--toggle-off: rgba(255,255,255,0.15)
--toggle-knob: #fff
--input-bg: rgba(255,255,255,0.1)
--input-border: rgba(255,255,255,0.12)
--overlay-bg: rgba(0,0,0,0.5)
```

### R2: 切换机制
- 面板 `<div.id="ds-mini-panel">` 添加 `.dark` class 即切换为深色变量
- 通过 MutationObserver 监听 `document.body.classList` 的 `dark` 变化
- 初始状态检测 `document.body.classList.contains('dark')`

### R3: 引用方式
面板 HTML 中全部通过 `var(--xxx)` 引用变量：
```css
background: var(--panel-bg);
color: var(--panel-text);
border: 1px solid var(--panel-border);
```
禁止直接写颜色值。

### R4: 变量作用域
- 变量在 `#ds-mini-panel` 上声明
- 弹窗在 `#ds-mini-modal` 上声明（与面板独立的实例）
- 触发器不需要 CSS 变量（仅两色状态）
