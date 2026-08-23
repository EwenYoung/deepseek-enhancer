// ============================================================
// deepseek-enhancer — 会话导出 (Markdown / HTML)
// ============================================================

export type ExportFormat = 'markdown' | 'html';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  /** 历史会话无原始 markdown 缓存时，从页面已渲染 DOM 提取并净化的 HTML */
  renderedHTML?: string;
}

// ============================================================
// 主入口
// ============================================================
export function exportChat(format: ExportFormat) {
  // 异步：滚动到顶部确保所有消息都加载到 DOM 中
  scrollToTopAndExport(format);
}

async function scrollToTopAndExport(format: ExportFormat) {
  // 1. 查找可滚动的聊天容器
  const container = findScrollContainer();
  if (container) {
    // 滚动到顶部
    container.scrollTop = 0;
    // 等待虚拟滚动加载
    await delay(600);
    // 再增加一次滚动确保所有懒加载内容到位
    container.scrollTop = 0;
    await delay(400);
  }

  // 2. 抓取消息
  const messages = scrapeMessages();
  if (messages.length === 0) {
    alert('没有找到聊天消息');
    return;
  }

  // 3. 合并注入指令
  mergeInjectedPrefixes(messages);

  const title = getChatTitle();
  const filename = 'deepseek-' + slugify(title) + '-' + dateStamp();

  if (format === 'markdown') {
    download(renderMarkdown(messages, title), filename + '.md', 'text/markdown');
  } else {
    download(renderHTML(messages, title), filename + '.html', 'text/html');
  }

  console.log('[DS-Mini] Exported', messages.length, 'messages');
}

