# 工具调用原始输出折叠：方案调研与选型

> 调研日期：2026-09-16 ｜ 证据类型：本机真实页面实测 + 官方产物源码 + 同类项目一手代码
> 结论：**改用「CSS 裁剪 + 幂等重扫」，放弃改写文本节点**。

## 一、问题现状

模型按扩展要求以 XML 输出工具调用，例如：

```
<doc_generate>{"title": "团队周报", "format": "html", "content": "<!DOCTYPE html>…（数百行）"}</doc_generate>
```

DeepSeek 官方前端把它当**普通 Markdown 段落**渲染，原文铺满屏幕。

### 实测数据（chat.deepseek.com）

| 会话 | 原文长度 | 渲染成 | 高度 |
|---|---|---|---|
| 团队周报HTML生成 | 4998 字符 | `<p class="ds-markdown-paragraph">` | 952px |
| 生成效率提升文档 | 1106 字符 | 同上 | 455px |
| 今日新闻日报 | 15884 字符 | 同上 | 4398px |

**关键结构事实**：整个工具调用（含 JSON 里的 HTML/Markdown 正文）被包进一个 `<p>`，内部是 `<span class="ds-markdown-html">` 与 `<span>` 交替片段。**它不是代码块**（无 `pre`/`md-code-block`），拿不到官方代码块自带的样式能力。

### 工具调用自成段落（决定折叠粒度）

对每个含工具标签的块做平衡扫描，算「工具区间」与「区间外文本」：

| 会话 | 块总长 | 工具区间数 | 区间外文本 |
|---|---|---|---|
| 今日新闻日报（第 1 条） | 326 | 4 | 仅折叠条文案 |
| 今日新闻日报（第 2 条） | 15914 | 1 | 仅折叠条文案 |
| 生成效率提升文档 | 1106 | 1 | 空 |

区间占比 0.89–0.998 → **折叠整个块 = 只藏工具调用，不会误伤正文**。

### 现实现的四个真实缺陷（实测）

1. **改写文本节点留垃圾**：15884 字符块被改写后留下 **575 个空文本节点 + 579 个 `display:none` 元素**。
2. **缺闭合标签就不折叠**：`findToolCallRegion` 要求 `</tag>`，但执行路径 `extractToolCalls` 允许省略（`sse-parser.ts:318` 注释明说「闭合标签可选，DeepSeek 有时省略」）。实测「生成效率提升文档」会话 `open:1 / close:0` → **零折叠**，455px 全展开。
3. **靠 1.2s 轮询维持**：官方重渲染会还原原文（实测切换会话后 `data-ds-fold` 属性丢失）。
4. **导出链路被迫耦合**：`chat-exporter.ts:633-651` 必须靠按钮文案正则反解工具名、清理 `display:none` 残留。

## 二、官方三种折叠机制（实测 + 官方产物源码）

### 1. 思考过程块（用户要对的标）

```
._74c0879                       ← 容器 position:relative
├── ._245c867._34a54ec          ← 标题行 sticky/top:0/z-index:7/height:34px/cursor:pointer
│   ├── .ds-icon (16px 品牌色)
│   └── span._5255ff8._4d41763  ← 「已思考（用时 3 秒）」16px
├── .c2b72bb8                   ← 装饰
├── .ds-think-content           ← 内容（收起时**整个节点不渲染**）
└── ._8f7678d                   ← 装饰
```

官方 JS（`main.2029023598.js`，一手核实）：

```js
(0,E.jsx)(pt,{messageId:n,sessionId:t,isShowDetail:i, ... onToggle:()=>{d(e=>{let t=!e; ...})}}),
(0,E.jsx)("div",{ref:u,className:pF.OC}), ...(i?l:[]).map(...)
```

**收起时内容是 `...(i?l:[])` —— 子片段根本不进 DOM**。实测：`thinkBefore: 75px` → 点击后 `node-missing` → 再点击 `node-present`。

→ 结论：**没有「collapsed 类名」可复用**，扩展无法借这套机制折叠自己的内容；但**视觉形态可复刻**。

### 2. 官方自己的长内容范式 = max-height 裁剪（重要）

同一份官方 JS，用户消息的折叠：

```js
(0,E.jsxs)(mq,{animateCollapse:!1,defaultCollapsed:!0,content:t,collapsedHeight:192,extraLineHeight:24,...
```

配套 CSS：

