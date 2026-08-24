# Agent 自验方法（视觉/DOM 类改动）

## 布局验证必须断言计算样式与几何，DOM 顺序不代表视觉

- **症状**：微信风格导出里用户气泡没靠右（漏 `.wx-me{justify-content:flex-end}`），但 agent 自验「通过」——当时只检查了头像在 DOM 里的相对位置（avatar-right），没检查 flex 对齐；用户人工验证才发现。
- **原因**：flex 行内元素默认从行首排布，DOM 顺序（气泡在头像前）与视觉方位（气泡是否贴右缘）是两回事；「元素存在且顺序对」推不出「对齐对」。
- **解法**：对布局结论至少断言二者之一：`getComputedStyle(row).justifyContent` 等对齐属性；或几何——子项右边缘与容器右边缘重合（`Math.abs(a.right - row.right) < 1`）。截图若工具链拿不到（见下条）更不能当成已验证。
- **置信度**：验证过（用户纠正一次后，同会话内用几何断言复验通过）
- **首次记录**：2026-08-24（用户纠正）
- 已升级至 AGENTS.md

## 用户报障先读真实产物（导出文件/页面实测）再动代码

- **症状**：用户报障（如微信风格导出气泡不靠右、历史会话 markdown 原样文本）后，agent 凭代码印象或自己「自验通过」的结论推断开改，绕了一圈才发现现象与真实产物不符。
- **原因**：内存里的代码印象 ≠ 真实产物；「自验通过」不等于「用户看到的导出文件/页面正确」——问题可能出在验证方法（见「布局验证必须断言计算样式与几何」条目）或数据源（见 chat-export 双数据源条目），没看产物前无法区分。
- **解法**：接到报障先打开真实产物定位现象（导出的文件内容、真实页面实测）再回代码改，不要先改代码再等用户复验；用户报障指向的真实产物就是最高优先级验收标准。
- **置信度**：验证过（用户纠正）
- **首次记录**：2026-08-24
- 已升级至 AGENTS.md

## chrome-devtools MCP 截图不回传、filePath 被拒；程序化检查更可靠

- **症状**：`take_screenshot` 只返回 "Took a screenshot" 文本，图像不进上下文；`filePath` 落盘报 "not within any of the configured workspace roots"（连项目根目录也拒）。Browser Use 的 `nodeRepl.emitImage` 可以回传图像，但 IAB 后端 `goto()` 不支持 `file://`。
- **原因**：MCP 工具的图像回传与文件写入受宿主配置限制；IAB 导航白名单只收 http/https/about:blank。
- **解法**：默认用 `evaluate_script` 做程序化断言（计算样式、`getBoundingClientRect`、元素计数、`innerText.includes` 检查残留文本）——比截图更精确可复核；确需真实视觉时：本地 `python -m http.server` 把文件变 http:// 再用 Browser Use emitImage。注意：断言「CSS 类不存在于输出」时别用会撞样式表选择器的子串（如 `wx-think` 在 CSS 里永远存在，应断言 `<details class="wx-think"`）。
- **置信度**：验证过
- **首次记录**：2026-08-24

## DOM 重依赖代码的端到端自验模式：jiti 跑 TS 源码 + CORS receiver 收真实页面 DOM

- **症状**：工作流允许 DOM 重依赖层跳过自动化测试，但「历史会话导出」这类 bug 恰恰藏在 DOM 抓取逻辑里，纯单测覆盖不到，等用户人工验证才发现已太晚。
- **原因**：真实页面的 DOM 结构（装饰元素、组件嵌套）无法在 node 测试里复现。
- **解法**：三步组合——
  1. `node_modules/.bin/jiti script.mjs` 可直接 import 项目的 `src/**/*.ts`（jiti 已在依赖里），在 node 里跑真实导出管线；
  2. 起一个带 `Access-Control-Allow-Origin: *` 的 node http server 接收 POST 落盘；在真实页面 `evaluate_script` 里 `fetch('http://localhost:PORT/', {method:'POST', body: JSON.stringify(数据)})` 把页面 DOM 数据传出来（text/plain 免预检）；
  3. node 侧用真实源码函数处理真实数据，生成预览文件 → 本地 http 服务 → 浏览器程序化断言。
  这套流程在提交前就能用「真实数据 + 真实代码」验证 DOM 层，本轮靠它一次定位根因并确认修复。
- **置信度**：验证过
- **首次记录**：2026-08-24

## 验证注入 CSS 效果先查 transition：立即读 computed style 会撞上过渡起始帧

- **症状**：往页面注入样式规则（含 !important，特异性拉满甚至行内 important）后，立即 `getComputedStyle(el).backgroundColor` 读到的仍是旧值/透明，表象是「规则完全没生效、有更高优先级规则压着」，差点把修复方向带偏（去追查根本不存在的更高特异性规则）。
- **原因**：目标元素带 `transition: background 0.3s`（DeepSeek 消息气泡原生就有），注入/改值瞬间读取正处于过渡起始帧，computed style 返回动画中间值（≈旧值）。
- **解法**：验证注入 CSS 效果前先查 `getComputedStyle(el).transitionProperty` / `transitionDuration`；有 transition 就等过渡结束（duration 之后）再断言，或临时 `el.style.transition='none'` 验证后还原。本会话靠「注入后 sleep 600ms 再读」一次确认规则生效。
- **置信度**：验证过（同会话内被假象误导后修复验证）
- **首次记录**：2026-08-24
- 已升级至 AGENTS.md
