# deepseek-enhancer

一个浏览器扩展，增强 chat.deepseek.com 的交互体验：工具调用、技能管理、主题定制、UI 增强。

## 维护

本术语表是**长期维护的事实源**：概念的新增、重命名、含义变化都登记在这里，代码、文档、行文一律以本表用词为准。

- 每完成一次涉及领域概念的任务后回查本表：出现了新概念就补录、重命名就同步、定义过时了就更新。
- 条目格式与现存条目一致：**正式名** (English) + 一句话定义 + `_Avoid_: ` 标明被弃用的旧说法。
- 新概念一旦写入代码或文档，就必须先在本表登记；删除条目前确认它不再出现在代码与文档中。

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

**构建 seam** (Build Seam)：
MAIN 层注入脚本的构建期生成机制：`main-world.content.ts` 注入时用 `replaceAll` 替换 `__DS_TOOL_NAMES_REGEX__` / `__DS_TOOL_DEFS__` 占位符，工具定义 JSON 由 `buildToolDefsJson()` 从 `TOOL_DESCRIPTORS` 事实源生成。铁律：源文件任何位置（含注释）不得出现占位符字面量——`replaceAll` 会连带替换，曾致运行时 `JSON.parse` 抛错、IIFE 中断。
_Avoid_: 占位符注入、模板替换

**主题染色** (Theme Tinting)：
非默认主题激活时的背景/品牌色染色体系：wash 规则强制 chatpanel 背景，data-ds-chatpanel/data-ds-sidebar 布局标记提供作用域锚点，data-ds-no-bg 排除标记使输入框等区域豁免。
_Avoid_: 毯子规则、背景覆盖

**样式守卫** (Style Guard)：
扩展注入样式的一致性维护机制：activeStyles 注册表记录生效规则，reassertStyles 将标签按"theme 最先"归位到 head 末尾（顺序不变量），head 守卫在标签被页面移除时重建。
_Avoid_: 样式监控、标签守卫

### 核心概念

**工具** (Tool)：
模型可调用的外部能力，由 `TOOL_DESCRIPTORS`（唯一事实源）定义名称、描述、参数 schema 和执行位置。按 `execution` 字段分派：`background` 工具经 Background 代理（Tavily 搜索/网页抓取等），`local` 工具在 Isolated 本地执行（doc_generate）。
_Avoid_: 插件、函数

**工具执行器** (Tool Executor)：
Isolated 层把 `background` 工具的执行委托给 Background 的通道（`tool-executor.ts` → `EXECUTE_TOOL` 消息），Background 按 `BACKGROUND_TOOLS` 白名单前置校验后分派；`local` 工具（doc_generate）不经过此通道，在 Isolated 直接处理。
_Avoid_: 执行通道、工具调度

**技能** (Skill)：
用户自定义的 system prompt 片段，通过 `/skillname` 触发注入到对话上下文中。
_Avoid_: 预设、模板

**agent 模式** (Agent Mode)：
扩展中控制是否向模型注入工具定义和技能指令的开关。
_Avoid_: AI 模式、智能模式

**Agent 循环** (Agent Loop)：
Agent 模式下模型多步调用工具直至完成任务的执行循环：MAIN 检出工具标记 → postMessage → Isolated 执行 → 结果回注 prompt → 新 XHR → 下一轮，直到模型输出 `<task_complete>` 或自然回复。状态由 `loop-state.ts` 维护（深度/停止标记/阶段），并发防护用 `toolExecutionInProgress` + `data-ds-tool-processed`。
_Avoid_: 工具循环、多步循环

**扩展增强** (Extension Enhancer)：
扩展提供的所有 UI 增强功能的总称，包括主题、正文样式、字体、宽屏、输入框行为等。
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

**正文样式** (Markdown Styles)：
助手回复正文的样式规则族：正文排版（mdTypo，手动开关）与代码精修、正文配色（随非默认主题自动启停，精修先于配色应用）。
_Avoid_: 正文美化、内容样式

### 数据处理

**SSE** (Server-Sent Events)：
DeepSeek 流式响应的解析机制，从数据流中提取文本块和工具调用标记。
_Avoid_: 流、Event Stream

**配置存储** (Config Storage)：
扩展的持久化配置，存储在 `chrome.storage.local` 中，包括主题设置、字体偏好、技能列表等。
_Avoid_: 设置存储、本地存储

**配置所有者** (Config Owner)：
配置项的所有权模式：每个配置模块（`panel-config.ts` / `agent-mode.ts` / `tavily-key.ts`）私有持有自己的 storage key 并暴露读写 API，消费方一律经 API 访问、不裸读 key；`data-backup.ts` 从各 owner 聚合 `backupDefaults` 做导出/导入。参考：`skill-registry.ts`。
_Avoid_: 配置模块、存储封装

**技能注册表** (Skill Registry)：
技能的存储和查询模块，负责技能的 CRUD 和按名称匹配。
_Avoid_: 技能仓库、技能表
