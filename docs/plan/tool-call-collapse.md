# 实现计划：工具调用原始输出折叠（CSS 裁剪方案）

> 依据：[tool-call-collapse-research.md](../notes/tool-call-collapse-research.md) ｜ 状态：待实施
> 规范：[CLEAN-CODE.md](../CLEAN-CODE.md) ｜ 术语：[CONTEXT.md](../CONTEXT.md)

## 一、目标与范围

**目标**：助手消息里的工具调用原始 XML（如 `<doc_generate>{…}</doc_generate>`）与超长代码块**默认折叠**，视觉上对齐官方「已思考」折叠块；折叠**不改写文本节点**，只做 CSS 裁剪。

**范围内**：
- 重写 `ui-collapse.ts` 的折叠机制（轮询 + 文本改写 → 观察器 + 属性打标 + CSS）
- 顺带修复：工具调用缺闭合标签时不折叠（实测真实会话命中）
- 联动清理：`ui-tool-blocks.ts` 的 `hideRawToolCalls`、`chat-exporter.ts` 的折叠条反解

**范围外**：
- 不改 XHR/SSE 拦截（调研结论：性价比最低）
- 不改工具执行、Agent 循环、导出数据结构
- 不引入新依赖

## 二、设计

### 2.1 折叠契约（DOM）

一个可折叠块 = 一个**块级元素**（工具调用所在 `<p>` 或代码块 `<pre>`）加三个属性：

| 属性 | 值 | 作用 |
|---|---|---|
| `data-ds-fold` | `tool` \| `code` | 存在即已折叠（幂等标记）；值区分类型 |
| `data-ds-fold-label` | `▸ 工具调用 doc_generate` | 标签行文案（`▸`/`▾` 随展开态切换） |
| `data-ds-fold-open` | 无值 | 存在即展开态 |

**不插入任何自建 DOM 节点**，标签行由 `::before` 伪元素渲染。

### 2.2 CSS（注入 id：`collapse`）

```css
[data-ds-fold] {
  position: relative;
  transition: max-height 0.25s ease;
}
[data-ds-fold]::before {
  content: attr(data-ds-fold-label);
  display: flex;
  align-items: center;
  height: 34px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #61666b);
}
[data-ds-fold]:not([data-ds-fold-open]) {
  max-height: 34px;
  overflow: hidden;
}
[data-ds-fold]:not([data-ds-fold-open]) > * {
  visibility: hidden;
}
```

**已实测**（真实页面）：折叠 455px→34px；展开 489px（含常驻标签行）；原文完整保留；虚拟列表高度正常收缩；折叠/展开目标元素位置不跳动。

### 2.3 纯逻辑（可测，`src/core/ui-collapse.ts` 导出）

```ts
/** 一段工具调用在文本中的区间 */
export interface ToolCallSpan {
  name: string;
  start: number; // 含 `<tag>`
  end: number;   // 闭合标签之后（缺闭合标签时为 JSON 之后）
}

/** 找出文本中所有工具调用区间；闭合标签可选（模型有时省略） */
export function findToolCallSpans(text: string, tags?: string[]): ToolCallSpan[];

/** 折叠判定：块内除工具调用外还有正文时不折叠 */
export interface FoldDecision {
  foldable: boolean;
  toolNames: string[]; // 去重后的工具名，用于标签文案
}
export function classifyFoldableBlock(text: string, spans: ToolCallSpan[]): FoldDecision;

/** 标签行文案：'▸ 工具调用 doc_generate、web_search' */
export function buildFoldLabel(toolNames: string[], expanded: boolean): string;

/** 区间外文本（去空白后）是否为空 */
export function hasTextOutsideSpans(text: string, spans: ToolCallSpan[]): boolean;
```

`findToolCallSpans` 复用 `sse-parser.ts` 的平衡扫描：把 `extractBalancedJson` 改为导出（纯函数，已有测试基础），避免第二份实现。

### 2.4 DOM 层（不可测，说明原因）

| 函数 | 职责 |
|---|---|
| `initCollapse()` | 注入 CSS、注册点击委托、启动观察器、首屏扫描 |
| `scheduleScan(block)` | 变化入队 + 节流（250ms）批量处理 |
| `foldBlockIfEligible(block)` | 取文本 → 找区间 → 判定 → 打标或撤销 |
| `toggleFold(block)` | 切换 `data-ds-fold-open` 与文案 |

