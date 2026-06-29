## 1. Silent Loop

- [x] 1.1 MAIN world XHR 发送逻辑：保存 chat_session_id + model_type，origSend.call() 发送
- [x] 1.2 SSE 循环解析：累积文本 → 检测新工具调用 → 继续循环或返回最终文本
- [x] 1.3 1.5s 间隔防 429 + loop 上限 10 次
- [x] 1.4 XHR 失败时 fallback 到 DOM 模式
- [x] 1.5 静默模式走 XHR 而非 DOM 模拟

## 2. Tools Expansion

- [x] 2.1 tool-descriptors.ts 添加 doc_generate 定义
- [x] 2.2 main-xhr-inject.ts TOOL_DEFS + buildToolDefs 添加说明
- [x] 2.3 toolCallRegex 加入 doc_generate
- [x] 2.4 isolated world 中 handleDocGenerate：Blob → 下载
- [x] 2.5 doc_generate 不需要 Tavily API Key

## 3. Skills Expansion

- [x] 3.1 新增 5 个技能定义
- [x] 3.2 每个技能 instructions 控制在 800-1500 字
- [x] 3.3 loadSkills 正确合并新内置技能
- [x] 3.4 matchSkills 自动支持新技能名

## 4. Panel Redesign

- [x] 4.1 buildPanelHTML 重写为分层式布局：Agent → Tools → Skills → 导出 → 设置
- [x] 4.2 Tools 卡片网格（5 个工具）
- [x] 4.3 API Key + 增强功能移到折叠设置区
- [x] 4.4 保留拖拽 tab 和位置持久化
- [x] 4.5 保留 Skill CRUD 事件绑定
- [x] 4.6 保留导出和 GitHub 导入对话框

## 5-7. (已全部完成)
