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
// 构建正则：匹配所有已注册工具名的 XML 标签
let _toolCallRegex: RegExp | null = null;

function getToolCallRegex(): RegExp {
  if (_toolCallRegex) return _toolCallRegex;

  const names = TOOL_DESCRIPTORS.map((t) => t.name).join('|');
  // 闭合标签可选：DeepSeek 有时会省略 </web_search>
  const pattern = `<(${names})>\\s*(\\{[\\s\\S]*?\\})\\s*(?:<\\/\\1>)?`;
  _toolCallRegex = new RegExp(pattern, 'g');
  return _toolCallRegex;
}

/**
 * 从文本中提取所有工具调用
 */
export function extractToolCalls(text: string): ToolCall[] {
  const regex = getToolCallRegex();
  const calls: ToolCall[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const body = match[2].trim();

    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed;
      }
    } catch {
      // JSON 解析失败，用空 payload
    }

    calls.push({
      name,
      payload,
      raw: match[0],
      id: crypto.randomUUID(),
    });
  }

  return calls;
}

/**
 * 从文本中移除工具调用 XML 标签
 */
export function stripToolCalls(text: string): string {
  return text.replace(getToolCallRegex(), '').trim();
}

// ============================================================
// 任务完成标记（FR-5）
// ============================================================
const TASK_COMPLETE_REGEX = /<task_complete>\s*(\{[\s\S]*?\})\s*<\/task_complete>/;

/**
 * 从文本中检测 task_complete 标记，提取 summary
 */
export function extractTaskComplete(text: string): { found: boolean; summary: string } {
  const match = TASK_COMPLETE_REGEX.exec(text);
  if (!match) return { found: false, summary: '' };
  try {
    const parsed = JSON.parse(match[1]);
    return { found: true, summary: parsed.summary || '任务完成' };
  } catch {
    return { found: true, summary: '任务完成' };
  }
}

/**
 * 从文本中移除 task_complete 标记
 */
export function stripTaskComplete(text: string): string {
  return text.replace(/<task_complete>\s*\{[\s\S]*?\}\s*<\/task_complete>/g, '').trim();
}

/**
 * 收集完整文本并检测工具调用
 */
let _accumulatedText = '';

export function accumulateText(text: string): { text: string; toolCalls: ToolCall[] } {
  _accumulatedText += text;
  const toolCalls = extractToolCalls(_accumulatedText);
  const cleanText = stripToolCalls(_accumulatedText);

  return { text: cleanText, toolCalls };
}

export function resetAccumulator() {
  _accumulatedText = '';
}
