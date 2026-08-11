// ============================================================
// deepseek-enhancer — 轻量级内联 Markdown 渲染器
// ============================================================
// 移植自 deepseek-pp core/inline-agent/markdown.ts
// 支持基础语法: headers, bold, italic, code, links, tables, lists

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 将 Markdown 文本转换为 HTML，适合内联流式渲染
 */
export function renderInlineMarkdown(text: string): string {
  if (!text) return '';

  // 按行处理，支持块级元素
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  const codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        continue;
      } else {
        inCodeBlock = false;
        const code = escapeHTML(codeLines.join('\n'));
        result.push(`<pre><code>${code || ' '}</code></pre>`);
        codeLines.length = 0;
        continue;
      }
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      result.push('<br>');
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const content = escapeHTML(hMatch[2]);
      result.push(`<h${level} style="margin:4px 0;font-weight:600">${content}</h${level}>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (ulMatch) {
      result.push(
        `<ul style="margin:2px 0;padding-left:16px"><li>${renderInlineSpans(escapeHTML(ulMatch[1]))}</li></ul>`,
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (olMatch) {
      result.push(
        `<ol style="margin:2px 0;padding-left:16px"><li>${renderInlineSpans(escapeHTML(olMatch[1]))}</li></ol>`,
      );
      continue;
    }

    // Table separator (skip)
    if (/^\|[\s\-:|]+\|$/.test(line)) continue;

    // Table row
    if (/^\|.+\|$/.test(line)) {
      const cells = line.split('|').filter((c) => c.trim() !== '');
      const tag = i > 0 && lines[i + 1] && /^\|[\s\-:|]+\|$/.test(lines[i + 1]) ? 'th' : 'td';
      const row = cells
        .map(
          (c) =>
            `<${tag} style="padding:2px 8px;border:1px solid rgba(0,0,0,0.1)">${renderInlineSpans(escapeHTML(c.trim()))}</${tag}>`,
        )
        .join('');
      result.push(`<table style="border-collapse:collapse;margin:4px 0"><tr>${row}</tr></table>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      result.push('<hr style="border:none;border-top:1px solid rgba(0,0,0,0.1);margin:8px 0">');
      continue;
    }

    // Regular paragraph
    result.push(`<div style="margin:2px 0">${renderInlineSpans(escapeHTML(line))}</div>`);
  }

  // Unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    result.push(`<pre><code>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
  }

  return result.join('\n');
}

/**
 * 渲染内联 Markdown 元素: bold, italic, code, links
 * 输入必须已经被 HTML 转义
 */
function renderInlineSpans(text: string): string {
  // Bold-italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(
    /`([^`]+)`/g,
    '<code style="background:rgba(0,0,0,0.05);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>',
  );
  // Links — 协议白名单防止 javascript: 等 XSS
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    if (!/^(https?|mailto):/i.test(href)) return label;
    return (
      '<a href="' +
      href +
      '" target="_blank" rel="noopener" style="color:#4e6ef2">' +
      label +
      '</a>'
    );
  });

  return text;
}
