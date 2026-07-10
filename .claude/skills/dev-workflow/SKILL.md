---
name: dev-workflow
description: Testing split (Claude vs manual user) and Chrome extension deployment steps for the deepseek-enhancer project.
---

# /dev-workflow

deepseek-enhancer 项目的测试分工和 Chrome 扩展部署流程。

## 测试分工

每次代码改动后按以下分工验证：

### Claude 测试（确定性/可自动化）

- 纯函数逻辑（SSE 解析、导出、技能合并、类型定义）
- CSS 选择器正确性
- 数据转换/格式化
- 方法：内联 `assert` 或 `npm run test`（vitest）

### 用户手动测试（需在 chat.deepseek.com 浏览器中验证）

- 各主题下视觉颜色、按钮、高亮
- Agent 模式端到端工具调用
- React 条件渲染后的 UI 状态
- SPA 导航后的状态保持

## Chrome 部署

构建产物：`dist/chrome-mv3/`，部署目标：`D:\deepseek-enhancer\`

测试步骤：
1. 打开 `chrome://extensions`
2. 启用「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `D:\deepseek-enhancer\` 目录
