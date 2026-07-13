# 03 — 工具结果结构化

**What to build:** `ToolResult` 接口增加 `summary`/`detail`/`output`/`truncated` 字段，各工具执行函数填充这些字段，`formatResults` 输出结构化 JSON。

**Spec ref:** FR-3
**Priority:** P1
**Blocked by:** 02（依赖 `formatResults` 改造）

**Status:** done

- [x] `ToolResult` 接口新增字段: `summary: string`, `detail: string`, `output: unknown`, `truncated: boolean`
- [x] `tool-executor.ts` 各工具函数返回时填充新字段:
  - `web_search`: summary = "找到 N 条结果", detail = 标题+摘要拼接, output = 原始 results 数组
  - `web_fetch`: summary = "抓取成功，内容长度 N", detail = 页面正文截断 4000, output = 原始 markdown
  - `news_hub`: summary = "聚合 N 条新闻", detail = 新闻列表, output = 原始数据
  - `github_trending`: summary = "获取 N 个热门项目", detail = 项目列表, output = 原始数据
- [x] `formatResults` 输出 JSON 数组，每项含 `tool`/`ok`/`summary`/`detail`/`output`/`truncated`
- [x] 截断辅助函数: `output` 序列化后截断 8000 字符, `detail` 截断 4000 字符

**Files:**
- `src/core/types.ts` — `ToolResult` 接口
- `src/core/tool-executor.ts` — 各工具执行函数
- `src/core/ui-tool-blocks.ts` — `formatResults`

**Verification:**
1. `web_search` 工具调用 → `ToolResult.summary` 非空，格式 "找到 N 条结果"
2. 大量结果场景 → `output` JSON 字符串 ≤ 8000 字符，`truncated` 为 true
3. `formatResults` 输出为合法 JSON 数组
