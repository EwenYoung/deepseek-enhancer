## ADDED Requirements

### Requirement: Card-Based Layout
面板采用分层卡片式布局。

#### Scenario: 信息层级
- **WHEN** 用户打开 ⚡ 面板
- **THEN** 第一层显示 Agent 模式开关（最重要）
- **AND** 第二层显示可用 Tools（卡片网格）
- **AND** 第三层显示 Skills 列表
- **AND** 第四层显示导出按钮
- **AND** 第五层显示设置（API Key 等）

### Requirement: Tool Cards Display
工具以卡片网格形式展示。

#### Scenario: Tool 卡片展示
- **WHEN** 面板 Tools 区域渲染
- **THEN** 每个工具显示为小卡片（名称 + 图标 + 简短说明）
- **AND** 卡片网格为 2 列布局
- **AND** Agent 模式关闭时卡片呈灰色（禁用态）

### Requirement: Settings Section
API Key 配置项移到独立的设置区。

#### Scenario: 设置区展示
- **WHEN** 面板 Settings 区域渲染
- **THEN** 显示 Tavily API Key 输入框 + 状态标签 + 测试按钮
- **AND** 默认折叠，点击展开
