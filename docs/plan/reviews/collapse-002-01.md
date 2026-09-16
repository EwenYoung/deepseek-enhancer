# Review：collapse-002（联动清理）

审查人：主会话 ｜ 日期：2026-09-16 ｜ 结论：**pass**

## 1. Findings

### 无 blocking findings

逐条对照任务文件：

| 任务要求 | 实现 | 结论 |
|---|---|---|
| 删除 `hideRawToolCalls` 及调用点 | `ui-tool-blocks.ts` 整段删除（−26/+11） | 一致 |
| 跳过条件改 `[data-ds-fold]` | `ui-tool-blocks.ts:424` | 一致 |
| 新形态工具块 → `🛠 工具调用：名称` | `chat-exporter.ts:649` 抽纯函数 `foldBlockToExportText` | 一致 |
| 代码块折叠保留原文 | `foldBlockToExportText` 首行 `if (input.foldKind === 'code') return input.text;` | 一致 |
| 旧形态 `[data-ds-collapse]` 兼容分支保留 | `foldBlockToExportText` 末尾 legacy 分支 + `querySelectorAll('[data-ds-fold], [data-ds-collapse]')` | 一致 |
| 保留 `display:none` 残留清理 / chrome selector / sanitize | 未改动 | 一致 |
| 纯 `doc_generate` 防重复 | `ui-tool-blocks.ts:230-238` 在 early-return 分支补 `markLastAssistantProcessed` | 一致（见下） |
| 测试抽纯函数而非造 DOM 桩 | 6 个新用例直接测 `foldBlockToExportText` | 一致 |

### F1（P3，non-blocking，已记录不改）嵌套折叠块的导出处理顺序

- 代码位置：`chat-exporter.ts:651` `clone.querySelectorAll('[data-ds-fold], [data-ds-collapse]').forEach(...)`
- 若一个 `[data-ds-fold]` 块嵌套另一个（实测当前结构下不会发生：`findFoldCandidate` 优先返回 `.md-code-block`，且代码块是正文直接子元素），`forEach` 会先处理外层、外层被 `replaceWith` 后内层引用仍在文档片段外，内层分支仍会执行但不产生错误（`replaceWith` 对已分离节点是空操作）。
- 判定：非阻塞。当前结构不可达，且无副作用。

## 2. 验证命令真实输出（主会话独立执行）

```
$ pnpm test
 Test Files  18 passed (18)
      Tests  347 passed (347)

$ pnpm typecheck   $ tsc --noEmit            无输出
$ pnpm lint        $ eslint "src/**/*.{ts,tsx,js,jsx}"   无输出
$ pnpm format:check  All matched files use Prettier code style!
```

`pnpm build` 由开发 agent 报告成功；主会话将在三任务全部完成后统一重跑。

## 3. 额外独立验证（临时脚本，已删除）

用 `npx tsx` 直接跑 `foldBlockToExportText` 的四个边界：

| 输入 | 输出 |
|---|---|
| 工具块（label 有名称） | `🛠 工具调用：doc_generate` |
| 代码块 | 原文原样返回 |
| 工具块但 text 为空 | 仍输出 `🛠 工具调用：doc_generate`（label 优先，不依赖 DOM 文本） |
| 旧形态代码条 | `''`（丢弃，代码由兄弟 `pre` 导出） |

## 4. 防重复改动的审查

`ui-tool-blocks.ts:230-238` 把 `findChatContainer()` 提前到 early-return 之前，并给 `markLastAssistantProcessed` 加了 `null` 守卫。审查要点：

- `findChatContainer()` 在 early-return 前调用，对非 local 调用路径无行为变化（原本也在 `:232` 调用）。
- `markLastAssistantProcessed(null)` 直接返回，不会抛错。
- 打标时机：在 `handleDocGenerate` 之后、`return` 之前。此时消息元素若已挂载则打标成功；若未挂载则打标落空（开发 agent 已在残留风险中申报，需人工验证覆盖）。
- 该改动**不引入新副作用**：`data-ds-tool-processed` 只被 `processNewContent` 用作跳过条件。

## 5. 结论

**pass**。三条补偿（删函数、改跳过条件、导出新分支）全部落地，防重复缺口已补，五项检查全过。1 条 non-blocking finding 已记录（不可达场景，不修）。

## 6. 交接给人工验证的重点

1. 纯 `doc_generate` 会话：确认**只下载一次**文件（防重复改动是否生效）。
2. 混合工具会话（web_search + doc_generate）：确认循环轮次正常、不重复执行。
3. 切换会话再切回：确认折叠属性被重扫补打、不重复执行。
4. 导出该会话 Markdown：确认工具调用显示为 `🛠 工具调用：名称`，**不含完整 XML**。
