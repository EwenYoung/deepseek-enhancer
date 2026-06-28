// ============================================================
// deepseek-enhancer — 工具调用折叠块 UI
// ============================================================
import type { AppState, ToolCall, ToolResult } from './types';
import { extractToolCalls } from './sse-parser';
import { executeToolCall } from './tool-executor';

// ============================================================
// 状态
// ============================================================
let toolExecutionInProgress = false;
let loopDepth = 0;
const MAX_LOOP = 10;
let toolBlocksInited = false;
let silentModeEnabled = false; // Agent 模式开启时使用静默循环

// 由 content.ts 调用
export function setSilentMode(enabled: boolean) {
  silentModeEnabled = enabled;
}

// ============================================================
// 来自主世界（Main World）的工具调用入口
// ============================================================
export async function handleMainWorldToolCalls(toolCalls: ToolCall[]) {
  if (toolExecutionInProgress) return;
  if (!toolCalls || toolCalls.length === 0) return;

  // doc_generate 直接在 isolated world 中处理（不需要 background worker）
  const docCalls = toolCalls.filter(c => c.name === 'doc_generate');
  const otherCalls = toolCalls.filter(c => c.name !== 'doc_generate');

  for (const call of docCalls) {
    handleDocGenerate(call);
  }

  if (otherCalls.length === 0) return;

  const container = findChatContainer();
  if (!container) return;

  loopDepth++;
  if (loopDepth > MAX_LOOP) {
    console.warn('[DS-Mini:UI] Loop limit');
    loopDepth = 0;
    return;
  }

  toolExecutionInProgress = true;
  markLastAssistantProcessed(container);

  console.log('[DS-Mini:UI] Loop #' + loopDepth + ' — ' + toolCalls.length + ' call(s)');

  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const block = createLoadingBlock(call, container);
    insertBlockIntoChat(block, container);
    const result = await executeToolCall(call);
    results.push(result);
    block.replaceWith(createResultBlock(call, result));
  }

  const ok = results.filter(r => r.success);
  if (ok.length > 0) {
    const resultText = formatResults(ok);
    if (silentModeEnabled) {
      // 静默循环：通过 MAIN world XHR 发送，不经过 DOM
      window.postMessage({
        source: 'DS_MINI_ISOLATED',
        type: 'DS_MINI_SILENT_RESULT',
        text: resultText,
      }, '*');
      console.log('[DS-Mini:UI] Silent loop: result sent to MAIN world');
    } else {
      await domSubmitText(resultText);
    }
  }

  await delay(800);
  toolExecutionInProgress = false;
}

// ============================================================
// 初始化 — 带保护锁
// ============================================================
export function initToolBlocks(_state: AppState) {
  if (toolBlocksInited) return;
  toolBlocksInited = true;

  const container = findChatContainer();
  if (!container) return;

  new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) processNewContent(node);
      }
    }
  }).observe(container, { childList: true, subtree: true });
}

// ============================================================
// DOM 扫描 — 只处理最后一轮的最新流式消息
// ============================================================
function processNewContent(node: HTMLElement) {
  if (toolExecutionInProgress) return;
  if (node.closest && node.closest('[data-ds-tool-processed]')) return;
  if (!node.closest || !node.closest('.ds-message')) return;

  const container = findChatContainer();
  if (!container) return;
  const asstMsgs = container.querySelectorAll('.ds-message:not(.d29f3d7d)');
  if (!asstMsgs.length) return;
  if (node.closest('.ds-message') !== asstMsgs[asstMsgs.length - 1]) return;

  const text = node.textContent || '';
  const calls = extractToolCalls(text);
  if (!calls.length) return;

  hideRawToolCalls(node, calls);

  // 直接执行（不通过 onSSEToolCallDetected）
  handleMainWorldToolCalls(calls);
}

// ============================================================
// 隐藏原始 XML — 只在最新消息上操作，不碰历史
// ============================================================
function hideRawToolCalls(container: HTMLElement, toolCalls: ToolCall[]) {
  // 只操作最后一条助理消息
  const asstMsgs = container.querySelectorAll('.ds-message:not(.d29f3d7d)');
  if (!asstMsgs.length) return;
  const target = asstMsgs[asstMsgs.length - 1];

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    for (const call of toolCalls) {
      if (n.textContent?.includes(call.raw)) {
        n.textContent = n.textContent.replace(call.raw, '');
      }
    }
  }
}

// ============================================================
// 辅助
// ============================================================
function markLastAssistantProcessed(container: HTMLElement) {
  const msgs = container.querySelectorAll('.ds-message:not(.d29f3d7d)');
  const last = msgs[msgs.length - 1] as HTMLElement | undefined;
  if (last) last.setAttribute('data-ds-tool-processed', 'true');
}

function formatResults(results: ToolResult[]): string {
  return results.map(r => {
    const label = r.toolName === 'web_search' ? '联网搜索' : '网页抓取';
    return `[工具执行结果]\n工具: ${label}\n结果:\n${r.result}`;
  }).join('\n\n---\n\n');
}

