---
id: collapse-002
scope: src/core/ui-tool-blocks.ts, src/core/chat-exporter.ts
status: pending
depends-on: [collapse-001]
---

# collapse-002：联动清理（隐藏逻辑与导出适配）

## objective

折叠机制换成 CSS 裁剪后，清理两处旧的耦合：

1. `src/core/ui-tool-blocks.ts` 的 `hideRawToolCalls`（清空文本节点）——职责已被折叠接管，删除。
2. `src/core/chat-exporter.ts` 的 `extractRenderedReplyHTML` ——从「反解旧折叠条按钮文案」改为「直读新属性」。

## context

- `docs/notes/tool-call-collapse-research.md`
- `docs/plan/tool-call-collapse.md` 第 3 节
- `docs/CLEAN-CODE.md`

## 背景（现状）

`hideRawToolCalls`（`ui-tool-blocks.ts:442-457`）在 DOM 兜底路径把工具调用原文从文本节点里删掉，与 `ui-collapse.ts` 的折叠职责重叠。折叠改为 CSS 裁剪后，原文必须留在 DOM 里（否则导出与复制丢内容），该函数必须删除。

`chat-exporter.ts:627-654` 的 `extractRenderedReplyHTML` 依赖旧折叠条的形态：

```js
for (const el of clone.querySelectorAll('[data-ds-collapse]')) {
  const btnText = el.querySelector('button')?.textContent || '';
  const nameMatch = /工具调用\s*([A-Za-z0-9_]+)/.exec(btnText);
  ...
}
```

新折叠块不是 DOM 节点，而是加了属性的块级元素，且内部是**完整原文**（不是隐藏 `<pre>`）。

## 改动要求

### 1. 删除 `hideRawToolCalls`

- 删除函数本体与调用点（在 `processNewContent` 内）。
- **必须同步**：`processNewContent` 的跳过条件 `node.closest('[data-ds-collapse]')` 改为 `node.closest('[data-ds-fold]')`，保留 `.ds-mini-tool-block`。
  - 原因：新折叠块原文常驻 DOM，`[data-ds-collapse]` 对新形态完全无效，会被当作新内容重扫 → 重复执行工具调用。
- 删除后原文留在 DOM 中，`markLastAssistantProcessed` 与 `data-ds-tool-processed` 机制不变。

**已知风险（来自基线调查，需在交付说明中确认应对）**：

- 纯 `doc_generate` 消息（`execution: 'local'`）走 `handleMainWorldToolCalls` 时会在 `otherCalls.length === 0` 处提前 return，**拿不到 `data-ds-tool-processed` 标记**（`ui-tool-blocks.ts:230` 在 `:242` 之前）。删掉 `hideRawToolCalls` 后，这类消息只剩 `processedDocKeys` 去重（键含 `content.length`，流式增长会生成新键）。
- 请评估：是否需要在 `processNewContent` 或 local 分支补一道防重复（例如给已处理的块打 `data-ds-tool-processed`），或确认现有 `processedDocKeys` 足够。
- 若需补防重复，属本任务范围内，一并实现并测试。

### 2. 改造 `extractRenderedReplyHTML`

新形态：折叠块带 `data-ds-fold`，`data-ds-fold-label` 是文案，内部是完整原文。

导出要求（与缓存路径 `assistantRawToExport` 形态一致）：

- 折叠块 → 替换为 `🛠 工具调用：名称` 单行标记（名称从 `data-ds-fold-label` 提取，或从原文用 `extractToolCalls` 提取）。
- 代码块折叠 → 保留原文（代码块本来就该导出全文），只去掉标签行文案的干扰。
- 保留现有的 `display:none` 残留清理与空行内元素清理（折叠不再产生残留，但历史会话的旧 DOM 仍可能有）。
- 保留 `RENDERED_DOM_CHROME_SELECTOR` 装饰清理与 `sanitizeRenderedHTML`。

**注意**：`data-ds-fold-label` 属于属性，不在 `innerHTML` 里，不会污染导出；但 `::before` 伪元素内容也不会进 `innerHTML`，所以折叠态导出拿到的就是完整原文——必须显式替换，否则导出会带完整 XML。

### 3. 兼容旧会话

历史会话里可能存在旧形态 `[data-ds-collapse]`（自建折叠条 + 隐藏 `pre`）。请**保留**对它的兼容处理分支（反解按钮文案），与新形态分支并存，待用户确认历史会话全部重渲染后再删。加注释说明这是过渡兼容。

### 4. 测试可行性（基线调查结论）

`extractRenderedReplyHTML` 是模块内私有函数、未被导出，且测试环境是 `node` 无 jsdom，**当前零覆盖**。要覆盖本任务的导出行为，二选一：

- **首选**：把「折叠块 → 单行标记」的转换抽成**纯函数**（输入块文本或 `{label, text}`，输出标记字符串），放 `chat-exporter.ts` 或 `doc-generate.ts` 风格的纯逻辑模块，直接单测。
- 备选：给 `extractRenderedReplyHTML` 加 `export`，用仓库既有的手写 DOM 桩风格（见 `src/core/__tests__/style-guard.test.ts:3-38` 的 `FakeStyleEl`/`FakeHead`）构造最小 DOM。

按 CLEAN-CODE「prefer simplest design」，优先选纯函数抽取。

## path

- `src/core/ui-tool-blocks.ts`
- `src/core/chat-exporter.ts`
- `src/core/__tests__/chat-exporter.test.ts`

**不要动**：`ui-collapse.ts`（collapse-001 已交付）。

## verification

1. `pnpm test` 全绿。补充/更新测试：
   - 导出路径：折叠块（新属性形态）→ `🛠 工具调用：doc_generate`
   - 导出路径：同一消息多个工具调用 → 名称去重合并
   - 导出路径：代码块折叠 → 原文完整保留
   - 旧形态 `[data-ds-collapse]` 兼容分支仍可用
2. `pnpm typecheck`、`pnpm lint` 通过。
3. `pnpm build` 成功。

## 交付说明

报告：删了哪些代码、导出行为前后对比、测试结果、残留风险（尤其是「工具调用被重复执行」的回归验证方式）。
