import { describe, it, expect } from 'vitest';
import {
  wrapToolResultMD,
  slugify,
  renderHTML,
  renderMarkdown,
  sanitizeRenderedHTML,
  htmlToMarkdown,
} from '../chat-exporter';

type ExportMessage = Parameters<typeof renderHTML>[0][number];

function makeMessages(...items: Array<Partial<ExportMessage>>): ExportMessage[] {
  return items.map((item) => ({
    role: 'user' as const,
    content: '',
    ...item,
  }));
}

describe('wrapToolResultMD', () => {
  it('wraps tool result block in code fence', () => {
    const input = 'User message\n[工具执行结果]\nSearch result here\n---';
    const result = wrapToolResultMD(input);
    expect(result).toContain('```');
    expect(result).toContain('[工具执行结果]');
    expect(result).toContain('Search result here');
    expect(result).toContain('---');
  });

  it('wraps tool result without trailing ---', () => {
    const input = '[工具执行结果]\nSome result text';
    const result = wrapToolResultMD(input);
    expect(result).toContain('```\n[工具执行结果]\nSome result text\n```');
  });

  it('returns text unchanged when no tool result present', () => {
    const input = 'Regular user message\nNo tool results here.';
    expect(wrapToolResultMD(input)).toBe(input);
  });

  it('handles multiple tool result blocks', () => {
    const input = 'Msg1\n[工具执行结果]\nResult1\n---\nMsg2\n[工具执行结果]\nResult2\n---';
    const result = wrapToolResultMD(input);
    // Both blocks should be wrapped
    const fenceCount = (result.match(/```/g) || []).length;
    expect(fenceCount).toBe(4); // 2 opening + 2 closing
  });

  it('handles empty string', () => {
    expect(wrapToolResultMD('')).toBe('');
  });
});

describe('renderHTML（微信对话风格）', () => {
  it('用户消息渲染为右侧绿色气泡（wx-me）', () => {
    const html = renderHTML(makeMessages({ role: 'user', content: '你好' }), '测试会话');
    expect(html).toContain('wx-row wx-me');
    expect(html).toContain('wx-avatar-me');
    expect(html).toContain('#95ec69');
    expect(html).toContain('你好');
  });

  it('用户气泡行靠右对齐（justify-content:flex-end）', () => {
    const html = renderHTML(makeMessages({ role: 'user', content: '你好' }), '测试会话');
    expect(html).toContain('.wx-me{justify-content:flex-end}');
  });

  it('助手消息渲染为左侧白色气泡（wx-ai）', () => {
    const html = renderHTML(makeMessages({ role: 'assistant', content: '回答内容' }), '测试会话');
    expect(html).toContain('wx-row wx-ai');
    expect(html).toContain('wx-avatar-ai');
    expect(html).not.toContain('<details class="wx-think"');
  });

  it('思考过程渲染为气泡内折叠块', () => {
    const html = renderHTML(
      makeMessages({ role: 'assistant', content: '回答', thinking: '先分析…' }),
      '测试会话',
    );
    expect(html).toContain('wx-think');
    expect(html).toContain('思考过程');
    expect(html).toContain('先分析…');
  });

  it('思考过程 summary 去默认三角，用尖括号随开合旋转', () => {
    const html = renderHTML(
      makeMessages({ role: 'assistant', content: '回答', thinking: '先分析…' }),
      '测试会话',
    );
    expect(html).toContain('.wx-think summary::-webkit-details-marker{display:none}');
    expect(html).toContain('summary::before{content:"❯"');
    expect(html).toContain('.wx-think[open] summary::before{transform:rotate(90deg)}');
  });

  it('导航栏展示会话标题与消息统计', () => {
    const html = renderHTML(
      makeMessages({ content: '问' }, { role: 'assistant', content: '答' }),
      '测试会话',
    );
    expect(html).toContain('wx-nav-title');
    expect(html).toContain('测试会话');
    expect(html).toContain('共 2 条消息');
  });

  it('转义消息内容与会话标题中的 HTML', () => {
    const html = renderHTML(makeMessages({ content: '<script>alert(1)</script>' }), '<b>标题</b>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>标题</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('工具结果以 pre 呈现且不做 markdown 渲染', () => {
    const html = renderHTML(
      makeMessages({ content: '[工具执行结果]\nOK web_search: **关键词**' }),
      '测试会话',
    );
    expect(html).toContain('<pre>');
    expect(html).not.toContain('<strong>');
  });

  it('助手 markdown 的加粗与代码块正常渲染', () => {
    const html = renderHTML(
      makeMessages({ role: 'assistant', content: '**重点**\n```js\nconst a = 1;\n```' }),
      '测试会话',
    );
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('<pre data-lang="js">');
    expect(html).toContain('const a = 1;');
  });

  it('助手 markdown 的标题、列表、表格、引用渲染为块级元素', () => {
    const md = [
      '## 方案对比',
      '',
      '- 方案一：简单',
      '- 方案二：稳妥',
      '',
      '| 方案 | 成本 |',
      '| --- | --- |',
      '| 一 | 低 |',
      '| 二 | 中 |',
      '',
      '> 引用说明',
      '',
      '1. 第一步',
      '2. 第二步',
    ].join('\n');
    const html = renderHTML(makeMessages({ role: 'assistant', content: md }), '测试会话');
    expect(html).toContain('<h2>方案对比</h2>');
    expect(html).toContain('<ul><li>方案一：简单</li><li>方案二：稳妥</li></ul>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>方案</th>');
    expect(html).toContain('<td>低</td>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ol><li>第一步</li><li>第二步</li></ol>');
  });

  it('段落内换行渲染为 br，行内码内容不被粗体规则改写', () => {
    const md = '第一行\n第二行\n\n说明 `a **b** c` 与 **粗体**';
    const html = renderHTML(makeMessages({ role: 'assistant', content: md }), '测试会话');
    expect(html).toContain('<p>第一行<br>第二行</p>');
    expect(html).toContain('<code>a **b** c</code>');
    expect(html).toContain('<strong>粗体</strong>');
  });

  it('提供 renderedHTML 时优先于 markdown 渲染（历史会话路径）', () => {
    const html = renderHTML(
      makeMessages({
        role: 'assistant',
        content: '**已被替代的文本渲染**',
        renderedHTML: '<h3>标题</h3><p>段落 <strong>加粗</strong></p>',
      }),
      '测试会话',
    );
    expect(html).toContain('<h3>标题</h3>');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).not.toContain('已被替代的文本渲染');
  });
});

describe('sanitizeRenderedHTML', () => {
  it('保留白名单标签并剥掉全部属性', () => {
    const input = '<p class="a" style="x:1">文本</p><h3 id="t">标题</h3>';
    expect(sanitizeRenderedHTML(input)).toBe('<p>文本</p><h3>标题</h3>');
  });

  it('未知标签解包，仅保留文字（含高亮 span）', () => {
    const input = '<pre><span class="token kw">const</span> a = 1;</pre>';
    expect(sanitizeRenderedHTML(input)).toBe('<pre>const a = 1;</pre>');
  });

  it('a 仅在 href 为 http(s) 时保留', () => {
    expect(sanitizeRenderedHTML('<a href="https://x.com" onclick="e()">链接</a>')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">链接</a>',
    );
    expect(sanitizeRenderedHTML('<a href="javascript:alert(1)">坏</a>')).toBe('<a>坏</a>');
  });

  it('移除 script/style 及注释', () => {
    const input = '<p>a</p><script>alert(1)</script><style>.x{}</style><!-- note -->';
    expect(sanitizeRenderedHTML(input)).toBe('<p>a</p>');
  });
});

describe('renderMarkdown（Markdown 导出）', () => {
  it('说话人行是粗体（User / Deepseek），不与正文标题争层级', () => {
    const md = renderMarkdown(
      makeMessages({ content: '问题' }, { role: 'assistant', content: '回答' }),
      '测试会话',
    );
    expect(md).toContain('**User**');
    expect(md).toContain('**Deepseek**');
    expect(md).not.toContain('## user');
    expect(md).not.toContain('## Deepseek');
    expect(md).not.toContain('👤');
    expect(md).not.toContain('🤖');
  });

  it('用户内容整体包裹在引用块中，与回复形成区域划分', () => {
    const md = renderMarkdown(
      makeMessages({ content: '第一行\n\n第二行' }, { role: 'assistant', content: '回答' }),
      '测试会话',
    );
    expect(md).toContain('> 第一行\n>\n> 第二行');
    expect(md).not.toMatch(/^第一行/m);
  });

  it('助手思考过程渲染为无空行折叠块（Typora 兼容），内容转义承载', () => {
    const md = renderMarkdown(
      makeMessages({ role: 'assistant', content: '回答', thinking: '先分析\n再验证 <tag>' }),
      '测试会话',
    );
    expect(md).toContain(
      '<details>\n<summary>💭 思考过程</summary>\n<p>先分析<br>再验证 &lt;tag&gt;</p>\n</details>',
    );
    expect(md).not.toContain('> 先分析');
  });
});

describe('htmlToMarkdown（历史会话已渲染 DOM 逆向重建）', () => {
  it('标题与段落转为 markdown 并以空行分隔', () => {
    const md = htmlToMarkdown('<h2>方案</h2><p>第一段</p><p>第二段</p>');
    expect(md).toBe('## 方案\n\n第一段\n\n第二段');
  });

  it('标题层级映射到对应井号数', () => {
    expect(htmlToMarkdown('<h1>一</h1><h4>四</h4>')).toBe('# 一\n\n#### 四');
  });

  it('行内样式与行内码、删除线', () => {
    const md = htmlToMarkdown(
      '<p><strong>粗</strong>与<em>斜</em>、<del>删</del>、<code>码</code></p>',
    );
    expect(md).toBe('**粗**与*斜*、~~删~~、`码`');
  });

  it('链接保留 href，未知标签解包保留文字', () => {
    const md = htmlToMarkdown('<p><a href="https://x.com">文档</a><span>尾随</span></p>');
    expect(md).toBe('[文档](https://x.com)尾随');
  });

  it('代码块剥除 code 标签、反转义实体并原样保留内容', () => {
    const md = htmlToMarkdown('<pre><code>a &lt; b &amp;&amp; c &gt; d\n  缩进保持</code></pre>');
    expect(md).toBe('```\na < b && c > d\n  缩进保持\n```');
  });

  it('代码内含三反引号时使用更长围栏', () => {
    const md = htmlToMarkdown('<pre><code>```js\nx```</code></pre>');
    expect(md).toBe('````\n```js\nx```\n````');
  });

  it('无序列表各项加短横线，嵌套列表缩进两格', () => {
    const md = htmlToMarkdown('<ul><li>外层<ul><li>内层</li></ul></li><li>第二项</li></ul>');
    expect(md).toBe('- 外层\n  - 内层\n- 第二项');
  });

  it('有序列表编号连续，多行项内容缩进对齐', () => {
    const md = htmlToMarkdown('<ol><li>甲</li><li>乙</li></ol>');
    expect(md).toBe('1. 甲\n2. 乙');
  });

  it('表格转 GFM（表头行后插分隔行，单元格内换行折叠为空格）', () => {
    const md = htmlToMarkdown(
      '<table><thead><tr><th>方案</th><th>成本</th></tr></thead>' +
        '<tbody><tr><td>一</td><td>低<br>很低</td></tr></tbody></table>',
    );
    expect(md).toBe('| 方案 | 成本 |\n| --- | --- |\n| 一 | 低 很低 |');
  });

  it('引用块逐行加前缀，内部块级结构保留', () => {
    const md = htmlToMarkdown('<blockquote><p>说明</p><ul><li>要点</li></ul></blockquote>');
    expect(md).toBe('> 说明\n>\n> - 要点');
  });

  it('段落内 br 转换行，hr 转分隔线', () => {
    expect(htmlToMarkdown('<p>第一行<br>第二行</p>')).toBe('第一行\n第二行');
    expect(htmlToMarkdown('<p>上</p><hr><p>下</p>')).toBe('上\n\n---\n\n下');
  });

  it('顶层裸文本兜底为段落', () => {
    expect(htmlToMarkdown('散落文本')).toBe('散落文本');
  });

  it('与 sanitizeRenderedHTML 衔接：属性剥除后仍可转换', () => {
    const md = htmlToMarkdown(
      sanitizeRenderedHTML(
        '<h3 class="x">标题</h3><p style="c">正文 <strong class="b">重点</strong></p>',
      ),
    );
    expect(md).toBe('### 标题\n\n正文 **重点**');
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces special chars with hyphens', () => {
    expect(slugify('hello!@#world')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('deep seek chat')).toBe('deep-seek-chat');
  });

  it('preserves Chinese characters', () => {
    expect(slugify('DeepSeek 聊天助手')).toBe('deepseek-聊天助手');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('truncates to 40 characters', () => {
    const long = 'a-very-long-title-that-goes-on-and-on-and-should-be-cut-off-at-forty';
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});
