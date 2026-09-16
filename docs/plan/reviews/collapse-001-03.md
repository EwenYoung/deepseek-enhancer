# Review 补记 2：流式输出期间不折叠（用户实测发现）

审查人：主会话 ｜ 日期：2026-09-16 ｜ 结论：**已修复**

## 问题（P1，blocking）

**用户实测**：生成文档时大段 HTML 仍会刷屏，折叠只发生在生成结束之后。

**根因**：`findToolCallSpans` 对流式未闭合的 JSON 直接跳过（`if (!body) { cursor = open.end; continue; }`），理由写在旧注释里：「JSON 尚未闭合（流式输出中段）或非法」。于是：

- 流式期间 JSON 未闭合 → `spans = []` → `classifyFoldableBlock` 返回 `foldable: false` → **不折叠**；
- 等模型输出完 `}`，JSON 闭合 → 才折叠。

`doc_generate` 的 content 有几千字符、输出几十秒，这段时间全程铺满正文——正是用户截图看到的。

**设计缺陷**：把「JSON 未闭合（流式进行中）」和「标签后没有 JSON（模型误写）」混为一谈，都当「不是调用」跳过。前者应当**立即折叠**，后者才该跳过。

## 修复

`ui-collapse.ts:60-77`：

```ts
const jsonStart = skipWhitespace(text, open.end);
if (text[jsonStart] !== '{') {
  // 标签后压根没有 JSON 起点（模型误写或正文引用标签词）：不是调用，跳过
  cursor = open.end;
  continue;
}
const body = extractBalancedJson(text, jsonStart);
if (!body) {
  // JSON 已开始但未闭合＝流式输出进行中。必须在标签出现的这一刻就折叠……
  // 区间先延到文本末尾，下一轮扫描拿到完整 JSON 后再重算终点
  spans.push({ name: open.name, start: open.start, end: text.length });
  break;
}
```

要点：
- 「有 `{` 但未闭合」→ 立即折叠，区间延到文本末尾；
- 「没有 `{`」→ 仍跳过（保持原有用例 `<web_search> 没有 JSON` 的语义）；
- JSON 闭合后区间终点自动回到实际末尾，`classifyFoldableBlock` 重算（若后面出现正文则撤销折叠）。

## 测试更新

旧用例 `'JSON 未闭合（流式输出中段）时返回空'` 正是错误预期的编码，已替换为三条新用例：

- `JSON 未闭合（流式输出中段）时区间延到文本末尾，保证立即折叠`
- `流式未闭合的区间外无正文时判定可折叠（边输出边折）`
- `JSON 闭合后区间终点回到实际调用末尾`

`pnpm test` 349 passed（原 347 + 2）。

## 真实页面验证（修复后构建，扩展已重载）

**端到端模拟流式**（每 100ms 追加 40 字符，模拟 SSE 增量渲染）：

| 时间 | 字符数 | 折叠 | 高度 |
|---|---|---|---|
| 101ms | 40 | 否 | 35px |
| **877ms** | **316** | **是** | **34px** |

即：**开标签出现后不到 1 秒就折叠**，不再等整个 JSON 闭合。修复前需要等几千字符 / 几十秒。

**流式增长期间保持折叠**：追加内容后仍 34px；JSON 闭合后仍 34px。

**回归**：真实会话（`今日新闻日报收集`）3 个助手消息的折叠块全部正常，含 15575 字符的 `doc_generate` 块。

## 检查

```
pnpm test          349 passed (18 files)
pnpm typecheck     无输出
pnpm lint          无输出
pnpm format:check  All matched files use Prettier code style!
pnpm build         成功
```

## 教训

「边输出边折叠」在计划里写成了决策，但实现把流式未闭合当成「不是调用」跳过——**决策没有对应的测试用例锁定**。原有的 `'JSON 未闭合时返回空'` 用例反而把错误行为固化成了预期。教训：写决策时，每条决策都该有一条以用户可观察行为命名的测试；否则决策只是文档上的一句话。
