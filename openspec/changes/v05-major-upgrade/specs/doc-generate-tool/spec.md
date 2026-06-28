## ADDED Requirements

### Requirement: Document Generation Tool
模型可通过 `<doc_generate>` XML 标签触发文件下载。

#### Scenario: 生成 Markdown 文件
- **WHEN** 模型输出 `<doc_generate>{"title":"报告","format":"md","content":"# 报告\n内容..."}</doc_generate>`
- **THEN** 浏览器自动下载 `报告.md`
- **AND** 文件内容为 `# 报告\n内容...`

#### Scenario: 生成 HTML 文件
- **WHEN** 模型输出带 `"format":"html"` 的 doc_generate 调用
- **THEN** 浏览器下载 `.html` 文件
- **AND** HTML 包含基础样式（字体、排版、代码块）

#### Scenario: 内容过长时处理
- **WHEN** content 超过 50KB
- **THEN** 正常下载，不做截断
