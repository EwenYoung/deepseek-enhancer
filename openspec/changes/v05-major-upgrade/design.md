## Context

deepseek-enhancer 是一个 Chrome MV3 扩展，通过 WXT 框架构建。当前架构为三层运行时（MAIN world <script> 注入 → Isolated world content script → Background service worker）。Agent loop 依赖 DOM 模拟提交（填 textarea + 点击发送按钮）来递送工具结果。

用户对 5 个维度提出改进需求，其中静默循环涉及核心架构变更，其他 4 条线是增量增强。

## Goals / Non-Goals

**Goals:**
- Loop 中间步骤对用户不可见，只展示最终答案（或可选摘要条）
- 新增 1 个 tool（doc_generate）和 5 个 skills
- 面板重设计为分层卡片式
- 迁移油猴脚本的 5 个 UI 增强功能
- SSE 流式响应时实时显示 tok/s

**Non-Goals:**
- 不实现需要后端的 tools（shell_exec、python_exec、OfficeCLI）
- 不改变现有 Web Search / Web Fetch / News Hub 的底层实现
- 不实现精确 token 计数（需要 tokenizer）
- 不做 PDF 导出（HTML → 浏览器打印即可）

## Decisions

### 决策 1：静默循环 — 复用 XHR 发送而非 DOM 模拟

**选择**: MAIN world 直接 `origSend.call()` 发送带 session cookie 的 XHR 请求，解析 SSE 响应，检测到新工具调用则继续循环，检测到最终文本则回注到聊天流。

**备选**: 继续使用 DOM 模拟提交（textarea + click send），但跳过渲染中间过程。
**为什么选 XHR**: DOM 模拟的问题不仅是刷屏，更是不可靠（React 不响应、按钮找不到、Enter fallback 被拦截）。XHR 路径完全绕过这些。

**关键突破**: 之前的 429 是因为循环 XHR 缺少正确的请求头和 Cookie。现在用 `origSend.call(newXHR, body)` 复用了原始 XHR 的 Cookie jar，且加 1.5s 间隔避免限流。

### 决策 2：Token 速度 — 字符计数 × 估算系数

**选择**: 在 SSE progress handler 中累积字符数，用 `chars / elapsed_seconds × 0.35` 估算 tok/s。中英混合场景下 0.35 系数最接近实际。

**备选**: 加载一个轻量 tokenizer（如 tiktoken WASM）。太大（~3MB），不轻量。

### 决策 3：面板重设计 — 不重写，渐进重构

**选择**: 保留现有 panelEl 容器和 tab 拖拽逻辑，只替换 `buildPanelHTML()` 返回的 HTML 和对应的事件绑定。先改布局再改成卡片式。

### 决策 4：增强器功能 — CSS 层实现而非 JS 层

**选择**: 宽屏模式和背景色主题通过注入 `<style>` 元素 + `!important` 强制覆盖实现。主题跟随 `document.body.classList` 变化自动切换。

### 决策 5：Skills 扩展 — 纯 Prompt 实现

所有 8 个 skills 都是纯 instructions（Markdown 文本），不依赖外部 API 或工具。每个控制在 500-1500 字。

## Risks / Trade-offs

- **[静默循环] XHR 429 限流** → 复用 session cookie + 1.5s 间隔；超时重试一次；如果 DeepSeek 后端改了 model_type 验证则 fallback 到 DOM 模式
- **[静默循环] SSE 解析遗漏最终文本** → 双 buffer（文本 + 原始 data）确保检测覆盖；loop 上限 10 防止死循环
- **[语音输入] 浏览器兼容性** → Web Speech API 仅 Chrome/Edge 支持，Firefox 不可用。检测不到 API 时不显示按钮
- **[宽屏模式] CSS 覆盖冲突** → 用 `!important` + 高优先级选择器；DeepSeek 更新后类名可能变，需要定期维护
- **[Token 速度] 估算不准** → 显示为 `~tok/s` 带 `~` 前缀，用户知道是近似值

## Migration Plan

1. 代码合并后重建扩展（`npm run build` → `cp` 到 `D:\deepseek-enhancer`）
2. Chrome 扩展页移除旧版 → 重新加载新版
3. 用户无需额外配置——所有新功能默认行为与旧版兼容（Agent 模式默认关，静默循环在 Agent 模式开启时生效，宽屏等默认关）
