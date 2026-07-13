# Message Chain Visibility — Map

**Effort:** message-chain-visibility
**Branch:** TBD (extends `feat/pow-silent-loop`)
**Spec:** `docs/specs/message-chain-visibility.md`
**Source:** `docs/deepseek-pp-message-chain-analysis.md`

## Decisions

- **续接 prompt 改回 DOM submit**: 不用 raw XHR，填 textarea + 点 send，页面自然渲染 → DOM 包含所有轮次
- **保留 raw XHR fallback**: DOM submit 失败时回退
- **删除 PoW 相关代码**: DOM submit 路径不需要手动 PoW
- **导出时清理**: 不从 API 层劫持历史，导出时替换 XML

## Fog

- DOM submit 的可靠性需要实测（textarea/send button 选择器是否稳定）
- 续接消息隐藏可能有一帧闪烁（display:none 在 MutationObserver 处理前）
- 大段 tool result 填充 textarea 可能有 React 事件问题
