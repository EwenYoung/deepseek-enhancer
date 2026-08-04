---
name: dev-workflow
description: deepseek-enhancer 项目完整开发工作流：编码 → 补测试 → 全量测试 → 构建部署 → 人工验证
---

# /dev-workflow

deepseek-enhancer 项目的标准开发工作流。

## 完整流程

每次代码改动后按以下顺序执行：

### 1. 编码

完成功能实现或 Bug 修复。

### 2. 补测试

- **新增/修改了功能** → 判断是否可自动化：
  - 可自动化（纯逻辑，无 DOM/Chrome API 依赖）→ 在 `src/core/__tests__/` 补充或更新对应测试
  - 不可自动化（UI 模块、Chrome API 包装层、网络拦截层）→ 说明原因，跳过
- **仅 Bug 修复** → 如修复涉及可测试逻辑，补充回归测试

测试文件位置：`src/core/__tests__/`，运行 `pnpm test`（vitest）。

### 3. 全量测试

```bash
pnpm test
```

全部通过方可继续。失败需修复代码或更新测试（预期行为已变）。

### 4. 构建与部署

```bash
pnpm build
```

构建产物 `dist/chrome-mv3/` 目录即可加载。

### 5. 人工验证（用户）

在 `chat.deepseek.com` 浏览器中验证：

- 各主题下视觉颜色、按钮、高亮
- Agent 模式端到端工具调用
- React 条件渲染后的 UI 状态
- SPA 导航后的状态保持

## Chrome 扩展加载

1. 打开 `chrome://extensions`
2. 启用「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/chrome-mv3/` 目录

## 测试覆盖

| 类型 | 文件 | 内容 |
|------|------|------|
| 单元 | `sse-parser.test.ts` | SSE 块解析、工具调用提取、文本积累 |
| 单元 | `context-builder.test.ts` | `/skill` 命令解析、上下文前缀构建 |
| 单元 | `skill-importer.test.ts` | SKILL.md frontmatter 解析、hash 生成 |
| 单元 | `chat-exporter.test.ts` | 工具结果 Markdown 包装、slugify |
| 集成 | `skill-registry.test.ts` | Skill CRUD、toggle、前缀匹配（mock `chrome.storage.local`） |
| 集成 | `conversation-store.test.ts` | 分类/会话状态变更、storage 往返（mock `chrome.storage.local`） |

不适合自动化测试的模块：`ui-panel`、`ui-tool-blocks`、`ui-autocomplete`、`artifact`（DOM 重依赖）、`fetch-hook`/`main-xhr-inject`（需 mock 网络层）。
