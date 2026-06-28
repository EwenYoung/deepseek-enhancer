# deepseek-enhancer 开发计划

## 项目概述

在 DeepSeek 网页端 (chat.deepseek.com) 通过 Chrome 扩展实现精简版工具调用和技能系统。

## 需求确认清单

| 需求项 | 决策 |
|--------|------|
| 目标浏览器 | Chrome MV3 |
| 工具 - web_search | ✅ 保留 |
| 工具 - web_fetch | ✅ 保留 |
| 工具 - artifact（产出物下载）| ✅ 保留 |
| 工具 - MCP/Shell/Python/浏览器控制 | ❌ 砍掉 |
| Skill - 内置技能 | ✅ 保留 |
| Skill - GitHub 导入 | ✅ 保留 |
| Skill - 本地文件夹导入 | ✅ 保留 |
| Skill - 用户自定义 | ✅ 保留（在浮层面板中编辑）|
| Agent 循环 | 单次循环（调用一次工具后停止）|
| System prompt 注入方式 | 用户消息前置拼接（方式二）|
| UI - Skill 选择器 | 输入 `/` 弹出自动补全 |
| UI - Skill 管理 | 浮层面板（从右侧滑出）|
| UI - 工具调用结果 | 聊天流中折叠块展示 |
| 记忆系统 | ❌ 砍掉 |
| 自动化任务 | ❌ 砍掉 |
| 对话导出 | ❌ 砍掉 |
| 宠物挂件 | ❌ 砍掉 |
| 项目上下文 | ❌ 砍掉 |

---

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│  chat.deepseek.com                                   │
│  ┌───────────────────────────────────────────────┐  │
│  │  原始 DeepSeek 页面                            │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  聊天输入框                              │  │  │
│  │  │  - /autocomplete 下拉                    │  │  │
│  │  │  - 用户输入 → 前置拼接工具/技能上下文      │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  聊天消息流                              │  │  │
│  │  │  - 工具调用折叠块                        │  │  │
│  │  │  - artifact 下载按钮                     │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  浮层面板 (右侧滑出)                     │  │  │
│  │  │  - Skill 列表 / 创建 / 编辑 / 删除       │  │  │
│  │  │  - GitHub 导入 / 本地导入                │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  注入层 (Content Script)                             │
│  ┌───────────────────────────────────────────────┐  │
│  │  fetch-hook.ts      ← 拦截聊天 API 请求        │  │
│  │  sse-parser.ts      ← 解析 SSE 流式响应        │  │
│  │  tool-executor.ts   ← 执行 web_search/fetch    │  │
│  │  artifact.ts        ← 渲染下载按钮             │  │
│  │  skill-registry.ts  ← Skill CRUD              │  │
│  │  skill-importer.ts  ← GitHub/本地导入          │  │
│  │  inject-context.ts  ← 拼接工具/技能上下文       │  │
│  │  ui-*.ts            ← UI 注入层                │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 核心数据流

```
用户输入 "/web-search 今天新闻"
         │
         ▼
  skill-registry 解析 / 命令 → 匹配 skill instructions
         │
         ▼
  inject-context 拼接:
    "[工具定义 XML schema]
     [Skill instructions]
     ---
     用户: 今天新闻"
         │
         ▼
  fetch-hook 拦截请求 → 修改最后一条 user message content
         │
         ▼
  DeepSeek API ← 发送修改后的请求
         │
         ▼
  SSE 流式响应 → sse-parser 解析
         │
         ├── 普通文本 → 页面正常渲染
         │
         └── 工具调用 XML (<web_search>...</web_search>)
                │
                ▼
           tool-executor 执行
                │
                ▼
           结果折叠块渲染在聊天流中
                │
                ▼
           自动回注结果到对话（单次循环）
```

---

## 项目结构

```
deepseek-enhancer/
├── package.json
├── wxt.config.ts              # WXT 框架配置
├── tsconfig.json
├── entrypoints/
│   └── content.ts             # Content Script 入口，组装所有模块
├── core/
│   ├── fetch-hook.ts          # 拦截 fetch，拼接上下文
│   ├── sse-parser.ts          # 解析 SSE 流，提取工具调用
│   ├── tool-executor.ts       # web_search + web_fetch 执行
│   ├── artifact.ts            # 产出物下载按钮
│   ├── skill-registry.ts      # Skill 增删改查 + 持久化
│   ├── skill-importer.ts      # GitHub / 本地 SKILL.md 导入
│   ├── skill-builtin.ts       # 内置技能定义
│   ├── inject-context.ts     # 构建工具定义 + skill 指令文本
│   ├── ui-autocomplete.ts    # / 触发自动补全下拉
│   ├── ui-panel.ts           # 浮层管理面板
│   ├── ui-tool-blocks.ts     # 工具调用结果折叠块
│   └── types.ts              # 共享类型定义
├── public/
│   └── icons/                # 扩展图标
└── tests/                    # 单元测试（Vitest）
```

