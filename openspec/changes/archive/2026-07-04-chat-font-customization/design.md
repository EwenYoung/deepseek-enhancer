## Context

DeepSeek Enhancer 是一个 Chrome 扩展，通过注入 CSS 和 JavaScript 到 DeepSeek Chat 页面来增强其功能。当前增强功能面板提供宽屏模式、背景主题、滚动条隐藏、输入框自动隐藏、语音输入和 Token 速度显示等开关。

用户希望新增字体自定义功能，能够替换聊天界面的正文字体和代码字体。字体来源使用 CDN（jsDelivr），不打包进扩展以减少体积。

## Goals / Non-Goals

**Goals:**
- 用户可从 3 个正文字体和 3 个代码字体预设中选择
- 字体通过 jsDelivr CDN 动态加载，支持 Regular (400) + Bold (700) 字重
- UI 使用可折叠区域（B 方案），位于增强功能卡片中
- 配置持久化到 `chrome.storage.local`
- 面板打开时预加载字体资源

**Non-Goals:**
- 不支持用户自定义输入任意字体名（仅预设列表）
- 不支持上传本地字体文件
- 不支持调整字体大小（仅字体替换）
- 不影响导出功能中的字体

## Decisions

### 字体列表
正文字体：`Sarasa Gothic`（更纱黑体）、`Microsoft YaHei`（微软雅黑）、`Noto Sans SC`（思源黑体）
代码字体：`JetBrains Mono`、`Fira Code`、`Cascadia Code`

### CDN 来源
使用 jsDelivr，国内有 CDN 节点，访问稳定。字体文件路径格式：
- `https://cdn.jsdelivr.net/npm/@fontsource/<package>/files/<file>.woff2`

### CSS 注入策略
通过 `@font-face` 定义自定义字体族名（避免与系统字体冲突），然后使用现有 `applyCSS()` 机制覆盖聊天区域的 `font-family`。

定义名：`--ds-chat-font`（正文）、`--ds-chat-mono-font`（代码）

选择器范围：DeepSeek 聊天区域的文字元素。正文覆盖 `body` 或 `#root` 级别的 `font-family`，代码覆盖 `code`、`pre`、`.ds-markdown code` 等选择器的 `font-family`。

### 数据模型
扩展 `EnhancerConfig` 接口：
```ts
interface EnhancerConfig {
  // ... 现有字段
  chatFont: string;     // '' = 默认, 'sarasa', 'yahei', 'noto-sans'
  chatMonoFont: string; // '' = 默认, 'jetbrains', 'fira', 'cascadia'
}
```

### UI 交互
可折叠区域（默认折叠），点击"字体设置"行展开，内含两个 `<select>` 下拉选择器。利用原生 `<select>`，无需自定义下拉组件。

### 预加载
面板初始化时，对已选字体（和对应的 Bold 变体）创建 `<link rel="preload" as="font" crossorigin>` 标签进行预加载。用户切换字体时，新字体即时加载（已在缓存中）。

## Risks / Trade-offs

- **FOUT（字体闪烁）**: CDN 字体加载前页面显示默认字体。预加载可缓解，但不可完全消除。如果用户网络慢，首次使用预设字体的页面加载会有短暂闪烁
- **jsDelivr 可用性**: 依赖第三方 CDN，极端情况下可能不可用。字体加载失败时静默回退到默认字体，不影响聊天功能
- **字体文件大小**: 每个字体 ~2 MB（单字重），6 个字体各 2 字重共 ~24 MB 流量。用户只在选择字体时下载所选字体，不会一次性下载全部
