---
id: collapse-001
scope: src/core/ui-collapse.ts
status: ready
depends-on: []
---

# collapse-001：重写折叠机制为 CSS 裁剪

## objective

把 `src/core/ui-collapse.ts` 从「轮询 + 改写文本节点 + 自建折叠条 DOM」改为「观察器 + 属性打标 + CSS 裁剪」，并顺带修复「工具调用缺闭合标签时不折叠」的缺陷。

只做这个文件（及 `sse-parser.ts` 的一行导出、对应测试），不改其他文件。

## context

必读：

- `docs/notes/tool-call-collapse-research.md` —— 调研结论、已定决策、实测数据
- `docs/plan/tool-call-collapse.md` 第 2 节「设计」—— 折叠契约、CSS、纯逻辑签名
- `docs/CLEAN-CODE.md` —— 编码规范（未加限定的规则一律 MUST）
- `docs/CONTEXT.md` —— 术语（折叠条 / 工具调用）

## 现状与问题（已实测）

现有实现 `collapseRawToolCall` 用 TreeWalker 收集文本节点、截断/清空节点、插入自建 `<div data-ds-collapse>`。实测四个缺陷：

1. 15884 字符块改写后留下 575 个空文本节点 + 579 个 `display:none` 元素；
2. `findToolCallRegion` 要求闭合标签，但模型有时省略（`sse-parser.ts:318` 注释确认），实测「生成效率提升文档」会话 `open:1/close:0` → 零折叠；
3. 靠 1.2s 全量轮询维持；
4. 导出侧必须反解按钮文案。

## 折叠契约

给块级元素加属性，不插入任何自建 DOM：

| 属性 | 值 | 作用 |
|---|---|---|
| `data-ds-fold` | `tool` \| `code` | 存在即已折叠（幂等标记），值区分类型 |
| `data-ds-fold-label` | `▸ 工具调用 doc_generate` | 标签行文案 |
| `data-ds-fold-open` | 无值 | 存在即展开态 |

## CSS（注入 id 用 `collapse`）

```css
[data-ds-fold] { position: relative; transition: max-height 0.25s ease; }
[data-ds-fold]::before {
  content: attr(data-ds-fold-label);
  display: flex; align-items: center; height: 34px;
  cursor: pointer; user-select: none; font-size: 13px;
  color: var(--dsw-alias-label-secondary, #61666b);
}
[data-ds-fold]:not([data-ds-fold-open]) {
  max-height: 34px; overflow: hidden; visibility: hidden; box-sizing: border-box;
}
[data-ds-fold]:not([data-ds-fold-open])::before { visibility: visible; }
```

要点：
- `visibility: hidden` 加在**容器自身**（同时屏蔽文本节点与元素子节点），`::before` 单独恢复可见。
- `box-sizing: border-box` 保证带 padding 的元素（如 `pre` 有 16px padding）折叠后仍是 34px。
- 标签行常驻（折叠态 34px，展开态多一行 34px），与官方「已思考」一致。

已实测（真实页面）：工具调用块 455px→34px，展开 489px；代码块容器 397px→34px；原文完整保留；虚拟列表高度正常收缩。

## 纯逻辑（导出，供测试）

```ts
export interface ToolCallSpan {
  name: string;
  start: number; // 含 `<tag>`
  end: number;   // 闭合标签之后（缺闭合标签时为 JSON 之后）
}

/** 找出文本中所有工具调用区间；闭合标签可选（模型有时省略） */
export function findToolCallSpans(text: string, tags?: string[]): ToolCallSpan[];

export interface FoldDecision {
  foldable: boolean;
  toolNames: string[]; // 去重，保持出现顺序
}

/** 折叠判定：块内除工具调用外还有正文时不折叠 */
export function classifyFoldableBlock(text: string, spans: ToolCallSpan[]): FoldDecision;

/** 标签行文案：'▸ 工具调用 doc_generate、web_search' */
export function buildFoldLabel(toolNames: string[], expanded: boolean): string;

/** 区间外文本（去空白后）是否为空 */
export function hasTextOutsideSpans(text: string, spans: ToolCallSpan[]): boolean;
```

