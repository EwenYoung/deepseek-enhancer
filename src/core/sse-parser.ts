// ============================================================
// deepseek-enhancer — SSE 流式响应解析
// ============================================================
// 解析 DeepSeek 的 SSE 流式响应，提取文本内容和工具调用
import type { ToolCall } from './types';
import { TOOL_DESCRIPTORS } from './tool-descriptors';

// ============================================================
// 类型
// ============================================================
export interface ParsedMessage {
  /** 提取的文本增量 */
  text: string;
  /** 提取的工具调用（可能有多个） */
  toolCalls: ToolCall[];
  /** 消息是否完成 */
  finished: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================
// SSE 块解析
// ============================================================
export function parseSSEChunk(chunk: string): ParsedMessage | null {
  const lines = chunk.split('\n');
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;

  const data = dataLines.join('\n');

  // [DONE] 标记
  if (data === '[DONE]') {
    return { text: '', toolCalls: [], finished: true };
  }

  try {
    const parsed = JSON.parse(data);
    return extractContent(parsed);
  } catch {
    // 非 JSON 数据，忽略
    return null;
  }
}

// ============================================================
// 内容提取
// ============================================================
// DeepSeek 的 SSE 格式类似于 OpenAI:
// {"choices":[{"delta":{"content":"text"}}]}
// 也可能是内部格式（patch-based）—— 兼容处理

function extractContent(parsed: unknown): ParsedMessage {
  const result: ParsedMessage = { text: '', toolCalls: [], finished: false };

  if (!parsed || typeof parsed !== 'object') return result;

  const obj = parsed as Record<string, unknown>;

  // ============================================================
  // 方式0a: 新格式裸 string v 行（{"v":"text"}）
  // DeepSeek 新流式格式的主体就是这种行（4521/4533 行）。
  // 排除 o === 'SET' 的状态行（如 {"p":"response/status","o":"SET","v":"FINISHED"}），
  // 否则 FINISHED 等状态值会被当作文本追加进 buffer，污染导出数据。
  // ponytail: 与 main-xhr-inject.ts extractTextFromData 的 string v 分支保持一致。
  // ============================================================
  if (typeof obj.v === 'string' && obj.o !== 'SET') {
    result.text += obj.v;
  }

  // ============================================================
  // 方式0: 新格式 fragments 数组行（{"p":"response/fragments","o":"APPEND","v":[{type,content,...}]}）
  // 开标签 `<` 等字符可能以数组形式到达，旧实现只处理 string v 会漏掉
  // ============================================================
  if (obj.o === 'APPEND' && Array.isArray(obj.v)) {
    for (const fr of obj.v as Array<Record<string, unknown>>) {
      if (
        fr &&
        typeof fr.content === 'string' &&
        (fr.type === 'RESPONSE' || fr.type === 'TEXT' || !fr.type)
      ) {
        result.text += fr.content;
      }
    }
  }

  // ============================================================
  // 方式1: OpenAI 兼容格式
  // ============================================================
  if (obj.choices && Array.isArray(obj.choices)) {
    for (const choice of obj.choices) {
      // finish_reason
      if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
        result.finished = true;
      }

      // delta.content
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (delta?.content && typeof delta.content === 'string') {
        result.text += delta.content;
      }
    }
  }

  // ============================================================
  // 方式2: DeepSeek 内部 Patch 格式
  // ============================================================
  if (obj.response) {
    const response = obj.response as Record<string, unknown>;
    extractPatchText(response, result);
  }

  // 方式0 的结束标记（{"p":"response/status","o":"SET","v":"FINISHED"}）
  if (obj.o === 'SET' && obj.p === 'response/status' && obj.v === 'FINISHED') {
    result.finished = true;
  }

