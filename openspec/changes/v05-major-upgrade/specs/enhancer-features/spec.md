## ADDED Requirements

### Requirement: Wide Screen Mode
聊天区域自适应填充窗口宽度。

#### Scenario: 启用宽屏模式
- **WHEN** 用户在面板中开启宽屏模式
- **THEN** 消息区域宽度从固定值改为 `flex: 1 1 auto` + `max-width: none`
- **AND** 消息左右 padding 保持不变（不影响可读性）

#### Scenario: 禁用宽屏模式
- **WHEN** 用户关闭宽屏模式
- **THEN** 恢复 DeepSeek 默认的消息区宽度

### Requirement: Background Color Themes
10 套预设背景色主题，跟随暗色/亮色模式。

#### Scenario: 切换主题
- **WHEN** 用户在面板中切换背景色主题
- **THEN** 聊天区、侧边栏背景色按预设值变更
- **AND** 暗色模式下自动使用暗色组预设（Claude深/Cat深/Dracula深/OneHalf深）
- **AND** 亮色模式下自动使用亮色组预设（Claude浅/Cat浅/Dracula浅/OneHalf浅）

#### Scenario: DeepSeek 主题切换时自动跟随
- **WHEN** DeepSeek 页面从亮色切换到暗色（或反之）
- **THEN** 背景色主题自动切换到对应暗色/亮色组
- **AND** 设置状态持久化到 chrome.storage.local

### Requirement: Scrollbar Hiding
可选择隐藏聊天区滚动条。

#### Scenario: 开启隐藏滚动条
- **WHEN** 用户开启隐藏滚动条
- **THEN** `::-webkit-scrollbar { display: none }` + `scrollbar-width: none` 覆盖到消息列表容器

### Requirement: Input Auto-Hide
输入框在鼠标不在底部区域时自动下移隐藏。

#### Scenario: 鼠标远离底部
- **WHEN** 鼠标位置距离窗口底部 > 120px
- **THEN** 输入框 `transform: translateY(65%)` 下移，露出半边
- **AND** 鼠标靠近底部 (< 120px) 时恢复原位

### Requirement: Voice Input
通过 Web Speech API 实现语音输入。

#### Scenario: 开始录音
- **WHEN** 用户点击输入框右下角的麦克风按钮
- **THEN** 浏览器请求麦克风权限
- **AND** 开始语音识别（中文）
- **AND** 麦克风按钮变为录音中状态（脉冲动画）

#### Scenario: 语音转文字
- **WHEN** 用户说话
- **THEN** 识别结果实时显示在输入框中
- **AND** 使用 `nativeSetter` + `dispatchEvent('input')` 写入 React textarea

#### Scenario: 浏览器不支持
- **WHEN** 浏览器不支持 Web Speech API
- **THEN** 不显示麦克风按钮
- **AND** 面板中语音输入选项标记为不可用
