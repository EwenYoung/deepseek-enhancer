# Panel Opacity Slider

## Overview
在设置面板中增加一个透明度滑杆，让用户可以自主调整控制面板（含弹窗）的透明度。

## Requirements

### R1: 滑杆位置
- 放在设置区「增强功能」页面的最底部
- 显示为：标签「面板透明度」+ 滑杆 + 当前百分比数字

### R2: 滑杆范围
- 最小 10%（几乎透明），最大 100%（完全不透明）
- 默认值 100%
- 步进 5%

### R3: 深色/浅色独立存储
- 浅色模式透明度：存储在 `chrome.storage.local` 的 `ds_panel_opacity_light`
- 深色模式透明度：存储在 `chrome.storage.local` 的 `ds_panel_opacity_dark`
- 切换深色/浅色模式时自动切换对应的透明度值

### R4: 生效范围
- 滑杆改变透明度时，实时更新面板背景 `var(--panel-bg)` 的 alpha 通道
- 弹窗 Modal（编辑/删除）也跟着变化
- opacity 值只影响 alpha 通道，不影响文字和其他元素

### R5: 状态持久化
- 刷新页面后保持上次设置的透明度
- 跟随 `chrome.storage.local` 中存储的值
