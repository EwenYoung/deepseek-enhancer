// ============================================================
// deepseek-enhancer — doc_generate 下载计划（纯函数）
// ============================================================
// 把一次 doc_generate 调用解析成落盘计划（文件名/格式/内容/去重键）。
// 模型输出的 JSON 可能非法（format=html 时 content 内层引号常不转义），
// payload 解析失败后需从原始 XML 宽松恢复字段；去重键只由解析结果决定，
// 与 raw 的截断差异无关（SSE 主路径与 DOM 兜底路径的 raw 可能不一致）。

import { isCompleteHtmlDocument, markdownToHtmlDoc } from './markdown';

export interface DocPlan {
  title: string;
  format: 'md' | 'html';
  content: string;
  /** 实际落盘内容：声明 html 但内容是 Markdown 时兜底渲染成完整文档 */
  out: string;
  mime: string;
  filename: string;
  /** 去重键：同一逻辑调用经多条路径触发时内容相同，键稳定 */
  key: string;
}

export function resolveDocPlan(
  raw: string | undefined,
  payload: Record<string, unknown>,
): DocPlan | null {
  const title = str(payload.title) || extractRawStringField(raw, 'title') || 'document';
  let format = (str(payload.format) || extractRawStringField(raw, 'format') || 'md').toLowerCase();
  const content = str(payload.content) || extractContentFromRaw(raw);
  if (!content) return null;
  // format 丢失或模型把完整 HTML 声明成 md 时，从内容嗅探纠正，避免产出假 .md
  if (format !== 'html' && isCompleteHtmlDocument(content)) format = 'html';
  const isHtml = format === 'html';
  const out =
    isHtml && !isCompleteHtmlDocument(content) ? markdownToHtmlDoc(title, content) : content;
  const safeTitle = title.replace(/[^a-zA-Z0-9一-鿿\s_-]/g, '').trim();
  return {
    title,
    format: isHtml ? 'html' : 'md',
    content,
    out,
    mime: isHtml ? 'text/html' : 'text/markdown',
    filename: (safeTitle || 'document') + (isHtml ? '.html' : '.md'),
    key: ['doc', format, title, String(content.length), content.slice(0, 300)].join('|'),
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 从原始 XML 提取简单字符串字段（title/format 这类不含内层引号的值） */
export function extractRawStringField(raw: string | undefined, field: string): string {
  if (!raw) return '';
  const m = new RegExp('"' + field + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(raw);
  if (!m) return '';
  try {
    return JSON.parse('"' + m[1] + '"') as string;
  } catch {
    return '';
  }
}

/**
 * 从原始 XML 提取 content 字段值。
 * 不能用严格正则一次匹配：模型输出未转义内层引号（format=html 常见）时，
 * 正则会在第一个内层引号处"成功"截断。改为游标扫描——字符串值里的引号
 * 只有其后（略过空白）是 `,` 或 `}` 时才算值结束。
 */
export function extractContentFromRaw(raw: string | undefined): string {
  if (!raw) return '';
  // 要求 "content" 后紧跟冒号再取值：其他字符串值里出现的 "content" 字样不会误配
  const field = /"content"\s*:/.exec(raw);
  if (!field) return '';
  let i = field.index + field[0].length;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== '"') return '';
  const open = i;
  for (i = open + 1; i < raw.length; i++) {
    if (raw[i] === '\\') {
      i++;
      continue;
    }
    if (raw[i] !== '"') continue;
    let j = i + 1;
    while (j < raw.length && /\s/.test(raw[j])) j++;
    if (raw[j] === ',' || raw[j] === '}') {
      const body = raw.slice(open + 1, i);
      try {
        return JSON.parse('"' + body + '"') as string;
      } catch {
        // 内层引号未转义：逐对处理转义序列，未转义引号原样保留
        return body.replace(/\\(.)/g, (_, c: string) =>
          c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
        );
      }
    }
  }
  return '';
}
