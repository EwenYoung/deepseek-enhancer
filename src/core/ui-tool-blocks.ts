// ============================================================
// deepseek-enhancer — 工具调用折叠块 UI
// ============================================================
import type { AppState, ToolCall, ToolResult } from './types';
import { extractToolCalls, extractTaskComplete, stripTaskComplete } from './sse-parser';
import { executeToolCall } from './tool-executor';
import wasmUrl from '../../public/deepseek/sha3_wasm_bg.wasm?url';
// ============================================================
// 状态
// ============================================================
let toolExecutionInProgress = false;
let loopDepth = 0;
const MAX_LOOP = 10;
let toolBlocksInited = false;
let silentModeEnabled = false; // Agent 模式开启时使用静默循环
let savedReqHeaders: Record<string, string> | null = null; // PoW 请求用

// 由 content.ts 调用
export function setSilentMode(enabled: boolean) {
  silentModeEnabled = enabled;
}

// ============================================================
// 来自主世界（Main World）的工具调用入口
// ============================================================
export async function handleMainWorldToolCalls(
  toolCalls: ToolCall[],
  silentDepth?: number,
  reqHeaders?: Record<string, string> | null,
) {
  // 必须在 toolExecutionInProgress 检查之前存储（消息路径因锁被跳过）
  if (reqHeaders) savedReqHeaders = reqHeaders;
  if (toolExecutionInProgress) {
    console.log('[DS-Mini:UI] Skipped — tool execution already in progress');
    return;
  }
  if (!toolCalls || toolCalls.length === 0) return;

  // 新用户消息触发的首次工具调用 → 重置 loop 计数器
  if (silentDepth === 0 || silentDepth === undefined) {
    if (loopDepth > 0)
      console.log('[DS-Mini:UI] New flow detected, reset loopDepth (was ' + loopDepth + ')');
    loopDepth = 0;
  }

  // doc_generate 直接在 isolated world 中处理（不需要 background worker）
  const docCalls = toolCalls.filter((c) => c.name === 'doc_generate');
  const otherCalls = toolCalls.filter((c) => c.name !== 'doc_generate');

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

  const ok = results.filter((r) => r.success);
  console.log('[DS-Mini:UI] Tool results:', results.length + ' total, ' + ok.length + ' OK');
  if (ok.length > 0) {
    if (silentModeEnabled) {
      // 方案 A：静默循环 — 计算 PoW 后直发 XHR
      try {
        const powHeader = await computePowHeader();
        window.postMessage(
          {
            source: 'DS_MINI_ISOLATED',
            type: 'DS_MINI_SILENT_RESULT',
            text: formatResults(ok),
            powHeader: powHeader,
          },
          '*',
        );
        console.log('[DS-Mini:UI] Silent loop: result + PoW sent to MAIN world');
      } catch (powErr) {
        console.warn('[DS-Mini:UI] PoW failed, fallback to DOM', powErr);
        await domSubmitText(formatResults(ok));
        scanAndHideToolResults();
      }
    } else {
      await domSubmitText(formatResults(ok));
      scanAndHideToolResults();
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

  // 注入 hover 样式
  const style = document.createElement('style');
  style.textContent = `.ds-mini-tool-block > div:first-child > div[onclick]:hover { background: rgba(0,0,0,0.04); }`;
  document.head.appendChild(style);

  const container = findChatContainer();
  if (!container) return;

  new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) {
          processNewContent(node);
          // 新消息出现时，多次尝试重排序（等待渲染完成）
          if (node.classList?.contains('ds-message') && !toolExecutionInProgress) {
            let attempts = 0;
            const tryReorder = () => {
              reorderToolBlocks();
              attempts++;
              if (attempts < 5) setTimeout(tryReorder, 500);
            };
            setTimeout(tryReorder, 300);
          }
        }
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

  // FR-5: 检查 task_complete 标记
  const complete = extractTaskComplete(text);
  if (complete.found) {
    console.log('[DS-Mini:UI] Task complete marker detected, summary:', complete.summary);
    // 从可见文本移除标记
    hideRawTaskComplete(node, complete);
  }

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

/**
 * FR-5: 从可见 DOM 文本中移除 task_complete 标记
 */
function hideRawTaskComplete(container: HTMLElement, taskComplete: { found: boolean; summary: string }) {
  if (!taskComplete.found) return;
  const asstMsgs = container.querySelectorAll('.ds-message:not(.d29f3d7d)');
  if (!asstMsgs.length) return;
  const target = asstMsgs[asstMsgs.length - 1];

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    const stripped = stripTaskComplete(n.textContent || '');
    if (stripped !== n.textContent) {
      n.textContent = stripped;
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
  const structured = results.map((r) => {
    const label =
      r.toolName === 'web_search'
        ? '联网搜索'
        : r.toolName === 'web_fetch'
          ? '网页抓取'
          : r.toolName;
    return {
      tool: label,
      ok: r.success,
      summary: r.summary || '',
      detail: clampText(r.detail || r.result || '', 4000),
      output: r.output ?? null,
      error: r.error || undefined,
      truncated: r.truncated || false,
    };
  });

  let originalTask = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalTask = (window as any).__DS_ORIGINAL_PROMPT__ || '';
  } catch {
    /* cross-world access may fail, that's ok */
  }

  let task = originalTask || '';
  if (task.length > 8000) task = task.slice(0, 8000);

  return [
    '以下是工具执行结果。请基于原始任务和这些结果继续推进。',
    '如果结果已经足够，请输出最终结论；只有确实需要更多信息时才继续调用工具。',
    '',
    '<original_task>',
    task,
    '</original_task>',
    '',
    '<tool_results>',
    JSON.stringify(structured, null, 2),
    '</tool_results>',
  ].join('\n');
}

function clampText(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen) + '...（已截断）';
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
  a.href = url;
  a.download = fn;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  console.log('[DS-Mini:UI] doc_generate:', fn);
}

// ============================================================
// DOM 提交
// ============================================================
async function domSubmitText(text: string) {
  await delay(400);
  const ta = document.querySelector('textarea');
  if (!ta) {
    console.warn('[DS-Mini:UI] domSubmit: no textarea');
    return;
  }

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(ta, text);
  else ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));

  await delay(200);

  // 找发送按钮：遍历可见非禁用的按钮，优先中尺寸（20-80px）
  const root = ta.closest('form, div, section') || document.body;
  const btns = root.querySelectorAll('button');
  let found = false;
  // 第一优先：中等尺寸按钮
  for (const btn of btns) {
    if (btn.disabled) continue;
    const r = btn.getBoundingClientRect();
    if (r.width >= 20 && r.width <= 80 && r.height >= 20 && r.height <= 80) {
      btn.click();
      found = true;
      break;
    }
  }
  // 第二优先：任意尺寸可见按钮
  if (!found) {
    for (const btn of btns) {
      if (btn.disabled) continue;
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btn.click();
        found = true;
        break;
      }
    }
  }
  if (!found) {
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
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
  w.innerHTML = `<div style="border:1px solid rgba(0,0,0,0.06);border-radius:8px;padding:12px 16px;margin:8px 0;background:rgba(0,0,0,0.02);font-size:14px"><div style="display:flex;align-items:center;gap:8px;color:#86909c"><span style="color:#86909c">---</span><span>正在执行 ${getLabel(call.name)}...</span></div></div>`;
  return w;
}