function findScrollContainer(): HTMLElement | null {
  // 找到包含大量 .ds-message 的可滚动容器
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as HTMLElement;
    // 检查是否有滚动条且包含 .ds-message
    if (el.scrollHeight > el.clientHeight + 50 && el.querySelectorAll('.ds-message').length > 1) {
      return el;
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

// ============================================================
// 从 DOM 抓取消息
// ============================================================
function scrapeMessages(): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const msgEls = document.querySelectorAll<HTMLElement>('.ds-message');
  if (msgEls.length === 0) {
    console.warn('[DS-Mini] Export: no .ds-message found');
    return messages;
  }

  // 读取缓存的原始助手响应文本（含 Markdown）
  const asstRawEl = document.getElementById('ds-mini-asst-raw');
  const asstRawTexts = asstRawEl ? (asstRawEl.textContent || '').split('||ASST_SEP||') : [];
  let asstIdx = 0;

  for (let i = 0; i < msgEls.length; i++) {
    const el = msgEls[i];
    if (el.closest('.ds-mini-tool-block')) continue;

    const replyEl = el.querySelector<HTMLElement>('.ds-assistant-message-main-content');
    const thinkEl = el.querySelector<HTMLElement>('.ds-think-content');

    if (replyEl) {
      // Assistant 消息 — 优先使用缓存的原始 Markdown 文本；
      // 历史会话无缓存时退回页面已渲染 DOM 的净化 HTML（textContent 已丢失 markdown 语法）
      const thinking = thinkEl?.textContent?.trim() || '';
      const raw = asstRawTexts[asstIdx];
      const reply = raw ? raw.trim() : replyEl.textContent?.trim();
      if (reply) {
        messages.push({
          role: 'assistant' as const,
          content: reply,
          thinking: thinking || undefined,
          renderedHTML: raw ? undefined : extractRenderedReplyHTML(replyEl),
        });
      }
      if (raw) asstIdx++;
    } else {
      // User 消息 — 跳过包含 assistant 子元素的
      if (el.querySelector('.ds-markdown, .ds-think-content')) continue;

      // 续接消息替换为 placeholder
      const isContinuation =
        el.hasAttribute('data-ds-continuation') ||
        (el.textContent &&
          el.textContent.includes('以下是工具执行结果') &&
          el.textContent.includes('original_task'));

      let text = '';
      // 找第一个有文本的直接子元素
      for (let j = 0; j < el.children.length; j++) {
        const child = el.children[j] as HTMLElement;
        const childCls = child.className || '';
        if (childCls.includes('ds-markdown') || childCls.includes('ds-think')) continue;
        const t = child.textContent?.trim();
        if (t && t.length > 2) {
          text = t;
          break;
        }
      }
      // 兜底
      if (!text) text = el.textContent?.trim() || '';

      if (text && text.length > 2) {
        if (isContinuation) {
          text = extractToolResultsFromContinuation(text);
        }
        messages.push({ role: 'user' as const, content: text });
      }
    }
  }

  return messages;
}

interface ToolResultExport {
  tool: string;
  ok: boolean;
  summary: string;
  detail?: string;
}

function extractToolResultsFromContinuation(text: string): string {
  // 提取 <tool_results> JSON
  const re = /<tool_results>\s*([\s\S]*?)\s*<\/tool_results>/;
  const match = re.exec(text);
  if (!match) return '[Agent 工具执行]';

  try {
    const results: ToolResultExport[] = JSON.parse(match[1]);
    if (!Array.isArray(results) || results.length === 0) return '[Agent 工具执行]';

    const lines: string[] = ['[工具执行结果]'];
    for (const r of results) {
      const label = r.tool || 'unknown';
      const ok = r.ok ? 'OK' : 'ERR';
      const summary = r.summary || '';
      lines.push(`${ok} ${label}: ${summary}`);
    }

    // 附加 detail（截断）
    const details = results
      .filter((r) => r.ok && r.detail)
      .map((r) => `\n### ${r.tool}\n\n${r.detail}`);
    if (details.length > 0) {
      lines.push('');
      lines.push(...details);
    }

    return lines.join('\n');
  } catch {
    return '[Agent 工具执行]';
  }
}

// ============================================================
// 读取主世界储存的注入记录，合并到 user 消息
// ============================================================
function mergeInjectedPrefixes(messages: ChatMessage[]) {
  const el = document.getElementById('ds-mini-injected');
  if (!el) return;

  const raw = el.textContent || '';
  if (!raw) return;

  // 解析存储记录
  const records: Array<{ prefix: string; originalText: string }> = [];
  const parts = raw.split('||MSG_SEP||');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const sepIdx = part.indexOf('||SEP||');
    if (sepIdx === -1) continue;
    records.push({
      prefix: part.slice(0, sepIdx),
      originalText: part.slice(sepIdx + 7),
    });
  }

  if (records.length === 0) return;

  // records 和 user 消息按顺序一一对应
  let rIdx = 0;
  for (let i = 0; i < messages.length && rIdx < records.length; i++) {
    if (messages[i].role !== 'user') continue;

    const rec = records[rIdx];
    // 如果这个消息是工具结果回注，跳过（不对应任何 injection）
    if (messages[i].content.indexOf('[工具执行结果]') === 0) continue;

    // 如果 user 消息看起来和记录的原始文本匹配或包含它
    // 或者还没有被注入过 prefix
    if (messages[i].content.indexOf(rec.prefix) === -1) {
      messages[i].content = rec.prefix + '\n' + messages[i].content;
    }
    rIdx++;
  }
}

// ============================================================
// 获取会话标题
// ============================================================
function getChatTitle(): string {
  const t = document.querySelector('title');
  if (t) {
    const s = t.textContent?.replace(/ - DeepSeek.*$/i, '').trim();
    if (s) return s;
  }
  const h1 = document.querySelector('h1');
  if (h1?.textContent?.trim()) return h1.textContent.trim();
  return 'Chat Export';
}

