## MODIFIED Requirements

### Requirement: New Document Generation Tool
工具列表从 4 个扩展到 5 个，新增 `doc_generate`。

#### Scenario: Tool Registration
- **WHEN** 插件初始化
- **THEN** 工具列表包含 `web_search`、`web_fetch`、`news_hub`、`github_trending`、`doc_generate`

#### Scenario: doc_generate in Prompt
- **WHEN** Agent 模式开启
- **THEN** 注入 prompt 的 tool definitions 包含 doc_generate 说明
- **AND** 格式示例：`<doc_generate>{"title":"报告","format":"md","content":"..."}</doc_generate>`

#### Scenario: No API Key Required
- **WHEN** 用户未配置 Tavily API Key
- **THEN** `web_search` / `web_fetch` 返回提示
- **AND** `doc_generate`、`news_hub`、`github_trending` 仍可正常使用（不需要 API Key）

### Requirement: doc_generate Execution
doc_generate 在 isolated world 中触发下载。

#### Scenario: File Download
- **WHEN** 检测到 `<doc_generate>` 调用
- **THEN** isolated world 创建 Blob → URL.createObjectURL → `<a download>` → 自动触发下载
- **AND** 不需要经过 background service worker
