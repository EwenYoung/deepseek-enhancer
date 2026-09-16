# Review 补记：collapse-001 点击委托失效（真实页面验证发现）

审查人：主会话（端到端页面验证）｜ 日期：2026-09-16 ｜ 结论：**已修复**

## 问题（P1，blocking）

**现象**：新构建加载后，折叠正常生效（34px），但**点击标签行无法展开**。

**定位过程**（真实页面事件探测）：

| 探测 | 结果 |
|---|---|
| 块自身绑冒泡监听 | 收到事件（`block-bubble`） |
| `.ds-message` / `.ds-virtual-list` 冒泡监听 | 收到事件 |
| `#root` 冒泡监听 | 收到事件（`root:block`） |
| `document` 冒泡监听 | **收不到** |
| `document` 捕获监听 | 收到（`phase: 1`） |

**根因**：官方页面在 `#root` 内部对气泡点击调用了 `stopPropagation()`，事件冒泡到 `#root` 后不再向上传递。而 `initCollapse` 把委托绑在 `document` 冒泡阶段（`ui-collapse.ts:179` 原实现），因此永远收不到点击。

**影响**：折叠块只能看、不能展开——功能等于半残。

## 修复

`src/core/ui-collapse.ts:179` 改为捕获阶段委托：

```ts
// 用捕获阶段委托：官方在 #root 内部对气泡点击调用 stopPropagation，冒泡阶段的
// 监听器（含绑在 document 上的）收不到事件，只有捕获阶段能先于它命中
document.addEventListener('click', onFoldClick, true);
```

同时把 `onDocumentClick` 改名为 `onFoldClick`（不再是 document 冒泡语义）。

**选择捕获而非绑 `#root` 的理由**：捕获阶段同样能收到（实测 `phase: 1`），且不依赖 `#root` 节点稳定存在；改动只有一行。

## 修复后验证（真实页面，捕获阶段方案预演 + 重新构建）

| 检查项 | 结果 |
|---|---|
| 折叠态高度 | 34px |
| 点击展开 | 489px，`data-ds-fold-open` 存在，原文 1106 字符完整 |
| 标签文案随态切换 | `▸ 工具调用 doc_generate` ↔ `▾ 工具调用 doc_generate` |
| 再次点击收起 | 34px，`data-ds-fold-open` 移除，文案回 `▸` |

## 检查

```
pnpm test          347 passed (18 files)
pnpm typecheck     无输出
pnpm lint          无输出
pnpm format:check  All matched files use Prettier code style!
pnpm build         成功
```

## 教训

`docs/notes/tool-call-collapse-research.md` 与任务文件都假定「`document` 上的事件委托可用」。真实页面存在 `stopPropagation`，**DOM 层结论必须实测，不能靠推断**——这正是仓库 AGENTS.md 工作流第 5 步「人工验证」要拦的东西，本次由自动化页面验证提前拦下。