// ============================================================
// Markdown 渲染
// ============================================================
function renderMarkdown(messages: ChatMessage[], title: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> 导出时间: ${now} ｜ 共 ${messages.length} 条消息`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('## 👤 你');
      lines.push('');
      lines.push(wrapToolResultMD(msg.content));
    } else {
      lines.push('## 🤖 DeepSeek');
      lines.push('');
      if (msg.thinking) {
        lines.push('> 💭 **思考过程**');
        lines.push('>');
        lines.push('> ' + msg.thinking.split('\n').join('\n> '));
        lines.push('');
        lines.push('---');
        lines.push('');
      }
      lines.push(msg.content);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// HTML 渲染 — 微信对话风格
// ============================================================
export function renderHTML(messages: ChatMessage[], title: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const chatHTML = messages.map(renderWeChatMessage).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<style>
${WECHAT_STYLE}
</style>
</head>
<body>
<div class="wx-chat">
  <header class="wx-nav">
    <span class="wx-nav-back">‹</span>
    <span class="wx-nav-title">${escapeHTML(title)}</span>
    <span class="wx-nav-more">···</span>
  </header>
  <main class="wx-body">
    <div class="wx-time">${now} · 共 ${messages.length} 条消息</div>
    ${chatHTML}
  </main>
  <footer class="wx-sys">由 Deepseek Enhancer 导出</footer>
</div>
</body>
</html>`;
}

function renderWeChatMessage(msg: ChatMessage): string {
  if (msg.role === 'user') {
    return `<div class="wx-row wx-me">
  <div class="wx-bubble"><div class="wx-content">${renderUserContentHTML(msg.content)}</div></div>
  <div class="wx-avatar wx-avatar-me">我</div>
</div>`;
  }

  const think = msg.thinking
    ? `<details class="wx-think" open>
  <summary>💭 思考过程</summary>
  <div class="wx-think-body">${escapeHTML(msg.thinking)}</div>
</details>`
    : '';

  return `<div class="wx-row wx-ai">
  <div class="wx-avatar wx-avatar-ai">DS</div>
  <div class="wx-bubble">${think}<div class="wx-content">${msg.renderedHTML ?? renderMarkdownToHTML(msg.content)}</div></div>
</div>`;
}

