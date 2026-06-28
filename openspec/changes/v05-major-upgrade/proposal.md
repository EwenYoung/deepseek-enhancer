## Why

deepseek-enhancer 当前 v0.1 版本的功能骨架已就绪（4 tools + 3 skills + Agent loop + 导出），但用户体验和功能完整性存在明显短板：Agent loop 中间过程刷屏、搜索结果不可靠、技能太少且单薄、面板布局混乱。用户需要一个功能完备的轻量 Agent，专注于文字性任务和文档产出。本变更是一次全栈升级，覆盖核心循环、功能生态、UI 体验三个维度。

## What Changes

- **静默循环**：Agent loop 中间步骤不再通过 textarea 提交到聊天流，改为 MAIN world 直接 XHR 发送工具结果并解析 SSE 响应。用户只看到"提问 → (可选的摘要条) → 最终回答"
- **Tools 扩展**：新增 `doc_generate`（Markdown 内容触发生成可下载文件），保留现有的 4 个工具
- **Skills 扩展**：从 3 个扩展到 8 个，新增 `/article-writer`、`/translator`、`/researcher`、`/code-assistant`、`/summarizer`
- **面板重设计**：从堆砌式改为分层卡片式布局，Agent 开关提到顶部，Tools 用卡片网格展示，API Key 收到设置区
- **增强器功能迁移**：从油猴脚本迁移 5 个功能——宽屏模式、背景色主题（5 套亮色 + 5 套暗色，自动跟随 DeepSeek 主题）、滚动条隐藏、输入框自动隐藏、语音输入（Web Speech API）
- **Token 速度显示**：在输入框附近显示实时 tok/s 估算值，通过 SSE 字符计数 ÷ 耗时 × 语言系数（中英混合 ≈ 0.35）实现

## Capabilities

### New Capabilities
- `silent-loop`: Agent 循环在后台静默运行，中间过程不渲染到聊天流。支持可选的 Loop 摘要条
- `doc-generate-tool`: 模型输出 `<doc_generate>` XML 标签时，插件自动触发文件下载（Markdown/HTML）
- `panel-redesign`: 面板从堆砌式改为分层卡片式，Agent 开关置顶
- `enhancer-features`: 宽屏模式、背景色主题、滚动条隐藏、输入框自动隐藏、语音输入
- `token-speed-display`: SSE 流式响应时，实时估算并显示 tok/s

### Modified Capabilities
- `agent-loop`: Loop 机制从 DOM 模拟提交改为 MAIN world 直接 XHR 递送工具结果（BREAKING）
- `skills-system`: 从 3 个内置技能扩展到 8 个
- `tools-system`: 从 4 个工具扩展到 5 个（新增 doc_generate）

## Impact

- **`src/core/main-xhr-inject.ts`**：新增静默循环的 XHR 发送逻辑、token 速度统计
- **`src/core/ui-tool-blocks.ts`**：精简工具调用 UI（静默模式下不展示中间过程）
- **`src/core/ui-panel.ts`**：面板完全重写（卡片式布局 + 增强器设置项）
- **`src/core/skill-builtin.ts`**：新增 5 个技能定义
- **`src/core/tool-descriptors.ts`**：新增 doc_generate 定义
- **`src/entrypoints/background.ts`**：新增 doc_generate 处理（文件内容→Blob→触发下载）
- **`src/entrypoints/content.ts`**：新增 token 速度标签、语音输入绑定
- **新增 CSS/HTML**：主题样式表、宽屏覆盖样式、token 速度标签样式