实现要求：

- 复用 `sse-parser.ts` 的 `extractBalancedJson`（把它改为 `export`，不要写第二份平衡扫描）。该函数是纯函数，已有测试基础。
- `findToolCallSpans` 必须支持：多个工具调用、JSON 内含嵌套花括号、字符串内的转义引号、闭合标签缺失、闭合标签前有空白。
- 删除旧函数：`findToolCallRegion`、`collapseRawToolCall`、`hideEmptyAncestors`、`buildToolCallBar`、`toolCallLabel`、`TextSeg`、`COLLAPSE_TAGS`（若被新逻辑取代）、`BTN_STYLE`、`RAW_VIEW_MAX_HEIGHT`。
- 保留并复用：`SKIP_SUBTREE_SELECTOR`（改为跳过 `.ds-think-content`、`.ds-mini-tool-block`、`[data-ds-fold]`）、助手气泡判定、`CODE_COLLAPSE_MIN_LINES`（≥15 行）、`toolNames` 标签表。

## DOM 层

| 函数 | 职责 |
|---|---|
| `initCollapse()` | 注入 CSS、注册点击委托、启动观察器、首屏扫描 |
| `scheduleScan(block)` | 变化入队 + 250ms 节流批量处理 |
| `foldBlockIfEligible(block)` | 取文本 → 找区间 → 判定 → 打标或撤销 |
| `toggleFold(block)` | 切换 `data-ds-fold-open` 与文案 |

扫描策略（替换 1.2s 全量轮询）：

```
MutationObserver(#root, { childList: true, subtree: true, characterData: true })
  → 向上找最近的块级候选（.ds-assistant-message-main-content 的直接子元素，或 .md-code-block）
  → 入队 Set
  → 250ms 节流批量处理
```

要求：

- **边输出边折叠**：流式期间 JSON 未闭合 → 平衡扫描返回空 → 不折；一闭合立即折。不要引入「文本稳定门」。
- **幂等**：已带 `data-ds-fold` 的块重复扫描不重复打标。
- **撤销保险**：已折叠块若后来出现区间外正文，撤销折叠（移除属性）。
- **只处理助手气泡**：用户气泡里的注入说明带工具示例标签，折叠会污染导出。
- **跳过** `[data-ds-hidden]` 块。
- **代码块**：`data-ds-fold="code"`，标签 `▸ 代码块（N 行）`，折 **`.md-code-block` 容器**（实测 34px，顶栏一起藏），而非 `pre` 本身（`pre` 有 16px padding，折后 66px）。
- **点击委托**：绑定在 `document`，用 `closest('[data-ds-fold]')` 判定，避免为每个块注册监听器。

## path

- `src/core/ui-collapse.ts`（主改）
- `src/core/sse-parser.ts`（仅 `extractBalancedJson` 加 `export`）
- `src/core/__tests__/ui-collapse.test.ts`（重写）

**不要动**：`content.ts`、`ui-tool-blocks.ts`、`chat-exporter.ts`（属于 collapse-002）。

## verification

1. `pnpm test` 全绿。测试用例至少覆盖：
   - 闭合标签缺失时仍能定位区间（对应「生成效率提升文档」缺陷）
   - 多个工具调用（`<web_search>…</web_search> <doc_generate>…</doc_generate>`）
   - JSON 内含嵌套花括号与转义引号
   - 区间外有正文 → `foldable: false`；区间外仅空白 → `foldable: true`
   - 标签文案去重与顺序
   - `hasTextOutsideSpans` 的边界（全空白、空串、无区间）
2. `pnpm typecheck` 通过。
3. `pnpm lint` 通过。
4. `pnpm build` 成功产出 `dist/chrome-mv3/`。

DOM 部分（观察器、打标、点击委托）不做单测，原因：依赖真实页面结构（`.ds-message` / 虚拟列表 / 流式渲染），当前测试环境是 `node` 无 jsdom。请在测试文件头部保留这一说明。

## 交付说明

完成后简要报告：改了哪些函数、删了哪些、测试与检查结果、未决风险。
