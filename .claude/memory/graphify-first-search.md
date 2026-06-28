---
name: graphify-first-search
description: "优先使用graphify做本地代码搜索，代码改动后更新图谱"
metadata:
  type: feedback
  tags: [graphify, workflow, search]
---

## 用户明确要求

1. **搜索本地内容时** — 优先通过 `graphify query "..."` / `graphify explain "..."` / `graphify path "..."` 检索图谱，而非直接 grep 或逐个浏览文件
2. **代码修改后** — 运行 `graphify update .` （AST-only，无 API 费用）保持图谱与代码同步
3. **图谱优先** — graphify-out/graph.json 已建立时，使用图谱查询代替原始文件浏览

## 为什么（来自用户的反馈）

- 图谱能发现跨文件的隐含关联（社区结构、桥接节点）
- 查询模式（query/path/explain）返回的聚焦子图比原始 grep 输出更高效
- AST 更新免费，不消耗 API tokens

## 如何应用

```bash
graphify query "<问题>"              # 本地搜索 — BFS 广度遍历
graphify explain "概念名"             # 聚焦一个概念的解释
graphify path "节点A" "节点B"         # 两个概念之间的最短路径
graphify update .                    # 代码改动后更新图谱
```

这些规则已在 [[deepseek-enhancer-claude-md]] 的 `## graphify` 节中有对应记录。当 CLAUDE.md 指向存在时优先遵循 CLAUDE.md 的细节版本。
