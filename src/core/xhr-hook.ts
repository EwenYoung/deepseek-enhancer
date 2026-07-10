// ============================================================
// deepseek-enhancer — XHR 拦截 + 上下文增强
// ============================================================
// DeepSeek 网页端使用 XMLHttpRequest (不是 fetch) 发送聊天请求
// 端点: /api/v0/chat/completion, 请求体: {prompt: "..."}
// 响应: SSE 流通过 XHR progress 事件
import type { AppState } from './types';
import { buildContext, buildContextPrefix, parseSkillCommand } from './context-builder';
import { TOOL_DESCRIPTORS } from './tool-descriptors';
import { extractToolCalls } from './sse-parser';
import { onSSEToolCallDetected } from './ui-tool-blocks';

// Augment XMLHttpRequest with custom properties for hook state tracking
interface AugmentedXHR extends XMLHttpRequest {
  _ds_url?: string;
  _ds_method?: string;
}

// ============================================================
// XHR Hook
// ============================================================
export function hookFetch(state: AppState) {
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as AugmentedXHR)._ds_url = String(url);
    (this as AugmentedXHR)._ds_method = method;
    return origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const url = (this as AugmentedXHR)._ds_url || '';
    const method = (this as AugmentedXHR)._ds_method || '';

    if (isChatCompletion(url, method)) {
      // 1. 注入上下文到 prompt
      body = augmentPrompt(body, state);

      // 2. 添加我们自己的 progress listener（独立于页面的 listener）
      this.addEventListener('progress', createSSEProgressHandler(state));
    }

    return origSend.call(this, body);
  };
}

// ============================================================
// Prompt 增强
// ============================================================
function augmentPrompt(
  body: Document | XMLHttpRequestBodyInit | null | undefined,
  state: AppState,
): Document | XMLHttpRequestBodyInit | null | undefined {
  if (typeof body !== 'string') return body;

  const parsed = JSON.parse(body) as Record<string, unknown>;
  if (!parsed.prompt || typeof parsed.prompt !== 'string') return body;

  const userContent = parsed.prompt;

  // 构建注入上下文
  const ctx = buildContext(TOOL_DESCRIPTORS, state.activeSkill);
  const prefix = buildContextPrefix(ctx);

  // 检测 /skill 命令
  const skillCmd = parseSkillCommand(userContent);

  if (skillCmd) {
    const skill = state.skills.find((s) => s.name === skillCmd.skillName && s.enabled);
    if (skill) {
      const skillCtx = buildContext(TOOL_DESCRIPTORS, skill);
      const skillPrefix = buildContextPrefix(skillCtx);
      const userArgs = skillCmd.args || userContent.slice(skillCmd.skillName.length + 1).trim();
      parsed.prompt = skillPrefix + (userArgs || userContent);
    }
  } else if (prefix) {
    parsed.prompt = prefix + userContent;
  }

  console.log('[DS-Mini] Injected context into prompt, length:', parsed.prompt.length);
  return JSON.stringify(parsed);
}

// ============================================================
// SSE Progress Handler
// ============================================================
// 每次 XHR progress 事件触发时解析 responseText 中的 SSE 数据
let sseTextBuffer = '';
let lastProcessedLength = 0;

function createSSEProgressHandler(_state: AppState) {
  return function (_event: ProgressEvent) {
    const xhr = _event.target as XMLHttpRequest;
    if (!xhr || !xhr.responseText) return;

    const fullText = xhr.responseText;
    if (fullText.length <= lastProcessedLength) return;

    // 只处理新增的部分
    const newPart = fullText.slice(lastProcessedLength);
    lastProcessedLength = fullText.length;

    // 按行解析 SSE
    const lines = newPart.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      try {
        const data = JSON.parse(dataStr);
        const text = extractTextFromDeepSeekData(data);
        if (text) {
          sseTextBuffer += text;
          checkToolCalls();
        }

        // 检测流结束
        if (isStreamFinished(data)) {
          flushToolCalls();
        }
      } catch {
        // 非 JSON，跳过
      }
    }
  };
}

// ============================================================
// 从 DeepSeek 的 SSE data 中提取文本
// ============================================================
// DeepSeek 的 SSE 格式（patch-based）:
// data: {"v":{"response":{"fragments":[{"o":"APPEND","path":"...content","v":"text"}]}}}
// 也兼容简化版本: data: {"v": "text"} 和 data: {"choices":[...]}
function extractTextFromDeepSeekData(data: unknown): string {
  if (!data || typeof data !== 'object') return '';

  const obj = data as Record<string, unknown>;

  // 格式1: {"v": "text"} — shorthand
  if (typeof obj.v === 'string') {
    return obj.v;
  }

  // 格式2: {"choices": [{"delta": {"content": "text"}}]} — OpenAI 兼容
  if (Array.isArray(obj.choices)) {
    let text = '';
    for (const choice of obj.choices) {
      const delta = (choice as { delta?: { content?: string } })?.delta;
      if (delta?.content && typeof delta.content === 'string') {
        text += delta.content;
      }
    }
    return text;
  }

  // 格式3: {"v": {"response": {"fragments": [...]}}} — DeepSeek patch
  const v = obj.v as Record<string, unknown> | undefined;
  if (!v) return '';

  const response = v.response as Record<string, unknown> | undefined;
  if (!response) return '';

  // Check for finish
  if (response.status === 'FINISHED') {
    flushToolCalls();
  }

  const fragments = response.fragments;
  if (!Array.isArray(fragments)) return '';

  let text = '';
  for (const frag of fragments) {
    const op = (frag as Record<string, unknown>)?.o || (frag as Record<string, unknown>)?.op;
    const path = (frag as Record<string, unknown>)?.path || '';
    const value = (frag as Record<string, unknown>)?.v;

    if ((op === 'APPEND' || op === 'append') && typeof value === 'string') {
      if (path.includes('content') || path.includes('text') || path.includes('delta')) {
        text += value;
      }
    }
  }

  return text;
}

// ============================================================
// 工具调用检测
// ============================================================
function checkToolCalls() {
  const toolCalls = extractToolCalls(sseTextBuffer);
  if (toolCalls.length > 0) {
    console.log(
      '[DS-Mini] Tool calls detected:',
      toolCalls.map((c) => c.name),
    );
    onSSEToolCallDetected(sseTextBuffer, null);
    for (const call of toolCalls) {
      sseTextBuffer = sseTextBuffer.replace(call.raw, '');
    }
  }
}

function flushToolCalls() {
  if (sseTextBuffer.trim()) {
    checkToolCalls();
  }
  sseTextBuffer = '';
  lastProcessedLength = 0;
}

// ============================================================
// 检测流结束
// ============================================================
function isStreamFinished(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // 检查 response/status === "FINISHED"
  const v = obj.v as Record<string, unknown> | undefined;
  if (v?.response && (v.response as Record<string, unknown>)?.status === 'FINISHED') return true;

  // 检查顶层 finish_reason
  if (Array.isArray(obj.choices)) {
    for (const c of obj.choices) {
      if ((c as { finish_reason?: string })?.finish_reason === 'stop') return true;
    }
  }

  return false;
}

// ============================================================
// 工具函数
// ============================================================
function isChatCompletion(url: string, method: string): boolean {
  return method.toUpperCase() === 'POST' && url.includes('/api/v0/chat/completion');
}