function handleDocGenerate(call: import('./types').ToolCall) {
  const title = String(call.payload.title || 'document');
  const format = String(call.payload.format || 'md');
  const content = String(call.payload.content || '');
  if (!content) return;
  const ext = format === 'html' ? '.html' : '.md';
  const mime = format === 'html' ? 'text/html' : 'text/markdown';
  const fn = title.replace(/[^a-zA-Z0-9一-鿿\s_-]/g, '') + ext;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fn; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  console.log('[DS-Mini:UI] doc_generate:', fn);
}

// ============================================================
// DOM 提交
// ============================================================
async function domSubmitText(text: string) {
  await delay(400);
  const ta = document.querySelector('textarea');
  if (!ta) { console.warn('[DS-Mini:UI] domSubmit: no textarea'); return; }

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(ta, text); else ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));

  await delay(200);

  // 找发送按钮：在 textarea 附近找第一个可见的 SVG 按钮
  const root = ta.closest('form, div, section') || document.body;
  const btns = root.querySelectorAll('button');
  let found = false;
  for (const btn of btns) {
    if (btn.disabled) continue;
    const r = btn.getBoundingClientRect();
    if (r.width > 0 && r.width < 45 && r.height > 0 && r.height < 45) {
      btn.click();
      found = true;
      console.log('[DS-Mini:UI] domSubmit: sent');
      break;
    }
  }
  if (!found) {
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true,
    }));
    console.log('[DS-Mini:UI] domSubmit: Enter fallback');
  }
}

// ============================================================
// UI 块
// ============================================================
function createLoadingBlock(call: ToolCall, _c: HTMLElement): HTMLElement {
  const w = document.createElement('div');
  w.className = 'ds-mini-tool-block';
  w.setAttribute('data-ds-tool-status', 'loading');
  w.innerHTML = `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:8px 0;background:#f9fafb;font-family:-apple-system,sans-serif;font-size:14px"><div style="display:flex;align-items:center;gap:8px;color:#6b7280"><span>🔧</span><span>正在执行 ${getLabel(call.name)}...</span></div></div>`;
  return w;
}

function createResultBlock(call: ToolCall, result: ToolResult): HTMLElement {
  const ok = result.success;
  const bc = ok ? '#d1d5db' : '#fca5a5';
  const bg = ok ? '#f9fafb' : '#fef2f2';
  const id = `ds-tool-${call.id.slice(0, 8)}`;
  const c = ok ? escapeHTML(result.result || '(空)') : `❌ ${escapeHTML(result.error || '')}`;
  const w = document.createElement('div');
  w.className = 'ds-mini-tool-block';
  w.setAttribute('data-ds-tool-status', ok ? 'done' : 'error');
  w.innerHTML = `<div style="border:1px solid ${bc};border-radius:8px;margin:8px 0;background:${bg};font-family:-apple-system,sans-serif;font-size:14px;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;user-select:none;color:#374151;font-weight:500" onclick="var b=document.getElementById('${id}'),i=this.querySelector('.ds-toggle-icon');if(b)b.style.display=b.style.display==='none'?'block':'none';if(i)i.textContent=b.style.display==='none'?'▶':'▼'"><div style="display:flex;align-items:center;gap:8px"><span>${ok?'✅':'❌'}</span><span>${getLabel(call.name)} ${ok?'已完成':'失败'}</span><span style="color:#9ca3af;font-weight:400;font-size:12px">${result.duration.toFixed(0)}ms</span></div><span class="ds-toggle-icon" style="color:#9ca3af">▼</span></div><div id="${id}" style="padding:0 16px 12px;border-top:1px solid ${bc};white-space:pre-wrap;word-break:break-word;color:#374151;line-height:1.6">${c}</div></div>`;
  return w;
}

function insertBlockIntoChat(block: HTMLElement, container: HTMLElement) {
  // 在最后一个助理消息之后插入
  const msgs = container.querySelectorAll('.ds-message');
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg) {
    const nextEl = lastMsg.nextElementSibling;
    if (nextEl && nextEl.closest('.ds-mini-tool-block')) {
      // 如果有之前的 tool block，在其后追加
      const toolBlocks = container.querySelectorAll('.ds-mini-tool-block');
      const lastBlock = toolBlocks[toolBlocks.length - 1];
      if (lastBlock && lastBlock.parentNode === container) {
        lastBlock.after(block);
        return;
      }
    }
    lastMsg.after(block);
  } else {
    container.appendChild(block);
  }
}

function getLabel(name: string): string {
  const m: Record<string, string> = { web_search: '网络搜索', web_fetch: '网页抓取' };
  return m[name] || name;
}

function findChatContainer(): HTMLElement | null {
  return document.getElementById('root') || document.body;
}

function escapeHTML(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// 遗留导出保持兼容（不被调用，保留以防 import 错误）
export async function onSSEToolCallDetected() {}
