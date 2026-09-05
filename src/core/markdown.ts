// ============================================================
// deepseek-enhancer — Markdown → HTML 渲染
// ============================================================
// 块级：代码块/标题/列表/表格/引用/分隔线/段落；行内：代码/粗体/斜体/删除线/链接

import { escapeHTML } from './ui-kit';

/**
 * 渲染 Markdown 为 HTML 片段（导出会话气泡、doc_generate 兜底共用）
 * 输出不含文档级样式，由调用方包装
 */
export function renderMarkdownToHTML(text: string): string {
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
// doc_generate HTML 支撑
// ============================================================

/** 内容是否已是完整 HTML 文档（<!DOCTYPE html> 或 <html> 开头，允许前导空白） */
export function isCompleteHtmlDocument(content: string): boolean {
  return /^\s*(<!doctype\s+html|<html[\s>])/i.test(content);
}

const DOC_STYLE = `*{margin:0;padding:0;box-sizing:border-box}
  body{max-width:820px;margin:0 auto;padding:48px 24px;line-height:1.8;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC","Microsoft YaHei",Roboto,sans-serif;
    color:#1f2937;background:#fff}
  h1,h2,h3,h4,h5,h6{margin:24px 0 12px;line-height:1.4}
  h1,h2{border-bottom:1px solid #e5e7eb;padding-bottom:6px}
  p{margin:10px 0}
  ul,ol{margin:10px 0;padding-left:28px}
  li{margin:4px 0}
  pre{background:#f6f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;
    overflow-x:auto;margin:12px 0}
  pre code{background:none;padding:0;font-size:13px}
  code{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:0.9em;
    font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
  table{border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #e5e7eb;padding:6px 12px;text-align:left}
  th{background:#f9fafb}
  blockquote{border-left:4px solid #d1d5db;padding:4px 14px;margin:12px 0;color:#6b7280}
  hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
  a{color:#4e6ef2}
  img{max-width:100%}`;

/**
 * 将 Markdown 包装为带样式的完整 HTML 文档（doc_generate 兜底：
 * 模型声称 format=html 但给了 Markdown 时渲染成可看的网页）
 */
export function markdownToHtmlDoc(title: string, md: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<style>
${DOC_STYLE}
</style>
</head>
<body>
${renderMarkdownToHTML(md)}
</body>
</html>`;
}