```css
.ds-collapsible-text{transition:max-height var(--dsl-collapsible-text-transition-duration) …;overflow:hidden}
```

→ **官方处理「内容过长」用的就是 `max-height` 裁剪（默认 192px）+ 渐隐 + 展开按钮**，不删文本、不改流。这与本方案同源。

### 3. 代码块

`.md-code-block` 只有顶栏（语言标签 + 复制/下载），`pre` 无 `max-height`（CSS 实测 `hasMaxHeightNearCode: false`）。官方代码块**不带折叠**。

### 4. 附：官方已存在「过程区」但用不上

官方 JS 有 `getCollapsibleAreaFragments`，收集 `THINK`/`TOOL_SEARCH`/`TOOL_OPEN`/`SEARCH`/`TIP` 片段类型。扩展注入的 XML 工具调用是 **RESPONSE 普通文本**，落不进这个区。要落进去只能伪造官方协议片段（见方案 B 的风险）。

## 三、候选方案对比

| 方案 | 是否动 React 节点 | 实测/证据 | 结论 |
|---|---|---|---|
| **A. CSS 裁剪 + 幂等重扫** | 否（只加属性/类） | 本机实测通过；6 个同类项目主流做法 | ✅ **推荐** |
| B. 改写 XHR/fetch 响应流 | 否 | 有真实项目（DeepSeek Anti-recall、Chat-DeMod） | ❌ 代价过高 |
| C. 复用官方思考块 DOM | 是 | 官方条件渲染，无类名可复用 | ❌ 不可行 |
| D. `<details>` / `content-visibility` | 否 | 官方 CSS 无 `details`/`summary` 样式；`content-visibility` 不提供交互 | ❌ 不合适 |

### 方案 A 实测结果（本机真实页面）

在不改任何文本节点的前提下，给工具调用所在 `<p>` 加属性 + 注入 CSS：

```css
[data-ds-fold] { position: relative; }
[data-ds-fold]:not([data-ds-fold-open]) { max-height: 34px; overflow: hidden; }
[data-ds-fold]:not([data-ds-fold-open]) > * { visibility: hidden; }
[data-ds-fold]:not([data-ds-fold-open])::before {
  content: attr(data-ds-fold-label);
  position: absolute; left: 0; top: 0; height: 34px; z-index: 3;
  display: flex; align-items: center; cursor: pointer;
  font-size: 13px; color: var(--dsw-alias-label-secondary, #61666b);
}
```

| 指标 | 结果 |
|---|---|
| 折叠前 → 后 | 455px → **34px** |
| 展开还原 | 455px（完全还原） |
| 15884 字符块折叠 | 4398px → **34px**，打标耗时 **0.2ms** |
| 虚拟列表 scrollHeight | 1091 → 919（正常收缩） |
| 折叠/展开时目标元素 `rectTop` | 467 → 467（**无跳动**） |
| 原文完整性 | 完整保留在 DOM（`scrollH: 455`） |

**优点**：
1. 不改文本节点 → 导出路径不再需要「反解按钮文案 + 清理 display:none 残留」。
2. 原文始终在 DOM → 复制、搜索、无障碍正常。
3. 幂等：重复打属性无副作用。
4. 性能远好于当前：打标 O(1)，不需要全量文本 TreeWalker 拼接。

**风险与对策**：

| 风险 | 实测/依据 | 对策 |
|---|---|---|
| React 重渲染抹掉属性 | 切换会话后属性消失 | MutationObserver 入队 + RAF 批量 + 幂等重打（业界标准） |
| `max-height` 对行内元素无效 | 工具调用落在 `<p>`（块级） | 已满足；打标前校验元素是块级 |
| 流式输出中途内容增长 | — | 属性一加即折叠，不依赖文本完整；无需「两轮稳定门」 |
| 折叠条按钮被官方内容盖住 | 官方 `.ds-markdown` 内容层级未知 | `::before` 设 `z-index: 3` + 子元素 `visibility: hidden`（实测有效） |
| 深浅色主题 | 官方变量 `--dsw-alias-*` | 按钮用官方变量，自动跟随主题 |

### 方案 B 为什么不推荐（尽管技术上可行）

