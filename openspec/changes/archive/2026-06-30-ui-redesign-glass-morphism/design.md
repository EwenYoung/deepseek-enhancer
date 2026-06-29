## Context

当前控制面板（`src/core/ui-panel.ts`）采用硬编码内联样式（`style.cssText` + `style="..."`），存在以下问题：

- 深色/浅色适配靠 CSS `!important` 覆盖，代码脆弱且维护成本高
- 编辑器内嵌在 340px 宽的面板中，编辑体验差
- 全部图标使用 emoji，不够专业
- 设置区折叠后操作路径长
- GitHub 导入功能不稳定（速率限制 + 路径猜测）

UI 层与业务逻辑层耦合在同一个文件中，本次重设计目标是在不改变业务逻辑的前提下重构 UI 层。

## Goals / Non-Goals

**Goals:**
- 玻璃毛玻璃面板（glassmorphism），视觉统一
- 深色/浅色双主题体系，用 CSS 变量驱动
- 右下角发光圆点触发器
- 编辑/新建/删除弹窗系统（modal）
- Tools 1 列排列，设置区底部固定分页
- 全部 emoji 图标替换为 Lucide SVG
- 保持现有全部功能（API Key、Agent 模式、增强功能等）

**Non-Goals:**
- 不修改业务逻辑（skill 注册/加载/保存、Agent 模式、增强功能等）
- 不修改内容脚本入口（`content.ts`）
- 不修改图谱集成逻辑
- 不新增功能

## Decisions

### 1. CSS 变量体系替代内联样式覆盖

**现状**：面板背景、颜色全写在 `style.cssText` 和 `style=""`，深色适配靠 `.ds-panel-dark` + `!important`

**方案**：在 `<head>` 中注入 `<style id="ds-panel-vars">`，定义 CSS 变量：

```css
#ds-mini-panel {
  --panel-bg: rgba(255,255,255,0.92);
  --panel-blur: blur(20px);
  --panel-text: #1f2937;
  --panel-border: rgba(0,0,0,0.08);
  --accent: #007AFF;
  --card-bg: rgba(255,255,255,0.5);
  --toggle-on: #007AFF;
  --toggle-off: rgba(0,0,0,0.2);
}

#ds-mini-panel.dark {
  --panel-bg: rgba(0,0,0,0.88);
  --panel-text: #e0e0e0;
  --panel-border: rgba(255,255,255,0.08);
  --accent: #5E5CE6;
  --card-bg: rgba(255,255,255,0.08);
  --toggle-on: #5E5CE6;
  --toggle-off: rgba(255,255,255,0.15);
}
```

面板 HTML 中引用变量：`background: var(--panel-bg)`，不再直接写颜色值。深色切换只需切换 `.dark` class。

**替代方案**：JS 直接操作 style（目前方案）→ 被拒绝。CSS 变量方案更声明式，更易维护。

### 2. Modal 弹窗系统

面板内嵌编辑器的核心问题：空间不够。改为全局 Modal：

- `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)`
- 尺寸：~700x600px（编辑窗口）/ ~360x180px（确认删除窗口）
- 背景半透明遮罩层（`rgba(0,0,0,0.5)` + `backdrop-filter: blur(4px)`）
- 点击遮罩层关闭弹窗
- 弹窗本身也使用玻璃风格

### 3. 右下角触发器

- 28x28px 圆点，`position: fixed; bottom: 16px; right: 16px`
- 默认显示 `✦` 图标，`#007AFF` 蓝色 + `box-shadow` 发光
- hover 时扩展显示文字标签「DeepSeek Enhancer」
- Agent 开启时图标变青色 `#5E5CE6`
- 不再支持拖拽

### 4. Lucide SVG 图标

全部替换为 Lucide 的 SVG 路径：
- 搜索 → `search`
- 抓取 → `globe`
- 新闻 → `newspaper`
- GitHub → `github`
- 文档 → `file-text`
- 技能 → `cpu`
- 设置 → `settings`
- 删除 → `trash-2`
- Agent → `bot`
- 导出 → `download`
- 关闭 → `x`
- 语音 → `mic`

### 5. 设置分页布局

面板底部固定高度区域（~120px），用两个小 tab 切换：
- tab "增强功能"：显示宽屏、主题、滚动条、自动隐藏、语音 5 个开关
- tab "API 设置"：显示 API Key 输入框 + 保存 + 测试按钮

### 6. 删除 GitHub 导入

移除 `skill-importer.ts` 中的 `importFromGitHub()`、`importFromGitHubPath()`、`discoverEntries()` 等函数。保留 `importFromLocal()`。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| CSS 变量在 `backdrop-filter` 上的一些浏览器兼容问题 | `backdrop-filter` 在 Chrome 84+ 支持，扩展 MV3 的 Chrome 版本要求满足 |
| Modal 弹窗可能被 DeepSeek 页面元素遮挡 | 使用高 z-index（`999999`），与面板同级 |
| 移除 GitHub 导入影响部分用户 | 保留本地导入，SKILL.md 也可手动放置 |
| 重写面板 HTML 可能引入事件绑定 bug | 保持事件绑定逻辑不变，只改 `buildPanelHTML()` 和样式 |
