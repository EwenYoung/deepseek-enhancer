# 统一请求拦截与增强术语

决定将请求拦截至上下文注入的流程统一为两个阶段术语：**Hook（拦截）** 和 **Augment（增强）**，退役 `Inject` 一词及相关文件名。

## 背景

代码中存在三个语义重叠的词描述同一流程：
- **Hook** — `hookFetch()`、XHR `send` 拦截
- **Inject** — `inject-context.ts`、`buildInjectionContext()`
- **Augment** — `augmentRequestBody()`、`augmentPrompt()`

其中 `Inject` 和 `Augment` 均指"在原始请求体中插入内容"，造成概念冗余。

## 决定

1. 整个流程只用两个词：**Hook → Augment**
2. `inject-context.ts` 更名为 `context-builder.ts`，导出函数 `buildInjectionContext()` 更名为 `buildContext()`
3. `Inject` 不再作为代码中的术语使用

## 理由

- **Inject** 在安全语境中有特定含义（prompt injection / 提示词注入），使用该词容易造成误导——我们的操作不跨越信任边界，本质是"增强"而非"注入"
- 缩减为两个阶段降低认知负担：Hook 只做拦截，Augment 只做内容组装与插入