const WECHAT_STYLE = `  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC","Microsoft YaHei",Roboto,sans-serif;
    background:#dcdcdc;color:#111;line-height:1.7;display:flex;justify-content:center;
  }
  .wx-chat{
    width:100%;max-width:720px;min-height:100vh;background:#ededed;
    display:flex;flex-direction:column;box-shadow:0 0 24px rgba(0,0,0,.15);
  }
  .wx-nav{
    position:sticky;top:0;z-index:9;display:flex;align-items:center;
    height:48px;padding:0 12px;background:#f7f7f7;border-bottom:1px solid #ddd;
  }
  .wx-nav-back{color:#576b95;font-size:22px;line-height:1;min-width:36px}
  .wx-nav-title{
    flex:1;text-align:center;font-size:16px;font-weight:600;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;
  }
  .wx-nav-more{color:#576b95;font-size:16px;min-width:36px;text-align:right;letter-spacing:2px}
  .wx-body{flex:1;padding:14px 12px 28px}
  .wx-time{text-align:center;color:#b2b2b2;font-size:12px;margin:8px 0 18px}
  .wx-row{display:flex;align-items:flex-start;gap:12px;margin-bottom:20px}
  .wx-me{justify-content:flex-end}
  .wx-avatar{
    width:40px;height:40px;border-radius:6px;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:600;color:#fff;
  }
  .wx-avatar-ai{background:linear-gradient(135deg,#5470ff,#3a56e8)}
  .wx-avatar-me{background:#576b95}
  .wx-bubble{position:relative;max-width:78%;padding:10px 14px;border-radius:8px;font-size:15px}
  .wx-ai .wx-bubble{background:#fff}
  .wx-me .wx-bubble{background:#95ec69}
  .wx-ai .wx-bubble::before{
    content:"";position:absolute;left:-8px;top:12px;
    border-top:8px solid transparent;border-bottom:8px solid transparent;
    border-right:8px solid #fff;
  }
  .wx-me .wx-bubble::after{
    content:"";position:absolute;right:-8px;top:12px;
    border-top:8px solid transparent;border-bottom:8px solid transparent;
    border-left:8px solid #95ec69;
  }
  .wx-content{word-break:break-word}
  .wx-content>:first-child{margin-top:0}
  .wx-content>:last-child{margin-bottom:0}
  .wx-content p{margin:6px 0}
  .wx-content h1,.wx-content h2,.wx-content h3,.wx-content h4,.wx-content h5,.wx-content h6{
    margin:12px 0 6px;line-height:1.4;font-weight:600;
  }
  .wx-content h1{font-size:1.25em}
  .wx-content h2{font-size:1.18em}
  .wx-content h3{font-size:1.1em}
  .wx-content h4,.wx-content h5,.wx-content h6{font-size:1em}
  .wx-content ul,.wx-content ol{padding-left:1.4em;margin:6px 0}
  .wx-content li{margin:3px 0}
  .wx-content table{
    display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;
    margin:8px 0;font-size:.92em;
  }
  .wx-content th,.wx-content td{border:1px solid rgba(0,0,0,.12);padding:6px 10px;text-align:left}
  .wx-content th{background:rgba(0,0,0,.045);font-weight:600}
  .wx-content blockquote{
    border-left:3px solid rgba(0,0,0,.15);background:rgba(0,0,0,.04);
    padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0;
  }
  .wx-content hr{border:none;border-top:1px solid rgba(0,0,0,.12);margin:10px 0}
  .wx-content a{color:#576b95}
  .wx-content code{
    font-family:"JetBrains Mono","Fira Code",Consolas,"Courier New",monospace;
    font-size:.88em;background:rgba(0,0,0,.07);padding:1px 5px;border-radius:4px;
  }
  .wx-content pre{
    white-space:pre;overflow-x:auto;background:#26262d;color:#e6e6ee;
    padding:12px 14px;border-radius:8px;margin:8px 0;font-size:13px;line-height:1.5;
  }
  .wx-content pre code{background:none;padding:0;font-size:inherit;color:inherit}
  .wx-think{background:#f6f6f6;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:13px}
  .wx-think summary{cursor:pointer;color:#9a9a9a;font-weight:500;user-select:none}
  .wx-think-body{
    margin-top:6px;color:#8a8a8a;line-height:1.6;
    white-space:pre-wrap;word-break:break-word;max-height:340px;overflow-y:auto;
  }
  .wx-sys{text-align:center;color:#b2b2b2;font-size:12px;padding:10px 0 20px}
  @media print{
    body{background:#fff;display:block}
    .wx-chat{max-width:none;box-shadow:none}
    .wx-nav{position:static}
    .wx-nav-back,.wx-nav-more{visibility:hidden}
    .wx-row{break-inside:avoid}
  }`;

// ============================================================
// 工具结果内容处理 — 防止 Markdown 渲染
// ============================================================
export function wrapToolResultMD(content: string): string {
  // 将匹配到的 [工具执行结果] 区域包裹在 ``` 代码块中
  return content.replace(/(\[工具执行结果\][\s\S]*?)(?:\n---|$)/g, function (match) {
    // 去掉末尾可能匹配到的 ---
    const clean = match.replace(/\n---$/, '');
    return '```\n' + clean + '\n```\n---';
  });
}

function renderUserContentHTML(content: string): string {
  const re = /(\[工具执行结果\][\s\S]*?)(?:\n---|$)/g;
  const parts: string[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    // 普通内容部分
    if (match.index > lastIdx) {
      parts.push(renderMarkdownToHTML(content.slice(lastIdx, match.index)));
    }
    // 工具结果部分 → <pre> 包裹，不渲染 markdown
    const raw = match[1].replace(/\n---$/, '');
    parts.push(`<pre>${escapeHTML(raw)}</pre>`);
    lastIdx = match.index + match[0].length;
  }
  // 剩余部分
  if (lastIdx < content.length) {
    parts.push(renderMarkdownToHTML(content.slice(lastIdx)));
  }
  return parts.join('\n');
}