function createResultBlock(call: ToolCall, result: ToolResult): HTMLElement {
  const ok = result.success;
  const bc = ok ? 'rgba(0,0,0,0.06)' : 'rgba(245,63,63,0.2)';
  const bg = ok ? 'rgba(0,0,0,0.02)' : 'rgba(245,63,63,0.04)';
  const id = `ds-tool-${call.id.slice(0, 8)}`;
  const c = ok ? escapeHTML(result.result || '(空)') : `ERR: ${escapeHTML(result.error || '')}`;
  const w = document.createElement('div');
  w.className = 'ds-mini-tool-block';
  w.setAttribute('data-ds-tool-status', ok ? 'done' : 'error');
  w.innerHTML = `<div style="border:1px solid ${bc};border-radius:8px;margin:8px 0;background:${bg};font-size:14px;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;user-select:none;color:#1d2129;font-weight:500" onclick="var b=document.getElementById('${id}'),i=this.querySelector('.ds-toggle-icon');if(b)b.style.display=b.style.display==='none'?'block':'none';if(i)i.textContent=b.style.display==='none'?'[+]':'[-]'"><div style="display:flex;align-items:center;gap:8px"><span style="color:${ok ? '#86909c' : '#f53f3f'}">[${ok ? 'OK' : 'ERR'}]</span><span>${getLabel(call.name)} ${ok ? '已完成' : '失败'}</span><span style="color:#86909c;font-weight:400;font-size:12px">${result.duration.toFixed(0)}ms</span></div><span class="ds-toggle-icon" style="color:#86909c">[+]</span></div><div id="${id}" style="display:none;padding:0 16px 12px;border-top:1px solid ${bc};white-space:pre-wrap;word-break:break-word;color:#1d2129;line-height:1.6">${c}</div></div>`;
  return w;
}

