## 1. 数据模型

- [x] 1.1 扩展 `EnhancerConfig` 接口，新增 `chatFont` 和 `chatMonoFont` 字段（默认空字符串表示不注入）
- [x] 1.2 在 `getConfig()` 默认值中包含新字段

## 2. 字体加载

- [x] 2.1 定义字体元数据（名称、CDN URL、Regular/Bold 文件路径）
- [x] 2.2 实现 `loadFont()` 函数：创建 `<link rel="preload">` 标签预加载字体文件
- [x] 2.3 实现 `applyFontCSS()` 函数：注入 `@font-face` 定义 + `font-family` 覆盖 CSS

## 3. 字体 CSS 注入

- [x] 3.1 实现 `applyChatFont(key)` 函数：为正文选择器注入 `font-family: 'ds-chat-font'` CSS
- [x] 3.2 实现 `applyChatMonoFont(key)` 函数：为代码块选择器注入 `font-family: 'ds-chat-mono-font'` CSS
- [x] 3.3 实现 `removeFontCSS(type)` 函数：移除指定类型的字体 CSS 注入
- [x] 3.4 注册到 `loadEnhancerFeatures()` 的初始加载流程中

## 4. UI 交互

- [x] 4.1 在面板 HTML 模板的增强功能卡片中添加"字体设置"可折叠行
- [x] 4.2 实现折叠/展开交互逻辑
- [x] 4.3 添加正文字体和代码字体的 `<select>` 下拉选择器
- [x] 4.4 绑定选择器的 `change` 事件，触发字体加载和应用
- [x] 4.5 面板初始化时从存储恢复已选字体状态