// ============================================================
// Markdown → 轻量 HTML（块级：代码块/标题/列表/表格/引用/分隔线/段落）
// ============================================================
function renderMarkdownToHTML(text: string): string {
  // 代码块先抽取为占位符，避免被转义和行内规则改写
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang: string, code: string) => {
    const la = lang ? ` data-lang="${escapeHTML(lang)}"` : '';
    codeBlocks.push(`<pre${la}><code>${escapeHTML(code.trim())}</code></pre>`);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  const lines = text.split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 独占一行的代码块占位符
    const cbMatch = /^\x00CB(\d+)\x00$/.exec(trimmed);
    if (cbMatch) {
      html.push(codeBlocks[Number(cbMatch[1])]);
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr>');
      i++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderMarkdownToHTML(quoted.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+[.、]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.、]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^\d+[.、]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const parseRow = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => renderInline(cell.trim()));
      const headers = parseRow(line);
      i += 2; // 跳过表头与分隔行
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      html.push(
        '<table><thead><tr>' +
          headers.map((h) => `<th>${h}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>',
      );
      continue;
    }

    // 段落：连续普通行，遇块级语法或空行结束
    const paraLines: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i])) {
      paraLines.push(renderInline(lines[i].trim()));
      i++;
    }
    html.push(`<p>${paraLines.join('<br>')}</p>`);
  }

  // 兜底：恢复混在行内的代码块占位符
  return html.join('\n').replace(/\x00CB(\d+)\x00/g, (_, n: string) => codeBlocks[Number(n)] ?? '');
}

function isTableStart(lines: string[], i: number): boolean {
  const header = lines[i].trim();
  const separator = lines[i + 1]?.trim();
  return /^\|.*\|$/.test(header) && !!separator && /^\|[\s:|-]+\|$/.test(separator);
}

function isBlockStart(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^\x00CB\d+\x00$/.test(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^>\s?/.test(t)) return true;
  if (/^[-*+]\s+/.test(t)) return true;
  if (/^\d+[.、]\s+/.test(t)) return true;
  if (/^\|.*\|$/.test(t)) return true;
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(t);
}

// 行内语法：行内码/粗体/斜体/删除线/链接（行内码先占位，避免内部被其他规则改写）
function renderInline(text: string): string {
  const inlineCodes: string[] = [];
  let out = escapeHTML(text).replace(/`([^`]+)`/g, (_, code: string) => {
    inlineCodes.push(`<code>${code}</code>`);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) =>
      /^https?:\/\//i.test(href)
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label,
    );

  inlineCodes.forEach((c, k) => {
    out = out.replace(`\x00IC${k}\x00`, () => c);
  });
  return out;
}

// ============================================================
// 已渲染回复 DOM → 净化 HTML（历史会话导出走此路径）
// ============================================================
// 页面装饰元素：代码块工具栏（语言标签+复制/下载按钮）、引用角标（含隐藏的 "-"）、图标
const RENDERED_DOM_CHROME_SELECTOR =
  '.md-code-block-banner-wrap, .ds-markdown-cite, svg, button, [role="button"]';

function extractRenderedReplyHTML(replyEl: HTMLElement): string {
  const clone = replyEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(RENDERED_DOM_CHROME_SELECTOR).forEach((el) => el.remove());
  return sanitizeRenderedHTML(clone.innerHTML);
}

const RENDERED_ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  'del',
  'a',
]);

// 白名单净化：只保留允许的标签；未知标签解包（保留文字）；属性全剥，仅 a 保留 http(s) href
export function sanitizeRenderedHTML(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
    .replace(
      /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g,
      (_m, slash: string, name: string, attrs: string) => {
        const tag = name.toLowerCase();
        if (!RENDERED_ALLOWED_TAGS.has(tag)) return '';
        if (slash) return `</${tag}>`;
        if (tag === 'a') {
          const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
          const href = hrefMatch && (hrefMatch[1] ?? hrefMatch[2]);
          if (href && /^https?:\/\//i.test(href)) {
            return `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">`;
          }
          return '<a>';
        }
        return `<${tag}>`;
      },
    );
}

// ============================================================
// 下载
// ============================================================
function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ============================================================
// 工具函数
// ============================================================
function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
