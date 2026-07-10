import type { ToolDescriptor } from './types';

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'web_search',
    label: '联网搜索',
    description: '使用 Tavily 搜索引擎搜索互联网获取实时信息',
    parameters: { query: { type: 'string', description: '搜索关键词或问题', required: true } },
  },
  {
    name: 'web_fetch',
    label: '抓取网页',
    description: '抓取指定 URL 的网页全文内容',
    parameters: { url: { type: 'string', description: '要抓取的网页完整 URL', required: true } },
  },
  {
    name: 'news_hub',
    label: '新闻聚合',
    description:
      '自动聚合8个平台实时热点：百度热搜、微博热搜、GitHub Trending、知乎热榜、36氪科技、arXiv AI论文、Hacker News、Reddit ML',
    parameters: {
      sources: { type: 'string', description: '数据源（可选）逗号分隔，默认全部', required: false },
    },
  },
  {
    name: 'github_trending',
    label: 'GitHub热门',
    description: '获取 GitHub Trending 页面当前最热门的开源项目列表',
    parameters: {
      language: { type: 'string', description: '编程语言（可选）', required: false },
      since: { type: 'string', description: '周期: daily,weekly,monthly', required: false },
    },
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
  },
];