**扫描策略**（替换现有 1.2s 全量轮询）：

```
MutationObserver(#root, { childList: true, subtree: true, characterData: true })
  → 向上找最近的块级候选（.ds-assistant-message-main-content 的直接子元素，或 pre）
  → 入队 Set
  → 250ms 节流批量处理
```

- **边输出边折叠**：流式期间 JSON 未闭合时平衡扫描返回空 → 不折；一旦闭合立即折。天然满足，无需「文本稳定门」。
- **幂等**：已带 `data-ds-fold` 的块重复扫描不重复打标；若已折叠块后来出现区间外正文，则撤销折叠（保险）。
- **跳过子树**：思考区 `.ds-think-content`、扩展自渲染的 `.ds-mini-tool-block`、已有 `data-ds-fold` 的块。

**代码块**：同一套属性，`data-ds-fold="code"`，标签 `▸ 代码块（N 行）`，阈值沿用 ≥15 行。

## 三、文件改动清单

| 文件 | 改动 | 估算 |
|---|---|---|
| `src/core/ui-collapse.ts` | 重写：删除文本改写/`hideEmptyAncestors`/`buildToolCallBar`/`TextSeg`/轮询；新增纯逻辑 + 打标 + 观察器 | ~180 行 |
| `src/core/sse-parser.ts` | `extractBalancedJson` 改为 `export`（供折叠复用） | +1 行 |
| `src/core/ui-tool-blocks.ts` | 删除 `hideRawToolCalls` 及其调用（职责被折叠接管）；`processNewContent` 跳过条件加 `[data-ds-fold]` | −25 行 |
| `src/core/chat-exporter.ts` | `extractRenderedReplyHTML`：把 `[data-ds-collapse]` 反解改为 `[data-ds-fold]` 直读 `data-ds-fold-label`；`display:none` 残留清理保留并更新注释 | ~±15 行 |
| `src/core/__tests__/ui-collapse.test.ts` | 重写：覆盖 4 个纯函数 | ~120 行 |
| `docs/CONTEXT.md` | 更新「折叠条」术语（形态变了：自建横条 → 属性 + 伪元素） | ~5 行 |
| `README.md` / `README-en.md` | 如提及折叠行为则同步（待查） | 待定 |

## 四、任务分解

四个任务串行（文件有依赖，无 worktree，串行执行）。

### task-1：纯逻辑层 + 测试

- **objective**：实现并测试 `findToolCallSpans` / `classifyFoldableBlock` / `buildFoldLabel` / `hasTextOutsideSpans`；导出 `extractBalancedJson`
- **path**：`src/core/ui-collapse.ts`（仅纯函数部分）、`src/core/sse-parser.ts`、`src/core/__tests__/ui-collapse.test.ts`
- **verification**：`pnpm test` 全绿；用例覆盖
  - 闭合标签缺失时仍能定位区间（对应「生成效率提升文档」缺陷）
  - 多个工具调用、嵌套花括号 JSON、转义引号
  - 区间外有正文 → `foldable: false`
  - 区间外仅空白 → `foldable: true`
  - 标签文案去重与顺序

### task-2：DOM 层接入

- **objective**：重写 `initCollapse` 为观察器 + 打标 + CSS + 点击委托；接入 `content.ts`（接口不变）
- **depends-on**：task-1
- **path**：`src/core/ui-collapse.ts`（DOM 部分）、`src/entrypoints/content.ts`（如接口有变）
- **verification**：`pnpm typecheck` + `pnpm lint` 通过；`pnpm build` 产出 `dist/chrome-mv3/`；人工验证见第六节

### task-3：联动清理

- **objective**：删除 `hideRawToolCalls`；`chat-exporter.ts` 适配新折叠形态
- **depends-on**：task-2
- **path**：`src/core/ui-tool-blocks.ts`、`src/core/chat-exporter.ts`、`src/core/__tests__/chat-exporter.test.ts`
- **verification**：`pnpm test` 全绿（含导出用例）；确认导出内容为「🛠 工具调用：名称」标记，不带完整 XML

### task-4：文档与术语同步

- **objective**：更新 `CONTEXT.md` 的「折叠条」术语定义与 `README` 相关描述
- **depends-on**：task-3（形态最终确定后）
- **path**：`docs/CONTEXT.md`、`README.md`、`README-en.md`
- **verification**：`pnpm format:check`；术语表与实现一致

