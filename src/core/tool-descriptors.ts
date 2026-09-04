import type { ToolDescriptor } from './types';

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'web_search',
    label: '联网搜索',
    description: '使用 Tavily 搜索引擎搜索互联网获取实时信息',
    parameters: { query: { type: 'string', description: '搜索关键词或问题', required: true } },
    execution: 'background',
  },
  {
    name: 'web_fetch',
    label: '抓取网页',
    description: '抓取指定 URL 的网页全文内容',
    parameters: { url: { type: 'string', description: '要抓取的网页完整 URL', required: true } },
    execution: 'background',
  },
  {
    name: 'news_hub',
    label: '新闻聚合',
    description:
      '自动聚合8个平台实时热点：百度热搜、微博热搜、GitHub Trending、知乎热榜、36氪科技、arXiv AI论文、Hacker News、Reddit ML',
    parameters: {
      sources: { type: 'string', description: '数据源（可选）逗号分隔，默认全部', required: false },
    },
    execution: 'background',
  },
  {
    name: 'github_trending',
    label: 'GitHub热门',
    description: '获取 GitHub Trending 页面当前最热门的开源项目列表',
    parameters: {
      language: { type: 'string', description: '编程语言（可选）', required: false },
      since: { type: 'string', description: '周期: daily,weekly,monthly', required: false },
    },
    execution: 'background',
  },
  {
    name: 'doc_generate',
    label: '生成文档',
    description: '将模型输出的 Markdown 内容触发浏览器下载为文件',
    parameters: {
      title: { type: 'string', description: '文件名（不含扩展名）', required: true },
      format: { type: 'string', description: '格式: md/html', required: false },
      content: { type: 'string', description: '文档内容（Markdown）', required: true },
    },
    execution: 'local',
  },
];

// ============================================================
// 派生辅助 — 唯一事实源的查询入口
// ============================================================

/** 按工具名查找描述；不存在时返回 undefined */
export function getToolByName(name: string): ToolDescriptor | undefined {
  return TOOL_DESCRIPTORS.find((t) => t.name === name);
}

/** 全部工具名（与注入到 prompt 的 XML 标签一一对应） */
export const toolNames: string[] = TOOL_DESCRIPTORS.map((t) => t.name);

/** 需要在 Background 代理执行的工具 */
export const BACKGROUND_TOOLS: ToolDescriptor[] = TOOL_DESCRIPTORS.filter(
  (t) => t.execution === 'background',
);

/**
 * 对将内插到 `JSON.parse('...')` 单引号字面量并随 `<script>` 注入页面的
 * JSON 文本做两层安全转义。
 *   1. JS 字面量层：`'`（截断外层）与 `\`（吞掉后续转义序列，含 `\n` 变裸换行）须转义；
 *   2. HTML 脚本层：裸 `<`（如 </script>）会提前闭合脚本，须转义为 \u003c（JSON.parse 后还原，语义无损）。
 * 独立导出以便用含特殊字符的输入直接测试转义路径
 * （真实工具描述全为中文，不会触发这些 replace，测试必须绕过这层偶然性）。
 */
export function escapeInjectedJson(json: string): string {
  // 顺序固定：先 `\` 后 `'` 再 `<`（后加的 `\` 不能被前面的替换再次处理）
  return json.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');
}

/**
 * 生成注入 MAIN 世界 IIFE 的 TOOL_DEFS JSON 字符串。
 * 结构对齐 IIFE 侧消费格式：{ name, label, params: { <k>: { desc } } }。
 * 注入路径：main-world.content.ts 把返回值直接内插到
 *   `JSON.parse('...')` 的 JS 单引号字符串字面量里，再经 <script> 注入页面。
 */
export function buildToolDefsJson(): string {
  const defs = TOOL_DESCRIPTORS.map((t) => ({
    name: t.name,
    label: t.label,
    params: Object.fromEntries(
      Object.entries(t.parameters).map(([k, v]) => [k, { desc: v.description }]),
    ),
  }));
  return escapeInjectedJson(JSON.stringify(defs));
}
