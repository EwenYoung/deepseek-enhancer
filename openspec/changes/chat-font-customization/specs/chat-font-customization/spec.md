## ADDED Requirements

### Requirement: 字体预设选择
系统 SHALL 提供 3 个正文字体预设（Sarasa Gothic、Microsoft YaHei、Noto Sans SC）和 3 个代码字体预设（JetBrains Mono、Fira Code、Cascadia Code）供用户选择。默认状态下不注入任何字体样式，保持 DeepSeek 原生字体。

#### Scenario: 用户选择正文字体
- **WHEN** 用户在字体设置下拉中选择一个正文字体
- **THEN** 系统 SHALL 加载对应字体文件并注入 CSS 覆盖聊天界面的正文字体

#### Scenario: 用户选择代码字体
- **WHEN** 用户在字体设置下拉中选择一个代码字体
- **THEN** 系统 SHALL 加载对应字体文件并注入 CSS 覆盖聊天界面的代码字体

#### Scenario: 用户选择默认字体
- **WHEN** 用户在下拉中选择"默认"
- **THEN** 系统 SHALL 移除对应的字体 CSS 注入，恢复 DeepSeek 原生字体

### Requirement: CDN 字体加载
系统 SHALL 从 jsDelivr CDN 动态加载字体文件，每个字体下载 Regular (400) 和 Bold (700) 两个字重。加载失败时静默回退到默认字体，不影响聊天功能。

#### Scenario: 字体加载成功
- **WHEN** 用户选择字体且 CDN 资源可用
- **THEN** 系统 SHALL 通过 `@font-face` 注册字体并应用于聊天界面

#### Scenario: 字体加载失败
- **WHEN** CDN 资源不可用或网络错误
- **THEN** 系统 SHALL 静默保持当前字体，不显示错误提示

### Requirement: 字体预加载
面板打开时，系统 SHALL 对用户当前选择的字体创建 `<link rel="preload">` 标签，预加载字体文件到浏览器缓存。

#### Scenario: 面板初始化时预加载
- **WHEN** 增强功能面板打开且用户已选择非默认字体
- **THEN** 系统 SHALL 在页面中注入 preload 标签提前下载字体文件

### Requirement: UI 可折叠交互
字体设置 SHALL 在增强功能卡片中以可折叠区域形式呈现，默认折叠。展开后显示"正文字体"和"代码字体"两个下拉选择器。

#### Scenario: 折叠状态切换
- **WHEN** 用户点击"字体设置"折叠行
- **THEN** 系统 SHALL 展开或收起字体选择区域

#### Scenario: 下拉选择器交互
- **WHEN** 字体选择区域已展开
- **THEN** 用户 SHALL 看到两个独立的 `<select>` 下拉选择器，分别用于正文字体和代码字体

### Requirement: 配置持久化
字体选择 SHALL 通过 `chrome.storage.local` 持久化，扩展 `EnhancerConfig` 接口。页面刷新或扩展重启后重新应用已选字体。

#### Scenario: 保存字体选择
- **WHEN** 用户在下拉中选择一个字体
- **THEN** 系统 SHALL 将选择保存到 `chrome.storage.local`

#### Scenario: 恢复字体选择
- **WHEN** 页面加载且用户之前已选择非默认字体
- **THEN** 系统 SHALL 自动加载并应用已选字体