## 五、风险与对策

| 风险 | 对策 |
|---|---|
| 官方改版把工具调用渲染进代码块 | 折叠逻辑按「块级元素 + 文本区间」判定，不假设标签名；若变成 `pre` 则走代码块分支 |
| 折叠后官方重渲染抹掉属性 | 观察器重新打标（已在设计内）；实测重渲染后属性确实会丢 |
| `visibility: hidden` 影响屏幕阅读器 | 折叠态下内容对读屏不可见，与官方「已思考」收起一致；展开即恢复 |
| 展开态多出 34px 标签行 | 与官方折叠块一致（标题常驻），可接受 |
| 导出读到完整 XML | task-3 显式处理：折叠块替换为「🛠 工具调用：名称」 |

**回滚**：改动集中在 4 个文件，`git revert` 单次提交即可恢复。

## 六、验收标准（人工，用户执行）

1. 新会话触发一次 `doc_generate`：输出过程中大段 HTML **从出现起就折叠成一行标签**，不刷屏。
2. 点击标签行展开 → 看到完整原文；再点击收起。
3. 切换会话再回来 → 折叠状态**自动恢复**（观察器重打标）。
4. 历史会话（含旧折叠条残留）打开 → 正常折叠，无重复标签。
5. 导出该会话 Markdown → 工具调用显示为「🛠 工具调用：doc_generate」，**不含完整 XML**。
6. 长代码块（≥15 行）同样折叠成标签行，展开/收起正常。
7. 深浅主题下标签行颜色可读。

## 六之二、自动化验证结果（2026-09-16，主会话执行）

已在真实 chat.deepseek.com 页面验证（扩展已重载新构建）：

| 验收项 | 结果 |
|---|---|
| 折叠高度 | 34px（原 455 / 4998 / 15884 字符块均为 34px） |
| 点击展开 | 489px，`data-ds-fold-open` 存在，文案转 `▾` |
| 再次点击收起 | 34px，属性移除，文案回 `▸` |
| 原文完整性 | 1106 / 4998 / 15884 字符全部保留在 DOM |
| 多工具合并标签 | `▸ 工具调用 news_hub、github_trending、web_search` |
| 6 个会话回归 | 全部正确折叠，旧折叠条残留 0 |
| SPA 切换会话后 | 观察器重扫补打，折叠恢复（默认收起态） |
| 代码块 14 行 | 不折（358px） |
| 代码块 15 行 | 折叠（34px，`▸ 代码块（15 行）`） |
| 代码块展开/收起 | 34px ↔ 502px，文案切换正常 |
| 工具调用 + 正文混排 | **不折**（保守规则生效） |
| 纯工具调用 | 折叠（34px） |

**验证中修复的 P1 缺陷**：点击标签行无法展开——官方在 `#root` 内部对气泡点击调用 `stopPropagation`，扩展绑在 `document` 冒泡阶段的委托收不到事件。已改为捕获阶段委托（`ui-collapse.ts:179`），修复后展开/收起正常。详见 [reviews/collapse-001-02.md](reviews/collapse-001-02.md)。

**尚未由用户确认的项**（需人工）：新会话实时边输出边折叠、导出 Markdown 内容、深浅主题下的视觉可读性。

## 六之三、流式折叠修复（用户实测反馈）

用户实测发现：生成文档时大段 HTML 仍刷屏，折叠发生在生成**结束之后**。

**根因**：`findToolCallSpans` 把「JSON 未闭合（流式进行中）」当成「不是完整调用」跳过，导致流式期间不折。已修复为「开标签出现即折叠，区间延到文本末尾，JSON 闭合后重算」。

**修复后端到端验证**（每 100ms 追加 40 字符模拟流式）：**877ms / 316 字符时即已折叠**（34px），流式增长期间保持折叠。修复前需等几千字符、几十秒。

详见 [reviews/collapse-001-03.md](reviews/collapse-001-03.md)。

## 七、未决（实施中确认）

- 代码块折叠后是否保留「预览高度」而非纯标签行（现决策：统一标签行）
- 旧会话里已有的 `[data-ds-collapse]` 折叠条是否需要兼容清理（预计官方重渲染后自然消失）
