// ============================================================
// deepseek-enhancer — 会话导出 (Markdown / HTML)
// ============================================================

export type ExportFormat = 'markdown' | 'html';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
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
      // Assistant 消息 — 优先使用缓存的原始 Markdown 文本
      const thinking = thinkEl?.textContent?.trim() || '';
      const raw = asstRawTexts[asstIdx];
      const reply = raw ? raw.trim() : replyEl.textContent?.trim();
      if (reply) {
        messages.push({
          role: 'assistant' as const,
          content: reply,
          thinking: thinking || undefined,
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
// HTML 渲染
// ============================================================
function renderHTML(messages: ChatMessage[], title: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const msgHTML = messages
    .map((msg) => {
      if (msg.role === 'user') {
        return `<div class="message user">
        <div class="msg-label user-label">👤 你</div>
        <div class="msg-body">${renderUserContentHTML(msg.content)}</div>
      </div>`;
      }

      let html = `<div class="message assistant">
      <div class="msg-label ai-label">🤖 DeepSeek</div>`;

      if (msg.thinking) {
        html += `<details class="think-block" open>
        <summary>💭 思考过程</summary>
        <div class="think-content">${escapeHTML(msg.thinking)}</div>
      </details>`;
      }

      html += `<div class="msg-body">${renderMarkdownToHTML(msg.content)}</div></div>`;
      return html;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;
    background:#f3f4f6;color:#1f2937;line-height:1.7;padding:20px
  }
  .container{
    max-width:860px;margin:0 auto;background:#fff;border-radius:12px;
    box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden
  }
  .header{
    background:#4f46e5;color:#fff;padding:28px 32px
  }
  .header h1{font-size:22px;font-weight:700;margin-bottom:6px}
  .header .meta{font-size:13px;opacity:.85}
  .chat-body{padding:12px 24px}
  .message{padding:20px 0;border-bottom:1px solid #f3f4f6}
  .message:last-child{border-bottom:none}
  .msg-label{font-size:13px;font-weight:600;margin-bottom:10px}
  .user-label{color:#4f46e5}
  .ai-label{color:#059669}
  .msg-body{font-size:15px;white-space:pre-wrap;word-break:break-word}
  .think-block{
    background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
    padding:12px 16px;margin:0 0 14px;font-size:14px
  }
  .think-block summary{
    cursor:pointer;font-weight:600;color:#64748b;user-select:none
  }
  .think-content{
    margin-top:8px;color:#475569;white-space:pre-wrap;font-size:13px;line-height:1.6
  }
  .msg-body pre{
    background:#1e293b;color:#e2e8f0;padding:14px 16px;border-radius:8px;
    overflow-x:auto;font-size:13px;line-height:1.5;margin:10px 0
  }
  .msg-body code{font-family:"JetBrains Mono","Fira Code",monospace;font-size:13px}
  .msg-body p code{background:#f1f5f9;color:#e11d48;padding:2px 6px;border-radius:4px}
  .msg-body table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
  .msg-body th,.msg-body td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}
  .msg-body th{background:#f9fafb;font-weight:600}
  .msg-body blockquote{
    border-left:4px solid #4f46e5;padding:8px 16px;margin:10px 0;
    background:#f5f3ff;color:#4c1d95;border-radius:0 8px 8px 0
  }
  .msg-body ul,.msg-body ol{padding-left:24px;margin:8px 0}
  .msg-body li{margin:4px 0}
  .msg-body h1,.msg-body h2,.msg-body h3,.msg-body h4{margin:16px 0 8px;color:#111827}
  .footer{text-align:center;padding:16px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6}
  @media print{body{background:#fff;padding:0}.container{box-shadow:none;border-radius:0}.message{break-inside:avoid}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHTML(title)}</h1>
    <div class="meta">📅 ${now} · 💬 ${messages.length} 条消息</div>
  </div>
  <div class="chat-body">${msgHTML}</div>
  <div class="footer">由 Deepseek Enhancer 导出</div>
</div>
</body>
</html>`;
}

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
    parts.push(
      '<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:13px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;word-break:break-word;color:#374151;">' +
        escapeHTML(raw) +
        '</pre>',
    );
    lastIdx = match.index + match[0].length;
  }
  // 剩余部分
  if (lastIdx < content.length) {
    parts.push(renderMarkdownToHTML(content.slice(lastIdx)));
  }
  return parts.join('\n');
}

// ============================================================
// Markdown → 轻量 HTML
// ============================================================
function renderMarkdownToHTML(text: string): string {
  const blocks: string[] = [];
  let idx = 0;
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `\x00CODE_BLOCK_${idx}\x00`;
    const la = lang ? ` data-lang="${escapeHTML(lang)}"` : '';
    blocks.push(`<pre${la}><code>${escapeHTML(code.trim())}</code></pre>`);
    idx++;
    return placeholder;
  });

  text = escapeHTML(text);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  text = text.replace(/\n/g, '<br>');

  for (let i = 0; i < blocks.length; i++) {
    text = text.replace(`\x00CODE_BLOCK_${i}\x00`, blocks[i]);
  }
  return text;
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
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