- 有先例：DeepSeek Anti-recall 覆盖 `XMLHttpRequest.prototype.responseText` getter；Chat-DeMod 用 `ReadableStream` 重写 fetch。
- 但要同时接管：**生成流 + 历史消息 + 断线重连**（存在 `/api/v0/chat/resume_stream`），且要处理 chunk 边界（UTF-8 多字节/`\uXXXX` 转义可能被切开）、重放官方 `p`/`o`/`v` patch 协议。
- **会打断自家链路**：扩展的工具检测、导出缓存都依赖渲染后内容；响应层删掉 XML 后，必须另存一份原文，改动面远大于收益。
- 本机实测：当前架构的 XHR hook 只做旁路读取（`progress`/`load` 读 `responseText` 差分），从不回写。

### 方案 C 为什么不可行

官方思考块内容由 React `useState` 控制、收起时不渲染。扩展往 `.ds-think-content` 里塞东西，下一次重渲染即消失；官方也未暴露任何插入 API。

## 四、推荐落地方案（最小改动）

保留 `findToolCallRegion` 纯函数（可扩展为「闭合标签可选」），替换外围 DOM 操作：

| 环节 | 现在 | 改为 |
|---|---|---|
| 定位 | 1.2s 全量轮询 | MutationObserver 入队 + RAF 批量 + 首屏扫描 |
| 折叠 | 改写文本节点 + 清空 + `display:none` 祖先 + 插入自建 `<div>` | 给工具调用所在块加 `data-ds-fold` 属性 + 注入 CSS |
| 展开 | 自建 `<button>` + `<pre>` | 事件委托 + `data-ds-fold-open` 属性 |
| 幂等 | `[data-ds-collapse]` 跳过 | `data-ds-fold` 属性本身即幂等标记 |
| 缺闭合标签 | 不折叠 | 支持（复用 `extractToolCalls` 的平衡扫描逻辑） |
| 导出 | 反解按钮文案 + 清理残留 | 直接读 DOM 文本（原文完整）；折叠条只是 CSS 伪元素，不进 DOM |

**可以删除的代码**：`hideEmptyAncestors`、`buildToolCallBar`、`TextSeg` 相关改写逻辑、`chat-exporter.ts:642-651` 的空元素清理。

**需要保留的**：`SKIP_SUBTREE_SELECTOR`（跳过思考区/工具块）、助手气泡判定、`toolNames` 标签表。

## 五、已定决策（2026-09-16，用户拍板）

| 问题 | 决定 | 依据 |
|---|---|---|
| 折叠范围 | **工具调用块 + 长代码块统一用新方案**（`max-height` 裁剪），一处逻辑管两类 | 现有代码块折叠已是裁剪式，合并后减代码 |
| 折叠条文案 | **贴近官方视觉**（12–13px 灰字、无边框、跟「已思考」同调），但文案仍写明是工具调用 | 官方标题行 `._5ab5d64{color:var(--dsw-alias-label-secondary)}` |
| 折叠阈值 | **一律折叠**，不设长度门槛 | 工具调用对用户无阅读价值；实测最短的只有 23 字符 |
| 折叠时机 | **边输出边折叠** | 流式一出现 `<tag>` 即折，从第一秒就不刷屏 |
| 混排边界 | **块内除工具调用外还有正文时，不折叠**（保守） | 实测 8 会话 10 个块，区间外正文全为 0，几乎不触发 |

### 「复制」不受影响（已查实）

官方源码（`main.2029023598.js`）：

```js
sd=(e,t)=>{let n=F.L.getState().getMessage(e,t); if(!n) return ""; var r=ss(n)||""; ...},
...
onCopy:()=>{ aw(s.messageBody.getCopyContent()), T.y.tracker.info({name:"copyBotResponse", ...}) }
```

`onCopy` 取的是**消息数据模型**（store），不走 DOM。CSS 裁剪方案把原文完整留在 DOM 里，即使官方哪天改成读 DOM 也不受影响。

### 折叠粒度：按「区间是否覆盖整块」判定

实测补充（8 个真实会话，10 个工具调用块）：

| 会话 | 块内工具区间外正文长度 |
|---|---|
| 今日新闻日报 / GitHub热门项目搜索 / 科技头条搜索 / 今日热门新闻汇总 / AI行业新闻搜索 / 今日热门新闻搜索 / AI新闻搜索 | **0** |

→ 判定规则：块内所有工具调用区间拼接后，若「区间外文本」为空（或仅空白/折叠条残留），则折叠整块；否则不折。

### 已排除

- ~~复用官方思考块 DOM~~：官方收起时内容不渲染，无类名可复用。
- ~~改写 XHR/fetch 响应~~：需同时接管生成流 + 历史 + 重连，且打断自家检测与导出链路。
