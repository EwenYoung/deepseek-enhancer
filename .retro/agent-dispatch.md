# 子 agent 派发

## Agent 工具持续报 captcha verify failed 时直接内联执行，别反复重试

- **症状**：派发 subagent（review 任务）连续 5 次报 `captcha verify failed`，包括最小化测试任务、general-purpose 与 Explore 两种类型；用户切换子 agent 模型为 glm-5.3 后仍同样报错。
- **原因**：未知——错误来自派发后端，不在调用参数层面（Agent 工具参数不暴露模型项）。
- **解法**：同一错误重试一次确认非偶发即可，改为在主会话内联完成该工作（本次内联 review 正常交付）。若用户侧修复了派发配置可删本条。
- **置信度**：症状验证过，根因未验证
- **首次记录**：2026-08-24
