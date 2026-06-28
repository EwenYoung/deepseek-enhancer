# DeepSeek DOM Structure Reference

## Layout Hierarchy
```
#root (1552px+)
  └─ cb86951c (1552px, position:absolute, overflow:hidden)
      └─ c3ecdb44 (1552px, overflow:visible)
          ├─ dc04ec1d (261px) — 侧边栏（历史会话列表）
          └─ _7780f2e (1291px) — 聊天面板 (data-ds-chatpanel)
              ├─ _2be88ba (1291px, height:60px) — 顶部 header
              │   └─ _1aa2651 the-header (display:none) — 隐藏头部按钮容器
              └─ _765a5cd (1291px, flex, overflow:hidden) — 主内容区
                  ├─ ds-virtual-list ds-virtual-list--printable (1291px)
                  │   └─ ds-virtual-list-items — 消息列表
                  │       └─ ds-message — 单条消息
                  │           ├─ d29f3d7d — 用户消息
                  │           └─ ds-assistant-message-main-content — AI 回复
                  │               └─ ds-markdown
                  │                   └─ ds-scroll-area (宽度可能被 CSS-in-JS 固定)
                  └─ _871cbca (1227px) — 输入区域外层
                      └─ aaff8b8f (776px)
                          └─ _77cefa5 _3d616d3 (776px, flex)
                              └─ _020ab5b (775px)
                                  ├─ _24fad49 (775px) — textarea 容器
                                  │   └─ textarea._27c9245 (775px, ds-scroll-area)
                                  │       placeholder: "给 DeepSeek 发送消息"
                                  └─ ec4f5d61 (775px) — 按钮栏容器
                                      └─ bf38813a (78px) — 按钮容器
                                          └─ ds-button.f02f0e25 (34x34, x=1204, y=816)
                                              ├─ ds-button__background (position:absolute) — 装饰层（CSS-in-JS 控制颜色）
                                              └─ ds-button__icon — SVG 图标容器
                                                  └─ <svg> (16x16)
```

## CSS Class Summary

### DeepSeek Components
| Class | Location | Purpose |
|-------|----------|---------|
| `ds-virtual-list` | 消息列表主容器 | 虚拟滚动列表 |
| `ds-virtual-list--printable` | 同元素 | 增强类 |
| `ds-virtual-list-items` | 消息列表 | 消息项容器 |
| `ds-message` | 每条消息 | 单条消息包裹 |
| `d29f3d7d` | ds-message 子级 | 用户消息 |
| `ds-assistant-message-main-content` | ds-message 子级 | AI 回复 |
| `ds-markdown` | 回复内容 | Markdown 渲染 |
| `ds-scroll-area` | 滚动容器 | 可滚动容器（textarea 也使用） |
| `ds-scroll-area--printable` | 同上 | 增强类 |
| `ds-scroll-area__gutters` | 滚动条区域 | 滚动条容器 |
| `ds-scroll-area__horizontal-gutter/bar` | 滚动条 | 横滚条装饰 |
| `ds-scroll-area__vertical-gutter/bar` | 滚动条 | 竖滚条装饰 |
| `ds-button` | 通用按钮 | 按钮基类 |
| `ds-button--iconLabelPrimary` | 发送按钮 | 主风格按钮（蓝） |
| `ds-button--icon` | 按钮 | 图标按钮 |
| `ds-button--capsule` | 按钮 | 胶囊形 |
| `ds-button--s` | 按钮 | 小尺寸 |
| `ds-button--icon-relative-m` | 按钮 | 图标位置 |
| `ds-button__background` | 按钮内部 | 按钮装饰层（CSS-in-JS 控制背景色） |
| `ds-button__icon` | 按钮内部 | 图标容器 |
| `ds-button__icon--last-child` | 按钮内部 | 图标位置修饰 |
| `f02f0e25` | 按钮 | CSS-in-JS 类名（动态生成） |
| `_27c9245` | textarea | CSS-in-JS 混淆类 |
| `_24fad49` | textarea 容器 | CSS-in-JS |
| `_020ab5b` | 输入区外层 | CSS-in-JS |
| `_77cefa5` | flex 容器 | CSS-in-JS flex row |
| `_3d616d3` | 同上 | 增强类 |
| `aaff8b8f` | 输入区包裹 | CSS-in-JS |
| `_871cbca` | 输入区整体 | CSS-in-JS flex column |
| `_765a5cd` | 主内容区 | CSS-in-JS (overflow:hidden) |
| `_7780f2e` | 聊天面板 | CSS-in-JS (data-ds-chatpanel) |
| `_2be88ba` | 顶部 header | CSS-in-JS |
| `_1aa2651 the-header` | 隐藏按钮条 | 文字样式，display:none |
| `c3ecdb44` | 全局包裹 | CSS-in-JS （侧边栏+聊天面板的父级） |
| `cb86951c` | 最外层包裹 | CSS-in-JS (position:absolute) |
| `dc04ec1d` | 侧边栏 | CSS-in-JS |
| `bf38813a` | 按钮父容器 | CSS-in-JS |
| `ec4f5d61` | 按钮栏 | CSS-in-JS |
| `b8812f16 a2f3d50e` | 未知覆盖元素 | elementFromPoint 在按钮上方遮挡 |
| `_31a22b0` | 模式选择器 | 混淆类名 |
| `aa40b5de` | 模式条目 | 混淆类名 |
| `_321831d` | 模式标签 | 混淆类名 |
| `.ds-scroll-area--printable` | scroll | 滚动容器增强 |

### Theme Mode
- BODY class: `zh_CN light` (浅色) / `zh_CN dark` (深色)
- 通过 `document.body.classList` 检测

## Button State
- Textarea 为空时: `ds-button__background` size=0x0，按钮不可见（DeepSeek 自身行为）
- Textarea 有文字时: 按钮出现，CSS-in-JS 通过动态类名（如 `f02f0e25`）控制 `ds-button__background` 的背景色
- 禁用态: 灰色？css 尚未确认
- 激活态: 蓝色？css 尚未确认
- 按钮颜色通过 `<style>` 标签中的 CSS-in-JS 注入，不在 .css 文件中

## Key Metrics
- 聊天面板宽度: ~1291px (当窗口 1552px 时)
- 侧边栏宽度: ~261px
- 按钮位置: x=1204, y=816 (bottom of viewport)
- 按钮尺寸: 34x34px
- SVG 图标: 16x16px
- 按钮父容器 bf38813a: 78px 宽
- 文本区域行高: 60px (textarea)
- 输入栏总高: ~123px (level3 _77cefa5)
- 消息列表宽度: 1203px (比聊天面板窄)
