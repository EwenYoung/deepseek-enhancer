## ADDED Requirements

### Requirement: Real-Time Token Speed
SSE 流式响应时实时显示每秒 token 估算值。

#### Scenario: 正常流式响应
- **WHEN** 模型开始流式输出
- **THEN** 输入框上方出现 `~XX tok/s` 标签
- **AND** 速度每 500ms 更新一次

#### Scenario: 流式响应完成
- **WHEN** 模型 SSE 流结束（`[DONE]` 或 `status: FINISHED`）
- **THEN** 速度标签显示最终平均速度 → 2 秒后渐隐消失

#### Scenario: 速度计算
- **WHEN** SSE 数据到达
- **THEN** 累积字符数 / 已用秒数 × 0.35 = 估算 tok/s
- **AND** 标签显示为 `~XX tok/s`（`~` 表示近似值）

### Requirement: Token Speed Display Position
速度标签固定在输入框区域附近。

#### Scenario: 位置
- **WHEN** 速度标签渲染
- **THEN** 标签位于输入框上方或右下角
- **AND** `position: fixed` 确保不随聊天滚动而移动
- **AND** `pointer-events: none` 确保不阻挡输入
