# Review：collapse-001（重写折叠机制为 CSS 裁剪）

审查人：主会话（verify agent Spinoza 运行 45 分钟无产出，已取消，改由主会话完成）
日期：2026-09-16 ｜ 结论：**pass**（1 条 non-blocking finding，已当场修复）

## 1. Findings

### F1（P3，non-blocking）`buildCodeFoldLabel` 导出并测试，但生产代码未使用

- 设计文档位置：`docs/plan/tasks/collapse-001.md`「纯逻辑」小节
- 代码位置：`src/core/ui-collapse.ts:95`（定义）、`src/core/ui-collapse.ts:263`（`planFold` 内联同款字符串）

```ts
// :95 导出的纯函数
export function buildCodeFoldLabel(lines: number, expanded: boolean): string {
  return `${foldMarker(expanded)} 代码块（${lines} 行）`;
}

// :263 planFold 内联了同样的拼接，没调用它
? { kind: 'code', label: `${foldMarker(expanded)} 代码块（${lines} 行）` }
```

- 判定：属 CLEAN-CODE「Do not keep duplicated logic without a strong reason」。开发 agent 在交付说明中主动申报了「多导出 `buildCodeFoldLabel`」这一偏差（理由：可测），但漏了「生产未使用」。
- 处理：已当场修复——`planFold` 改为调用 `buildCodeFoldLabel(lines, expanded)`。修复后测试与三项检查重跑通过。

### 无 blocking findings

逐条对照任务文件的结果：

| 任务要求 | 实现 | 结论 |
|---|---|---|
| 折叠契约三属性 | `ui-collapse.ts:18-20` 常量 + `applyFold`/`undoFold` | 一致 |
| CSS 逐字对齐（含 `box-sizing: border-box`、`::before` 单独 `visibility: visible`） | `ui-collapse.ts:150-177` | 一致 |
| 纯逻辑四函数签名 | `ui-collapse.ts:54/83/89/100` | 一致 |
| 复用 `extractBalancedJson`，无第二份平衡扫描 | `sse-parser.ts:204` 加 export；`ui-collapse.ts:61` 调用 | 一致 |
| 删除旧函数 | `findToolCallRegion`/`collapseRawToolCall`/`hideEmptyAncestors`/`buildToolCallBar`/`toolCallLabel`/`TextSeg`/`BTN_STYLE`/`RAW_VIEW_MAX_HEIGHT`/`CODE_COLLAPSED_HEIGHT`/`RESCAN_INTERVAL_MS` 全部不存在 | 一致 |
| `SKIP_SUBTREE_SELECTOR` 改造 | `ui-collapse.ts:31` = `.ds-think-content, .ds-mini-tool-block, [data-ds-fold]` | 一致 |
| 边输出边折叠（不引入稳定门） | `findToolCallSpans` 在 JSON 未闭合时返回 `[]` → `foldable: false`；无稳定门 | 一致 |
| 幂等 | `applyFold` 在 kind+label 相同时提前返回（`:275-280`） | 一致 |
| 撤销保险 | `foldBlockIfEligible` → plan 为空时 `undoFold`（`:248`） | 一致 |
| 只处理助手气泡 | `isFoldCandidate` 要求 `closest('.ds-assistant-message-main-content')`（`:256`） | 一致 |
| 跳过 `[data-ds-hidden]` | `ui-collapse.ts:254` | 一致 |
| 代码块折 `.md-code-block` 容器 | `planFold:260` 判定 `classList.contains('md-code-block')`；`findFoldCandidate:232` 优先返回该容器 | 一致 |
| 点击委托绑 `document` | `ui-collapse.ts:179` + `:293` | 一致 |
| 不做 DOM 单测并说明原因 | 测试文件头 `:1-3` | 一致 |

## 2. 验证命令真实输出（主会话独立执行）

```
$ pnpm test
 Test Files  18 passed (18)
      Tests  341 passed (341)

$ pnpm typecheck
$ tsc --noEmit          （无输出即通过）

$ pnpm lint
$ eslint "src/**/*.{ts,tsx,js,jsx}"   （无输出即通过）

$ pnpm format:check
All matched files use Prettier code style!
```

`ui-collapse.test.ts` 实际 **22 个用例**（开发 agent 交付说明写「26 个」，属笔误，不影响结论）。

## 3. 真实页面独立验证（只读探测 + 临时注入同款 CSS，验证后已清理）

| 检查项 | 结果 |
|---|---|
| 折叠后高度 | 34px（原 455px） |
| 块自身 `visibility` | `hidden` |
| `::before` `visibility` | `visible`（标签行可见，关键风险点已排除） |
| 内容子元素 `visibility` | `hidden` |
| 标签行处 `elementFromPoint` | 返回块自身（点击目标正确，Aristotle 的 `target === block` 判定成立） |
| 原文完整性 | `textContent` 长度不变 |

未验证项：点击切换（页面当前加载的是旧构建的扩展，不含新 `initCollapse`，故合成点击无响应）。留给人工验证阶段。

## 4. 结论

**pass**。实现与设计文档一致，四项检查全过，CSS 关键行为在真实页面得到独立确认。唯一 finding（F1）已当场修复。

## 5. 交接给 collapse-002 的已知风险（开发 agent 已申报，基线调查也确认）

1. `ui-tool-blocks.ts:417` 仍用 `[data-ds-collapse]` 跳过，新折叠块会被 DOM 兜底路径重扫 → 有重复执行工具调用的窗口。**必须改 `[data-ds-fold]`**。
2. `hideRawToolCalls` 仍在跑，会清空新折叠块里的文本节点（现象：标签行在、展开后正文被掏空）。**必须删除**。
3. `chat-exporter.ts:633` 仍反解旧折叠条，新折叠块会把完整 XML 带进导出。**必须加新分支**。
4. 纯 `doc_generate` 消息拿不到 `data-ds-tool-processed` 标记（`ui-tool-blocks.ts:230` 早于 `:242`），删掉 `hideRawToolCalls` 后只剩 `processedDocKeys` 去重。**需评估是否补防重复**。
