# deepseek-enhancer

Chrome MV3 扩展（WXT + TypeScript），增强 chat.deepseek.com：拦截 XHR 向 prompt 注入工具定义与技能，驱动 Agent 多步循环；附带主题、会话分类、导出等 UI 增强。

## `if=` 触发规则

<important if="你准备修改代码、测试或文档">
**编码规范**：先读 [docs/CLEAN-CODE.md](docs/CLEAN-CODE.md)；其中未加限定的规则一律按 MUST 执行。
</important>

<important if="你准备提交改动">
**提交门槛**：依次过 `pnpm typecheck` → `pnpm lint` → `pnpm format:check`；format 失败跑 `pnpm format` 后重新 add。Commit 信息用中文 conventional commits（`feat:` / `fix:` / `chore:` + 一句话描述）。
</important>

<important if="你正在执行破坏性 git 命令：reset --hard、clean -fd、branch -D、push --force">
**破坏性 git 操作**：执行前先向用户展示会丢失的内容，确认后再继续。
</important>

<important if="你正在用 chrome-devtools-mcp 调试">
**用完即断**：任务结束前执行 `chrome-devtools stop`，并确认无残留进程（`Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'chrome-devtools' }` 为空，含 telemetry watchdog 孤儿进程）；残留会干扰其他调试任务。
</important>

## 参考文档

- **[docs/CONTEXT.md](docs/CONTEXT.md)（术语表，长期维护）**——命名或行文涉及领域概念时以它为准：拦截（Hook）、增强（Augment）、工具（Tool）、技能（Skill）、面板（Panel）、工具结果块（Tool Blocks）。任务收尾时回查：出现新概念就补录，重命名或含义变化就同步该表。
- **[docs/adr/](docs/adr/)（架构决策记录）**——涉及已有架构决策时查这里。

## 开发工作流

每次代码改动按序走完五步，每步满足完成条件再进下一步：

1. **编码**——实现功能或修复。
2. **补测试**——可自动化的纯逻辑（SSE 解析、上下文构建、技能导入解析、导出包装、storage CRUD）在 `src/core/__tests__/` 补充或更新测试；DOM 重依赖或网络拦截层（ui-panel、ui-tool-blocks、ui-autocomplete、ui-categories、artifact、fetch-hook、main-xhr-inject）说明原因后跳过。完成条件：每处可测的行为变更都有对应测试。
3. **全量测试**——`pnpm test` 全绿才算完成；失败修复代码或更新测试（预期行为已变时）。
4. **构建**——`pnpm build` 成功产出 `dist/chrome-mv3/`。
5. **人工验证**——在 `chrome://extensions`（开发者模式 → 加载已解压的扩展程序 → 选 `dist/chrome-mv3/`）重新加载后，由用户在 chat.deepseek.com 验证：各主题视觉、Agent 端到端工具调用、SPA 导航后状态保持。完成条件：用户明确确认验证通过。

**提交时机**：代码停在未提交状态，直到第 5 步完成（用户确认）；期间用户要求修改则回到第 1 步。

## 环境

- 包管理器一律用 **pnpm**（由 corepack 管理；package.json 无 packageManager 字段）。

## 代码检索

定位代码**先搜后读**，用 **vera**（本地索引，索引在 `.vera/`，不入库）：

- 问"XX 在哪 / 怎么实现 / 谁调用 / 如何工作"：`vera search "<行为描述>"` 或 `vera references <符号>`；命中是线索不是结论，引用前打开 `path:line` 确认。
- 精确字符串或正则：`vera grep`；已知确切路径直接打开文件，不必绕 vera。
- 代码改动后跑 `vera update .` 刷新索引；报 `no index found` 时先 `vera index .` 重建。

## 架构：三层运行时

| 层 | 文件 | 职责 |
|---|---|---|
| MAIN（页面上下文） | `src/entrypoints/main-world.content.ts` + `src/core/main-xhr-inject.ts`（IIFE 以字符串注入页面） | XHR 拦截、prompt 增强、SSE 流解析 |
| Isolated（content script） | `src/entrypoints/content.ts` | UI 管理、工具执行、事件协调 |
| Background（Service Worker） | `src/entrypoints/background.ts` | Tavily API 代理 |

- MAIN ↔ Isolated：`window.postMessage`，`source` 标记 `DS_MINI_MAIN` / `DS_MINI_ISOLATED`。
- Isolated ↔ Background：`chrome.runtime.sendMessage`。

**Agent 循环**（每轮走完 1-6 后页面发起新 XHR 重入，直至模型自然回复）：
1. 拦截 `XMLHttpRequest.send`，向请求体注入工具定义；
2. 解析 SSE 流，检出 `<web_search>{…}</web_search>` 等工具标记；
3. `postMessage` 通知 Isolated 层；
4. Background 调 Tavily API 取结果；
5. `domSubmitText()`（填 textarea + 点发送按钮）提交结果；
6. 页面发起新 XHR，回到第 1 步；模型自然回复时循环终止。

**关键模式**（改动这几块前先对号入座）：
- SSE 流缓冲挂 `xhr.__ds_buf`，按 XHR 实例隔离，避免并发污染；
- `/` 自动补全用 `ignoreNextInput` 标记，应对 React 18 重渲染；
- 从 DOM 活跃类 `_31a22b0` 读取当前模式，决定注入的工具范围；
- 主题与品牌色逻辑集中在 `enhancer-features.ts`。

## 经验教训

<!-- retro-managed-start -->
<!-- retro:escalated 完整版见 .retro/INDEX.md，满 12 条时用 retro.py escalate --demote 降级最旧条目 -->
- 元素级 CSS 变量声明永远赢过继承，html 内联覆盖无效；合成值拆成独立低层变量（如 --panel-alpha）下发 [20260824-001]
- ink 深色下 --accent/--danger 是浅色，按钮文字一律 var(--accent-text,#fff)，写死 #fff 不可读 [20260824-002]
- 导出助手回复是双数据源：原始 markdown 缓存只覆盖本页会话，历史会话走已渲染 DOM 提取+白名单净化 [20260824-009]
- 视觉/布局结论以计算样式+几何测量为准，DOM 顺序不代表视觉方位 [20260824-011]
- 用户报障先读真实产物（导出文件/页面实测）再动代码，别只凭代码印象或自验通过下结论 [20260824-012]
- 注入 CSS 验证效果先查目标元素 transition：立即读 computed style 会撞上过渡起始帧 [20260824-015]
- storage 配置读取一律 {...DEFAULT_CONFIG, ...存储值} 合并默认值，勿用 || 兜底；备份导入缺键回填 [20260824-005]
- 官方新组件元素级变量不走 dsw-alias 链，须同级覆盖含整个子树 [20260824-003]

- 哈希类名由官方构建生成，随部署无通知变化 [20260824-016]

- 改主题色优先覆盖 --dsw-alias-* 变量链，派生态写死的品牌色一并覆盖 [20260824-017]
<!-- retro-managed-end -->

完整经验库在 **[.retro/](.retro/INDEX.md)**（脚本生成索引，条目在 `.retro/entries/`、原始摘录在 `.retro/log/`）：排查卡壳先查其 INDEX；会话收尾沉淀用 /retro 技能，跑 `retro.py check` 校验一致性。