function insertBlockIntoChat(block: HTMLElement, container: HTMLElement) {
  // 在最后一个助理消息之后插入（工具参数消息）
  const msgs = container.querySelectorAll('.ds-message');
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg) {
    // 直接在最后一个消息后面插入，不管后面有什么
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

// 多帧扫描隐藏 [工具执行结果] 消息（应对虚拟列表渲染副本）
function scanAndHideToolResults() {
  var frames = 0;
  var maxFrames = 30;
  // 识别消息级组件：hash class 格式如 _9663006, b13855df（7-8位字母数字）
  function isMsgComponent(el) {
    var cls = el.className;
    if (!cls || typeof cls !== 'string') return false;
    var parts = cls.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (/^[_a-zA-Z][a-zA-Z0-9]{5,9}$/.test(parts[i])) return true;
    }
    return false;
  }

  function scan() {
    frames++;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var textNode;
    var found = false;
    while ((textNode = walker.nextNode())) {
      if (textNode.textContent && textNode.textContent.indexOf('[工具执行结果]') === 0) {
        // 从文本节点向上找 hash class 消息容器（限步 8 层）
        var p = textNode.parentElement;
        var steps = 0;
        while (p && p !== document.body && p !== document.documentElement && steps < 8) {
          steps++;
          var pCls = String(p.className || '');
          // 跳过虚拟列表容器
          if (pCls.indexOf('virtual-list') !== -1) break;
          if (isMsgComponent(p) && !p.hasAttribute('data-ds-hidden')) {
            p.setAttribute('data-ds-hidden', '');
            found = true;
            break;
          }
          p = p.parentElement;
        }
      }
    }
    if (frames < maxFrames && (found || frames < 5)) {
      requestAnimationFrame(scan);
    } else {
      console.log('[DS-Mini:UI] Tool result scan done, frames=' + frames);
    }
  }
  requestAnimationFrame(scan);
}

function escapeHTML(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 重排序：把工具结果块移到最终答复前面
function reorderToolBlocks() {
  const container = findChatContainer();
  if (!container) return;
  const toolBlocks = container.querySelectorAll('.ds-mini-tool-block');
  const msgs = container.querySelectorAll('.ds-message');
  if (toolBlocks.length === 0 || msgs.length < 2) return;

  // 找到最后一个助理消息（最终答复）
  const lastMsg = msgs[msgs.length - 1];
  // 把所有工具结果块移到最终答复前面
  toolBlocks.forEach((block) => {
    if (block.parentNode === container && lastMsg.parentNode === container) {
      container.insertBefore(block, lastMsg);
    }
  });
}

// ============================================================
// DeepSeek PoW 求解 — 加载真实 WASM 模块 (sha3_wasm_bg.wasm)
// ============================================================

interface PowWasmExports {
  memory: WebAssembly.Memory;
  wasm_solve(
    retPtr: number,
    challengePtr: number,
    challengeLen: number,
    prefixPtr: number,
    prefixLen: number,
    difficulty: number,
  ): void;
  __wbindgen_add_to_stack_pointer(offset: number): number;
  __wbindgen_export_0(size: number, align: number): number;
}

let powWasmPromise: Promise<PowWasmExports> | null = null;
const textEncoder = new TextEncoder();

async function loadPowWasm(): Promise<PowWasmExports> {
  if (powWasmPromise) return powWasmPromise;
  powWasmPromise = (async () => {
    const resp = await fetch(wasmUrl);
    if (!resp.ok) throw new Error(`WASM fetch failed: ${resp.status}`);
    const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), {});
    return instance.exports as unknown as PowWasmExports;
  })();
  return powWasmPromise;
}

