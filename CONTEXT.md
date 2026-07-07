# deepseek-enhancer

一个浏览器扩展，增强 chat.deepseek.com 的交互体验：工具调用、技能管理、主题定制、UI 增强。

## 语言

### 架构层

**主世界层** (MAIN World)：
通过 `<script>` 注入到页面中的执行层，负责 XHR 拦截、prompt 增强、SSE 流解析。
_Avoid_: 主世界脚本、注入脚本

**隔离世界层** (Isolated World)：
以 content script 运行的隔离层，负责 UI 管理、工具执行、事件协调。
_Avoid_: 内容脚本、Isolated script

**后台** (Background)：
Service Worker，负责 API 代理（Tavily 搜索等）。
_Avoid_: 后台脚本、Service Worker 层

### 核心机制

**拦截** (Hook)：
对 XMLHttpRequest 和 Fetch 的 `send`/`open` 进行拦截，获取请求体并准备增强。
_Avoid_: 劫持、注入点

**增强** (Augment)：
在拦截到的请求体中插入工具定义和技能指令，构建增强后的上下文。
_Avoid_: 注入、Inject

**上下文构建** (Context Building)：
将工具定义和技能指令拼装为可插入的文本前缀。
_Avoid_: 上下文注入

### 核心概念

**工具** (Tool)：
模型可调用的外部能力，由 `ToolDescriptor` 定义其名称、描述和参数 schema。执行时调用 Tavily API 或 Web Fetch。
_Avoid_: 插件、函数

**技能** (Skill)：
用户自定义的 system prompt 片段，通过 `/skillname` 触发注入到对话上下文中。
_Avoid_: 预设、模板

**agent 模式** (Agent Mode)：
扩展中控制是否向模型注入工具定义和技能指令的开关。
_Avoid_: AI 模式、智能模式

**扩展增强** (Extension Enhancer)：
扩展提供的所有 UI 增强功能的总称，包括主题、字体、宽屏、输入框行为等。
_Avoid_: 增强功能、UI 增强

### UI 组件

**面板** (Panel)：
从页面右侧滑出的管理面板，包含设置、技能 CRUD、导出等操作。
_Avoid_: 侧边栏、浮窗

**工具结果块** (Tool Blocks)：
工具调用执行结果的 UI 渲染块，显示从 loading 到结果的状态变化。
_Avoid_: 工具卡片、结果栏

**自动补全** (Autocomplete)：
输入 `/` 时弹出的技能/命令选择下拉框。
_Avoid_: 下拉菜单、弹出框

**分类** (Categories)：
会话的分类管理系统，支持批量分类、拖拽整理。
_Avoid_: 分组、标签

**产出物** (Artifacts)：
模型回复中可下载的产物（代码文件等），扩展自动添加下载按钮。
_Avoid_: 附件、产物

**主题** (Theme)：
扩展的深色/浅色主题系统，支持跟随系统和自定义主题。
_Avoid_: 皮肤、配色方案

### 数据处理

**SSE** (Server-Sent Events)：
DeepSeek 流式响应的解析机制，从数据流中提取文本块和工具调用标记。
_Avoid_: 流、Event Stream

**配置存储** (Config Storage)：
扩展的持久化配置，存储在 `chrome.storage.local` 中，包括主题设置、字体偏好、技能列表等。
_Avoid_: 设置存储、本地存储

**技能注册表** (Skill Registry)：
技能的存储和查询模块，负责技能的 CRUD 和按名称匹配。
_Avoid_: 技能仓库、技能表