## 模块设计

### 1. fetch-hook.ts — 请求拦截

```typescript
// 核心逻辑
hookFetch(config) {
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    if (isChatAPIRequest(input)) {
      const body = JSON.parse(init.body);
      // 找到最后一条 user 消息
      const lastUserMsg = findLastUserMessage(body.messages);
      // 前置拼接工具定义 + skill 指令
      lastUserMsg.content = buildContextPrefix(tools, activeSkill) + lastUserMsg.content;
      init.body = JSON.stringify(body);
    }
    return originalFetch.call(window, input, init);
  };
}
```

### 2. sse-parser.ts — SSE 流式解析

- 复用 deepseek-pp 的解析逻辑，只保留核心 SSE chunk 分割和文本提取
- 正则匹配工具调用 XML 标签：`<tool_name>{"param":"value"}</tool_name>`

### 3. tool-executor.ts — 工具执行

- **web_search**: 调用搜索 API（DuckDuckGo 或 SearXNG），返回标题+摘要
- **web_fetch**: `fetch(url)` 抓取页面，提取 `<body>` 文本内容
- **artifact**: 不执行，交给 artifact.ts 渲染 UI

### 4. artifact.ts — 产出物下载

- 监听模型回复中的代码块（```）
- 解析文件标记（`// filename: xxx`）
- 渲染下载按钮，支持单文件下载和 .zip 打包（Browser 原生 API）

### 5. skill-registry.ts — 技能管理

- 技能数据结构：`{ id, name, description, instructions, source: 'builtin'|'github'|'local'|'custom', metadata }`
- 增删改查 + Chrome Storage 持久化
- 唯品名 + `/` 前缀匹配

### 6. skill-importer.ts — 技能导入

- **GitHub**: 输入 repo URL → 调用 GitHub API 或 raw URL 拉取 `SKILL.md`
- **本地**: 通过 `<input type="file">` 读取 `.md` 文件
- 解析 markdown frontmatter（name, description）

### 7. inject-context.ts — 上下文构建

- 动态生成工具定义 XML（供模型理解可用工具）
- 拼接激活的 skill instructions
- 返回单段文本，prepend 到用户消息

### 8. UI 层 (ui-*.ts)

| 模块 | 功能 |
|------|------|
| `ui-autocomplete.ts` | 输入 `/` 时弹出 skill 列表，键盘上下选择，回车确认 |
| `ui-panel.ts` | 右侧滑出面板，skill 管理 CRUD + 导入 |
| `ui-tool-blocks.ts` | 在聊天流中检测并隐藏原始工具调用文本，替换为折叠结果块 |

---

## 开发阶段

### Phase 1: 骨架搭建 (1-2h)
- [x] 初始化 WXT 项目 `npx wxt init`
- [ ] 创建 content script 入口
- [ ] 搭建目录结构
- [ ] 类型定义 (`types.ts`)

### Phase 2: 核心拦截层 (2-3h)
- [ ] `fetch-hook.ts` — fetch 拦截 + 消息前置注入
- [ ] `sse-parser.ts` — SSE 流式解析 + 工具调用 XML 检测
- [ ] 端到端验证：正常聊天不受影响

### Phase 3: 工具执行 (2-3h)
- [ ] `tool-executor.ts` — web_search + web_fetch
- [ ] `artifact.ts` — 代码块下载按钮
- [ ] `ui-tool-blocks.ts` — 折叠结果块 UI
- [ ] 单次循环：检测 → 执行 → 回注

### Phase 4: Skill 系统 (3-4h)
- [ ] `skill-builtin.ts` — 内置技能
- [ ] `skill-registry.ts` — CRUD + 持久化
- [ ] `skill-importer.ts` — GitHub + 本地导入
- [ ] `ui-autocomplete.ts` — `/` 自动补全
- [ ] `ui-panel.ts` — 浮层管理面板

### Phase 5: 集成测试 (1-2h)
- [ ] 完整流程测试
- [ ] 边界情况处理（空结果、超时、格式错误）
- [ ] 构建打包

---

## 风险与应对

| 风险 | 应对 |
|------|------|
| DeepSeek API 请求格式变更 | hook 层做 try-catch，失败时降级为原始请求 |
| API 速率限制 | 单次循环降低请求频率，加入请求间隔（2-3s）|
| SSE 格式变化 | 正则解析不做严格校验，匹配失败不影响正常聊天 |
| GitHub API 频率限制 | 缓存已导入的 skill，只在用户手动刷新时重新请求 |

---

## 不做事项 (YAGNI)

- 不做 sidepanel/options 页面 — 全部用注入 UI
- 不做 background service worker — content script 自给自足
- 不做对话持久化/导出
- 不做多语言 — 只用中文
- 不做自动化调度
- 不做记忆系统
- 不做项目上下文