  // ============================================================
  // 提取 token usage
  // ============================================================
  if (obj.usage) {
    const usage = obj.usage as Record<string, number>;
    result.usage = {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }

  return result;
}

// ============================================================
// Patch 格式文本提取
// ============================================================
function extractPatchText(response: Record<string, unknown>, result: ParsedMessage) {
  // 检查 status
  if (response.status === 'FINISHED') {
    result.finished = true;
  }

  // 遍历 fragments
  const fragments = response.fragments;
  if (!Array.isArray(fragments)) return;

  for (const fragment of fragments) {
    if (!fragment || typeof fragment !== 'object') continue;
    const op = (fragment as Record<string, unknown>).o;
    const path = (fragment as Record<string, unknown>).path;
    const value = (fragment as Record<string, unknown>).v;

    // APPEND 操作 — 追加文本
    if ((op === 'APPEND' || op === 'append') && typeof value === 'string') {
      if (isTextPath(path)) {
        result.text += value;
      }
    }
  }
}

function isTextPath(path: unknown): boolean {
  if (typeof path !== 'string') return false;
  return path.includes('content') || path.includes('text') || path.includes('delta');
}

// ============================================================
// 工具调用 XML 解析
// ============================================================
// 构建正则：匹配所有已注册工具名的 XML 标签（仅标签，JSON 主体由平衡扫描提取）
let _toolCallRegex: RegExp | null = null;

function getToolCallRegex(): RegExp {
  if (_toolCallRegex) return _toolCallRegex;

  const names = TOOL_DESCRIPTORS.map((t) => t.name).join('|');
  // 只匹配标签本身；主体 JSON 可能含嵌套花括号（如 content 里的代码/公式），
  // 不能用非贪婪正则截取，须由 extractBalancedJson 扫描
  _toolCallRegex = new RegExp(`<(${names})>`, 'g');
  return _toolCallRegex;
}

/**
 * 从 startIndex 起扫描平衡 JSON 对象（跳过字符串与转义），返回完整 JSON 文本
 */
function extractBalancedJson(text: string, startIndex: number): string | null {
  if (text[startIndex] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

/**
 * 宽松解析模型输出的 JSON：先严格 parse，失败后修复常见瑕疵重试：
 * 1. 字符串值内未转义的控制字符（真实换行/回车/Tab）→ 转义序列
 * 2. 尾逗号（,} 或 ,]）→ 移除
 * 仍失败返回 null（调用方用空 payload）
 */
function parseToolJsonLoose(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    // fallthrough → 修复重试
  }

  let fixed = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) {
        fixed += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        fixed += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        fixed += ch;
        inString = false;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        // 未转义控制字符 → 转义（避免 JSON.parse 报 Bad control character）
        fixed +=
          ch === '\n'
            ? '\\n'
            : ch === '\r'
              ? '\\r'
              : ch === '\t'
                ? '\\t'
                : `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      fixed += ch;
      continue;
    }
    if (ch === '"') inString = true;
    fixed += ch;
  }
  // 尾逗号
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  try {
    const parsed = JSON.parse(fixed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // 修复后仍失败
  }
  return null;
}

/**
 * 从文本中提取所有工具调用
 */
export function extractToolCalls(text: string): ToolCall[] {
  const regex = getToolCallRegex();
  const calls: ToolCall[] = [];
  let match: RegExpExecArray | null;

  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const tagEnd = match.index + match[0].length;

    // 跳过标签与 JSON 之间的空白
    let jsonStart = tagEnd;
    while (jsonStart < text.length && /\s/.test(text[jsonStart])) jsonStart++;
    const body = extractBalancedJson(text, jsonStart);
    if (!body) continue;

    // raw = 标签 + 空白 + JSON（闭合标签可选，DeepSeek 有时省略）
    let rawEnd = jsonStart + body.length;
    const afterRaw = text.slice(rawEnd).match(new RegExp(`^\\s*</${name}>`));
    let raw = text.slice(match.index, rawEnd);
    if (afterRaw) {
      raw += afterRaw[0];
      rawEnd += afterRaw[0].length;
    }

    let payload: Record<string, unknown> = {};
    const parsed = parseToolJsonLoose(body);
    if (parsed) payload = parsed;

    calls.push({
      name,
      payload,
      raw,
      id: crypto.randomUUID(),
    });

    // 跳过已消费的 raw，避免重复匹配（如数组 JSON 被正则误吞）
    regex.lastIndex = rawEnd;
  }

  return calls;
}

/**
 * 从文本中移除工具调用 XML 标签
 */
export function stripToolCalls(text: string): string {
  let result = text;
  for (const call of extractToolCalls(result)) {
    result = result.replace(call.raw, '');
  }
  return result.trim();
}

// ============================================================
// 任务完成标记（FR-5）
// ============================================================

// ============================================================
// 任务完成标记（FR-5）
// ============================================================

/**
 * 从文本中检测 task_complete 标记，提取 summary
 * 与工具调用同理：JSON 主体用平衡扫描提取，summary 含嵌套花括号也不会截断
 */
export function extractTaskComplete(text: string): { found: boolean; summary: string } {
  const tagStart = text.indexOf('<task_complete>');
  if (tagStart < 0) return { found: false, summary: '' };
  const jsonStart = tagStart + '<task_complete>'.length;
  const body = extractBalancedJson(text, jsonStart);
  if (!body) return { found: false, summary: '' };
  const parsed = parseToolJsonLoose(body);
  return { found: true, summary: (parsed?.summary as string) || '任务完成' };
}

/**
 * 从文本中移除 task_complete 标记（平衡扫描定位，summary 含花括号也能完整移除）
 */
export function stripTaskComplete(text: string): string {
  let result = text;
  while (true) {
    const tagStart = result.indexOf('<task_complete>');
    if (tagStart < 0) break;
    const jsonStart = tagStart + '<task_complete>'.length;
    const body = extractBalancedJson(result, jsonStart);
    if (!body) break;
    let end = jsonStart + body.length;
    const close = result.slice(end).match(/^\s*<\/task_complete>/);
    if (close) end += close[0].length;
    result = result.slice(0, tagStart) + result.slice(end);
  }
  return result.trim();
}

/**
 * 累积状态 — 每个流/请求持有独立实例，避免跨请求污染
 */
export interface AccumulateState {
  accumulatedText: string;
}

/**
 * 创建独立的累积状态实例
 */
export function createAccumulateState(): AccumulateState {
  return { accumulatedText: '' };
}

/**
 * 收集完整文本并检测工具调用
 * @param text 新增文本
 * @param state 该请求独立的累积状态
 */
export function accumulateText(
  text: string,
  state: AccumulateState,
): { text: string; toolCalls: ToolCall[] } {
  state.accumulatedText += text;
  const toolCalls = extractToolCalls(state.accumulatedText);
  const cleanText = stripToolCalls(state.accumulatedText);

  return { text: cleanText, toolCalls };
}

export function resetAccumulator(state: AccumulateState) {
  state.accumulatedText = '';
}
