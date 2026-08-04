---
name: testing-strategy
description: "测试策略：确定性代码我写assert测试，非确定性交互交用户手动测试"
metadata:
  type: reference
  tags: [testing, workflow]
---

## 测试分工

每次完成代码改动后，按以下分类执行验证：

### 我（Claude）测试 — 确定性、可自动化

| 类型 | 方法 |
|------|------|
| CSS 选择器逻辑 | `pnpm test` 或内联 assert 验证规则正确性 |
| 数据转换/解析 | `sse-parser.ts`、`chat-exporter.ts`、`tool-descriptors.ts` 等纯函数 |
| 状态合并逻辑 | `skill-registry.ts` 的 `loadSkills()`、`mergeUserSkills()` |
| 配置读写 | `chrome.storage.local` 的存取路径 |
| 工具/类型定义 | `tool-descriptors.ts`、`types.ts` 的结构完整性 |
| 无副作用的纯函数 | 导出的格式化、文本转义、时间计算等 |

**验证方式**：写内联 `assert` 或用 `vitest`（需有 test 文件），`pnpm test` 执行。

### 用户测试 — 需在 chat.deepseek.com 浏览器中验证

| 类型 | 说明 |
|------|------|
| 视觉/主题 | 各主题下颜色、按钮、边距、高亮是否正确 |
| 交互流 | Agent 模式、工具调用、技能注入的端到端流程 |
| 浏览器特有 | 条件渲染（React 动态创建的元素）、CSS-in-JS 交互 |
| 跨页面状态 | SPA 导航、会话切换后的 UI 状态 |

## 工作流

1. Claude 完成代码改动（逻辑层）
2. Claude 写/更新对应测试（纯函数层）→ `pnpm test` 通过
3. 用户构建部署 → 在浏览器手动测试（交互/视觉层）

相关文件：`CLAUDE.md` → `## 测试` 节
