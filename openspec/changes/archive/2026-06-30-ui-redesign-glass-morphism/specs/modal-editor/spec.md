# Modal Editor

## Overview
页面中央弹出的大弹窗系统，用于新建/编辑 skill 以及确认删除操作。

## Requirements

### R1: 编辑弹窗
- `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)`
- 尺寸 700x600px，`z-index: 999999`
- 玻璃风格，与面板视觉统一（`backdrop-filter: blur(20px)`）
- 标题：新建时显示「新建 Skill」，编辑时显示「编辑 Skill」

### R2: 表单字段
- 名称：单行 input，必填
- 描述：单行 input，可选
- 提示词内容：大面积 textarea，面积占弹窗主体

### R3: 操作按钮
- 「保存」按钮：蓝色 `#007AFF`，保存成功关闭弹窗并刷新技能列表
- 「取消」按钮：透明边框，点击关闭弹窗
- 快捷键 `Ctrl+Enter` 或 `Cmd+Enter` 保存

### R4: 遮罩层
- 全屏半透明：`rgba(0,0,0,0.5)` + `backdrop-filter: blur(4px)`
- `z-index: 999998`（在弹窗下方）
- 点击遮罩层关闭弹窗

### R5: 确认删除弹窗
- 小弹窗 360x180px，居中显示
- 标题：「确认删除」
- 内容：「确定删除 "skill名"？此操作不可撤销。」
- 操作按钮：「取消」（透明边框）和「删除」（红色 `#FF3B30`）

### R6: 共享资源
- 两个弹窗共用一个遮罩层
- 同一时间只能显示一个弹窗
