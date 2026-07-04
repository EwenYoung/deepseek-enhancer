## Why

当前 DeepSeek Chat 界面使用系统默认字体，用户无法自定义。提供一个字体选择功能让用户自行替换聊天界面的正文字体和代码字体，提升阅读体验和个性化程度。

## What Changes

- 新增「字体设置」可折叠区域，位于增强功能面板的背景主题下方
- 提供 3 个正文字体预设和 3 个代码字体预设供用户选择
- 通过 CDN 动态加载字体文件（jsDelivr），支持 Regular + Bold 字重
- 字体选择后通过 CSS `@font-face` + `font-family` 注入聊天界面
- 配置持久化到 `chrome.storage.local`
- 面板打开时预加载字体资源，减少切换延迟

## Capabilities

### New Capabilities
- `chat-font-customization`: 聊天界面字体替换功能，包括正文字体和代码字体的独立选择、CDN 字体加载、CSS 注入和配置持久化

### Modified Capabilities
<!-- No existing spec changes -->

## Impact

- **修改文件**: `src/core/enhancer-features.ts`（字体逻辑）、`src/core/ui-panel.ts`（UI 交互）
- **外部依赖**: jsDelivr CDN（字体文件加载），6 个字体各 2 字重，无新增 npm 依赖
- **存储**: 扩展 `EnhancerConfig` 接口，新增 `chatFont` 和 `chatMonoFont` 字段