function writeWasmString(wasm: PowWasmExports, value: string): { ptr: number; len: number } {
  const bytes = textEncoder.encode(value);
  const ptr = wasm.__wbindgen_export_0(bytes.length, 1);
  new Uint8Array(wasm.memory.buffer).set(bytes, ptr);
  return { ptr, len: bytes.length };
}

async function computePowHeader(): Promise<string> {
  // 1. 从服务器获取 challenge（需认证 headers）
  let reqHeaders: Record<string, string> | null = savedReqHeaders;
  if (!reqHeaders) {
    try {
      const stored = localStorage.getItem('__ds_req_headers');
      if (stored) reqHeaders = JSON.parse(stored);
    } catch {}
  }
  const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (reqHeaders) {
    if (reqHeaders['authorization']) fetchHeaders['authorization'] = reqHeaders['authorization'];
    if (reqHeaders['Authorization']) fetchHeaders['Authorization'] = reqHeaders['Authorization'];
    if (reqHeaders['x-client-platform'])
      fetchHeaders['x-client-platform'] = reqHeaders['x-client-platform'];
    if (reqHeaders['x-client-version'])
      fetchHeaders['x-client-version'] = reqHeaders['x-client-version'];
    if (reqHeaders['x-client-locale'])
      fetchHeaders['x-client-locale'] = reqHeaders['x-client-locale'];
  }
  const resp = await fetch('/api/v0/chat/create_pow_challenge', {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify({ target_path: '/api/v0/chat/completion' }),
  });
  if (!resp.ok) throw new Error(`PoW challenge failed: ${resp.status}`);
  const data = await resp.json();
  const challenge =
    data.data?.biz_data?.challenge ||
    data.biz_data?.challenge ||
    data.data?.challenge ||
    data.challenge;
  if (!challenge || !challenge.algorithm) throw new Error('No challenge in PoW response');

  // 2. WASM 求解
  const prefix = `${challenge.salt}_${challenge.expire_at || challenge.expireAt}_`;
  const wasm = await loadPowWasm();
  const retPtr = wasm.__wbindgen_add_to_stack_pointer(-16);
  const challengeAlloc = writeWasmString(wasm, challenge.challenge.toLowerCase());
  const prefixAlloc = writeWasmString(wasm, prefix);

  console.log('[DS-Mini:UI] PoW wasm_solve: difficulty=' + challenge.difficulty);
  try {
    wasm.wasm_solve(
      retPtr,
      challengeAlloc.ptr,
      challengeAlloc.len,
      prefixAlloc.ptr,
      prefixAlloc.len,
      challenge.difficulty,
    );
    const view = new DataView(wasm.memory.buffer);
    const status = view.getInt32(retPtr, true);
    const answer = view.getFloat64(retPtr + 8, true);
    if (status !== 1 || !Number.isSafeInteger(answer) || answer < 0) {
      throw new Error(`PoW solve failed: status=${status}, answer=${answer}`);
    }
    console.log('[DS-Mini:UI] PoW solved: answer=' + answer);

    // 3. 打包
    const powResponse = {
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      salt: challenge.salt,
      answer: answer,
      signature: challenge.signature,
      target_path: '/api/v0/chat/completion',
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(powResponse))));
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}

// 重新启用静默模式
export function enableSilentMode() {
  silentModeEnabled = true;
}

// 遗留导出保持兼容（不被调用，保留以防 import 错误）
export async function onSSEToolCallDetected() {}
