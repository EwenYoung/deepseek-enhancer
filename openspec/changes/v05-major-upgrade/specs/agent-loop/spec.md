## MODIFIED Requirements

### Requirement: Tool Result Submission
工具结果通过 MAIN world XHR 发送，而非 DOM 模拟。

#### Scenario: XHR Submission
- **WHEN** 工具执行完成且有成功结果
- **THEN** 结果文本通过 MAIN world `origSend.call()` 发送 XHR 请求到 `/api/v0/chat/completion`
- **AND** 请求体包含 `chat_session_id` 和 `model_type`
- **AND** 不经过 textarea/button DOM 操作

#### Scenario: SSE Response Parsing
- **WHEN** loop XHR 的 SSE 流返回
- **THEN** 解析响应文本，检测新的工具调用
- **AND** 如果有新工具调用 → 执行 → 再发送
- **AND** 如果没有 → 将最终文本注入到聊天 UI 中

#### Scenario: Loop Depth Limit
- **WHEN** 循环次数达到 10 次
- **THEN** 停止循环
- **AND** 已有内容展示给用户
