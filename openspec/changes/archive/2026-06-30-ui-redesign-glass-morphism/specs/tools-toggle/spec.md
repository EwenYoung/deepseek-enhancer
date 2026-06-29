# Tools Toggle

## Overview
Tools 区域每个工具增加开关功能，关闭的工具不在面板中显示或灰显，也不再注入到 DeepSeek 的系统提示词中。

## Requirements

### R1: Tools 开关 UI
- 每个 Tool 行右侧增加一个小型 iOS toggle 开关
- 关闭：工具行灰显（降低透明度），toggle 关闭色
- 开启：正常显示，toggle 开启色

### R2: 工具定义注入控制
- 关闭的工具不注入到 `main-xhr-inject.ts` 的 `TOOL_DEFS` 中
- 需要在 `content.ts` 中维护当前启用的工具列表
- 通过 `postMessage` 传递到 MAIN world

### R3: 存储
- 启用/禁用的工具状态存储在 `chrome.storage.local` 的 `ds_mini_tools_state` key 下
- 格式：`{ "web_search": true, "web_fetch": true, ... }`

### R4: 默认状态
- 所有工具默认开启
- 面板中 Agent 模式开关控制整体工具注入的开关（已有功能）
