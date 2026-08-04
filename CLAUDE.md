# CLAUDE.md

为 Claude Code 提供项目上下文和行动指引。

## 流程性规则（Skills）

以下操作规则已独立为 skill，按需调用：

| Skill | 触发方式 | 用途 |
|-------|---------|------|
| network-proxy | `/network-proxy` | 网络命令前配置代理 127.0.0.1:7897 |
| dev-workflow | `/dev-workflow` | 测试分工 + Chrome 扩展部署 |
| graphify | `/graphify` | 知识图谱构建/查询 |

## 行动原则

- **遵循 dev-workflow**：代码改动后严格按照 dev-workflow skill 流程执行（编码 → 补测试 → 全量测试 → 构建部署）。触发：`/dev-workflow`。
- **Commit 前检查**：按序运行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`。typecheck/lint 失败需修复；format 失败则 `pnpm format` 后重新 add。三项全部通过后方可提交。
- **Review 委托**：代码 review 必须分派 subagent（`Agent tool, subagent_type="general-purpose"`）。简要 review 用 caveman-review，标准+规格 review 用 code-review。
- **危险 Git 操作确认**：`git reset --hard`、`git clean -fd`、`git branch -D`、`git push --force` 等不可逆操作，执行前必须向用户确认并展示会丢失的内容。
- **脚本优先**：重复性任务优先写脚本执行，避免逐步手动操作。

## 构建与部署

```bash
pnpm build              # 构建 Chrome MV3 生产包
pnpm dev                # 开发模式（HMR）
pnpm dev:firefox        # Firefox 开发模式
pnpm zip                # 打包为 zip
pnpm test               # 运行测试（vitest）
```

构建产物目录：`dist/chrome-mv3/`。

## 包管理器

项目使用 **pnpm**（v11+），通过 Node.js 内置的 `corepack` 管理：

```bash
corepack enable                    # 首次启用（已完成）
corepack prepare pnpm@latest --activate
pnpm install                       # 安装依赖
pnpm add -D <pkg>                  # 添加开发依赖
pnpm install --frozen-lockfile     # CI 场景（等同 npm ci）
```

- 锁文件：`pnpm-lock.yaml`（由 `pnpm import` 从 `package-lock.json` 迁移）
- 依赖严格隔离，无幽灵依赖——代码引用的所有包均在 `package.json` 中显式声明
- `esbuild`、`spawn-sync` 等需要 build scripts 的包已通过 `pnpm approve-builds` 批准

## 架构

### 三层运行时

| 层级 | 核心文件 | 运行环境 | 职责 |
|------|---------|---------|------|
| **MAIN** | `src/entrypoints/main-world.content.ts` + `src/core/main-xhr-inject.ts` | 页面上下文（`<script>` 注入） | XHR 拦截、prompt 增强、SSE 解析 |
| **Isolated** | `src/entrypoints/content.ts` | 隔离 content script | UI 管理、工具执行、事件协调 |
| **Background** | `src/entrypoints/background.ts` | Service Worker | Tavily API 代理 |

MAIN ↔ Isolated 通过 `window.postMessage` 通信，消息标记 `source: 'DS_MINI_ISOLATED'` / `'DS_MINI_MAIN'`。

### Agent 工具调用循环

1. MAIN 层拦截 `XMLHttpRequest.prototype.send` → 将工具定义注入 prompt
2. SSE progress 事件 → 解析文本 → 正则检出 `<web_search>{...}</web_search>`
3. → postMessage → Isolated → `chrome.runtime.sendMessage` → Background → Tavily API
4. → 结果通过 `domSubmitText()` 提交（填充 textarea + 点击发送按钮）
5. → 页面发起新 XHR → 循环继续或模型自然回复

### 核心文件

| 文件 | 职责 |
|------|------|
| `src/core/main-xhr-inject.ts` | MAIN 层 IIFE（字符串注入）。XHR 拦截、prompt 增强、SSE 解析、工具调用检测。将注入记录存储于隐藏 `<div>` 供导出。 |
| `src/core/ui-tool-blocks.ts` | 工具调用结果 UI（loading → 结果块），处理 DOM 提交以驱动循环。 |
| `src/core/ui-panel.ts` | 浮动侧边面板。Skill 增删改查、API Key 管理、Agent 模式开关、导出按钮。 |
| `src/core/ui-autocomplete.ts` | `/` 触发 skill 选择下拉。使用 `ignoreNextInput` 标记应对 React 18 重渲染干扰。 |
| `src/core/skill-registry.ts` | Skill 存储于 `chrome.storage.local`，`getSkillByName()` 供注入使用。 |
| `src/core/chat-exporter.ts` | Markdown/HTML 会话导出，将工具结果包装为代码块。 |
| `src/entrypoints/background.ts` | Tavily Search / Extract API 调用（`advanced` 搜索深度）。 |

### 关键模式

- **Agent 模式**：面板开关控制是否将工具定义注入 prompt。默认关闭。
- **Skill 注入**：`onInput` 检测 `/skillname` → `postMessage(SET_SKILL)` → MAIN 层在 `augmentPrompt` 中加入 `skillInstructions`。
- **SSE 缓冲区隔离**：数据存储在 `xhr.__ds_buf` 上，按实例隔离，避免并发请求污染。
- **模式检测**：从 DOM 读取活跃模式 class `_31a22b0`，决定注入工具范围（快速模式=仅 web_fetch，专家/web=全部）。

## 知识图谱

项目知识图谱位于 `graphify-out/`，包含 god nodes、社区结构和跨文件关系。详见 `.claude/skills/graphify/SKILL.md`。

```bash
graphify .              # 全量重建（需 API key：DeepSeek 或 Gemini）
graphify . --update     # 增量更新（仅改代码时快，改文档/图片多时需 API key）
graphify query "<问题>"  # 从现图查询，不重建
graphify cluster-only . # 仅重聚类+刷新报告
graphify export html    # 重新生成 graph.html
```

增量模式已知问题：manifest 字段跨版本不兼容（`ast_hash` vs `hash`），无 API key 时卡语义提取。详见 memory: `graphify-cache-pitfalls`。

## Agent 协作规范

- **Issue 管理**：Issue 以本地 markdown 文件存储于 `.scratch/<feature-slug>/`。详见 `docs/agents/issue-tracker.md`。
- **Triage 标签**：五角色使用默认标签名：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。
- **领域文档**：单仓库上下文——根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。
