## MODIFIED Requirements

### Requirement: Expanded Skill Library
内置技能从 3 个扩展到 8 个。

#### Scenario: New Skills Available
- **WHEN** 用户输入 `/` 触发自动补全
- **THEN** 下拉列表包含以下新增技能：
  - `/article-writer` — 结构化长文写作
  - `/translator` — 多语翻译保持风格
  - `/researcher` — 多源搜索交叉验证综述
  - `/code-assistant` — 代码生成解释 debug 重构
  - `/summarizer` — 长文摘要多种风格

#### Scenario: Existing Skills Unchanged
- **WHEN** 用户使用 `/ultra-think`、`/code-review`、`/writer`
- **THEN** 行为与之前完全一致

### Requirement: Skill Instructions Enhancement
每个技能的 instructions 保持精炼（500-1500 字）。

#### Scenario: Controlled Instructions Size
- **WHEN** 技能被注入到 prompt
- **THEN** instructions 不超过 1500 字符
- **AND** 聚焦于给模型的思考框架，不是大段规则
