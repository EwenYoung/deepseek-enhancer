# 会话导出（chat-exporter）

## 助手回复导出是双数据源：缓存只覆盖本页会话，历史会话必须走已渲染 DOM

- **症状**：HTML 导出里助手回复的 markdown 全部原样文本（无标题/粗体/代码块），正文还混着「css复制下载」按钮文字和「-1」引用角标；同一功能在「刚生成完回复就导出」时正常。
- **原因**：`scrapeMessages` 优先读 `#ds-mini-asst-raw` 缓存的原始 markdown，但该缓存由 SSE 拦截写入，**只覆盖当前页面会话中实时生成的回复**；打开历史会话时缓存为空，回退到 `replyEl.textContent`——那是页面已渲染的纯文本，markdown 语法已丢失，且把工具栏按钮、引用角标的文字一起抓了进来。渲染器再强也无 markdown 可渲染。
- **解法**：历史路径不用 `textContent`，用 `extractRenderedReplyHTML`：克隆 `.ds-assistant-message-main-content` → 删装饰 → `sanitizeRenderedHTML` 白名单净化 → 作为 `renderedHTML` 直接进气泡。判断哪条路径：消息上有无 `renderedHTML` 字段（缓存命中走 markdown 渲染，输出更干净）。任何「需要原始 markdown」的新功能都要意识到历史会话根本没有原始文本。
- **置信度**：验证过（真实历史会话端到端实测：标题 0→34、代码块 0→22、装饰文本清零）
- **首次记录**：2026-08-24
- 已升级至 AGENTS.md

## 已渲染回复 DOM 结构（2026-08-24 实测）

- **症状**：要从已渲染回复里剥装饰时不知道删什么；引用角标不是 `<sup>`，工具栏按钮不是 `<button>`。
- **原因**：DeepSeek 用自研组件渲染 markdown，装饰元素挂稳定前缀类/role，正文反而是真实 HTML 标签。
- **解法**（探测自真实页面，装饰选择器= `.md-code-block-banner-wrap, .ds-markdown-cite, svg, button, [role=button]`）：
  - 代码块：`div.md-code-block` > `div.md-code-block-banner-wrap`（工具栏：语言标签 + 复制/下载 `div.ds-button[role=button]`）+ `pre`（内含 `span.token.*` 高亮 span，净化时解包即可）
  - 引用角标：`span.ds-markdown-cite`，内含 `opacity:0` 的隐藏 `-` 和绝对定位的序号，整个删除
  - 正文：真实 `h1`~`h6` / `p.ds-markdown-paragraph` / `strong` / `code` / `ul`/`ol`/`li` / `table` / `a` / `hr`，白名单保留即可
- **置信度**：验证过（哈希类以外的类名按「哈希类名会变」原则，失效需重新探测）
- **首次记录**：2026-08-24
