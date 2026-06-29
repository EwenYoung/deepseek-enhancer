## ADDED Requirements

### Requirement: Silent Tool Execution
Agent loop 工具调用在后台静默执行，中间结果不渲染到聊天流。

#### Scenario: 单工具调用在后台完成
- **WHEN** 用户发送需要联网搜索的 Prompt
- **AND** 模型输出 `<web_search>{"query":"..."}</web_search>`
- **THEN** 插件拦截标签 → background 执行 Tavily 搜索
- **AND** 搜索结果通过 MAIN world XHR 直接发送给 DeepSeek（不填 textarea）
- **AND** 用户聊天界面不出现中间工具结果消息

#### Scenario: 多工具调用逐个递送
- **WHEN** 模型同时输出多个工具调用 XML 标签
- **THEN** 每个工具调用被提取并按顺序执行
- **AND** 每个结果单独通过 XHR 发送
- **AND** 最后一个结果发送后等待模型输出最终回答

### Requirement: Loop Summary (Optional)
用户可选择显示 Loop 执行摘要而非完全静默。

#### Scenario: 启用 Loop 摘要
- **WHEN** Agent 模式开启且 Loop 摘要开关打开
- **THEN** 最终回答上方显示摘要条：「🔧 Agent 执行了 N 个工具调用：web_search ···, web_fetch ···」
- **AND** 不显示每个工具的完整结果内容

#### Scenario: 禁用 Loop 摘要（默认）
- **WHEN** Loop 摘要开关关闭
- **THEN** 用户只看到最终回答，没有中间过程

### Requirement: Fallback to DOM Mode
当 XHR 路径不可用时自动降级。

#### Scenario: XHR 429 限流
- **WHEN** MAIN world XHR 返回 HTTP 429
- **THEN** 等待 1.5s 后重试一次
- **AND** 如果仍失败，切换为 DOM 提交模式

#### Scenario: Loop 上限
- **WHEN** 循环次数达到 10 次
- **THEN** 停止循环
- **AND** 将已有结果展示给用户
