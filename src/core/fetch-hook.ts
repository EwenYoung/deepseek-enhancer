// ============================================================
// deepseek-enhancer — Fetch 拦截 + 上下文增强
// ============================================================
// 拦截 chat API 请求，在用户消息前注入工具定义和 skill 指令
// 同时拦截 SSE 响应流，检测工具调用
import type { AppState } from './types';
import { buildContext, buildContextPrefix, parseSkillCommand } from './context-builder';
import { TOOL_DESCRIPTORS } from './tool-descriptors';
import { parseSSEChunk, extractToolCalls, type ParsedMessage } from './sse-parser';
import { onSSEToolCallDetected } from './ui-tool-blocks';

// ============================================================
// 类型
// ============================================================
interface DeepSeekRequestBody {
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
  [key: string]: unknown;
}

// ============================================================
// Fetch Hook
// ============================================================
export function hookFetch(state: AppState) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // 只拦截 DeepSeek 聊天 API 请求
    if (!isChatAPI(url) || !init?.body) {
      return originalFetch(input, init);
    }

    try {
      // 修改请求体 — 注入上下文
      const modifiedBody = augmentRequestBody(init.body, state);
      const modifiedInit = { ...init, body: modifiedBody };

      const response = await originalFetch(input, modifiedInit);

      // 如果是 SSE 流，tee 一份给我们的解析器
      if (init.body && isStreamRequest(init.body) && response.body) {
        return teeStreamResponse(response, state);
      }

      return response;
    } catch (err) {
      console.warn('[DS-Mini] Fetch hook error, falling back:', err);
      // 降级：发送原始请求
      return originalFetch(input, init);
    }
  };
}

// ============================================================
// 请求体增强
// ============================================================
function augmentRequestBody(body: BodyInit, state: AppState): BodyInit {
  if (typeof body !== 'string') return body;

  const parsed: DeepSeekRequestBody = JSON.parse(body);
  if (!parsed.messages || parsed.messages.length === 0) return body;

  // 构建注入上下文
  const ctx = buildContext(TOOL_DESCRIPTORS, state.activeSkill);
  const prefix = buildContextPrefix(ctx);
  if (!prefix) return body; // 没有需要注入的内容

  // 找到最后一条 user 消息
  const lastUserIdx = findLastIndex(parsed.messages, (m) => m.role === 'user');
  if (lastUserIdx === -1) return body;

  // 检测 /skill 命令
  const userContent = parsed.messages[lastUserIdx].content;
  const skillCmd = parseSkillCommand(userContent);

  if (skillCmd) {
    // 匹配 skill 并注入其 instructions
    const skill = state.skills.find((s) => s.name === skillCmd.skillName && s.enabled);
    if (skill) {
      const skillCtx = buildContext(TOOL_DESCRIPTORS, skill);
      const skillPrefix = buildContextPrefix(skillCtx);
      const userArgs = skillCmd.args || userContent.slice(skillCmd.skillName.length + 1).trim();
      parsed.messages[lastUserIdx].content = skillPrefix + (userArgs || userContent);
    }
  } else {
    // 正常注入工具定义（无 skill）
    parsed.messages[lastUserIdx].content = prefix + parsed.messages[lastUserIdx].content;
  }

  return JSON.stringify(parsed);
}

// ============================================================
// SSE 流拦截
// ============================================================
function teeStreamResponse(response: Response, state: AppState): Response {
  const [ourStream, pageStream] = response.body!.tee();

  // 后台解析 SSE 流
  parseStreamInBackground(ourStream, state);

  // 返回原始流给页面
  return new Response(pageStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function parseStreamInBackground(stream: ReadableStream<Uint8Array>, state: AppState) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // 按 SSE 双换行边界分割
      const parts = buffer.split('\n\n');
      // 最后一个可能不完整，保留到下次
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        const parsed = parseSSEChunk(part);
        if (parsed) {
          handleParsedMessage(parsed, state);
        }
      }
    }

    // 处理最后的 buffer
    if (buffer.trim()) {
      const parsed = parseSSEChunk(buffer);
      if (parsed) {
        handleParsedMessage(parsed, state);
      }
    }
  } catch (err) {
    console.warn('[DS-Mini] Stream parsing error:', err);
  } finally {
    reader.releaseLock();
  }
}

// ============================================================
// SSE 文本积累 & 工具调用检测
// ============================================================
let sseTextBuffer = '';

function handleParsedMessage(msg: ParsedMessage, _state: AppState) {
  if (!msg.text && !msg.finished) return;

  // 积累文本
  sseTextBuffer += msg.text;

  // 流结束时 flush
  if (msg.finished) {
    checkToolCalls();
    sseTextBuffer = '';
  } else if (msg.text) {
    // 流式过程中检测（每收到文本就检查）
    checkToolCalls();
  }
}

function checkToolCalls() {
  const toolCalls = extractToolCalls(sseTextBuffer);
  if (toolCalls.length > 0) {
    onSSEToolCallDetected(sseTextBuffer, null);
    // 清除已处理的工具调用文本
    for (const call of toolCalls) {
      sseTextBuffer = sseTextBuffer.replace(call.raw, '');
    }
  }
}

// ============================================================
// 工具函数
// ============================================================
function isChatAPI(url: string): boolean {
  return (
    url.includes('chat.deepseek.com') &&
    (url.includes('/chat/completions') || url.includes('/v1/chat'))
  );
}

function isStreamRequest(body: BodyInit): boolean {
  if (typeof body !== 'string') return false;
  try {
    const parsed = JSON.parse(body);
    return parsed.stream === true;
  } catch {
    return false;
  }
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
