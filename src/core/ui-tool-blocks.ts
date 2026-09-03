// ============================================================
// deepseek-enhancer — 工具调用折叠块 UI
// ============================================================
import type { AppState, ToolCall, ToolResult } from './types';
import { extractToolCalls, extractTaskComplete, stripTaskComplete } from './sse-parser';
import { executeToolCall } from './tool-executor';
import { createLoopState } from './loop-state';
import { postToMain } from './protocol';
import { applyGuardedCSS } from './enhancer-features';
import { esc, downloadBlob } from './ui-kit';
// ============================================================
// 状态
// ============================================================
let toolExecutionInProgress = false;
const loopState = createLoopState(); // Agent 循环状态（深度/停止标记/阶段）
let toolBlocksInited = false;
let agentPanel: AgentPanel | null = null; // Agent loop UI panel

// doc_generate 去重：同一 raw（MAIN 消息路径 + DOM 兜底路径会各触发一次）
// 只保留最近处理的 raw，避免无限增长
const processedDocRaws = new Set<string>();
const MAX_PROCESSED_DOC_RAWS = 50;

// ============================================================
// Agent Panel — 可视化 agent loop 步骤 (deepseek-pp style)
// ============================================================
class AgentPanel {
  container: HTMLElement;
  loopId: string;
  steps: Map<number, HTMLElement> = new Map();
  private _observer: MutationObserver | null = null;

  constructor(loopId: string) {
    this.loopId = loopId;
    this.container = document.createElement('div');
    this.container.className = 'ds-agent-container';
    this.container.style.cssText =
      'padding-left:16px;border-left:1px solid var(--ds-border);margin:8px 0;';
  }

  mount(atElement: Element) {
    atElement.after(this.container);
    // MutationObserver 防虚拟列表重渲染导致 detached
    this._observer = new MutationObserver(() => {
      if (!this.container.isConnected && this.container.parentElement === null) {
        const msgs = document.querySelectorAll('.ds-message');
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg) lastMsg.after(this.container);
      }
    });
    const root = document.getElementById('root');
    if (root) this._observer.observe(root, { childList: true, subtree: true });
  }

  unmount() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.steps.clear();
  }

  createStep(stepIndex: number, onStop?: () => void): HTMLElement {
    const step = document.createElement('div');
    step.className = 'ds-agent-step';
    step.setAttribute('data-step-index', String(stepIndex));
    step.setAttribute('data-status', 'streaming');
    step.style.cssText =
      'border-left:2px solid #4e6ef2;padding:8px 12px;margin:4px 0;font-size:14px;';

    // Header
    const header = document.createElement('div');
    header.className = 'ds-agent-step-header';
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;user-select:none;color:var(--ds-text);font-weight:500;';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:8px;';
    left.innerHTML = `<span>Step ${stepIndex}</span><span class="ds-agent-step-status" style="color:var(--ds-text-secondary);font-weight:400;font-size:12px;">streaming...</span>`;

    header.appendChild(left);

    if (onStop) {
      const stopBtn = document.createElement('button');
      stopBtn.textContent = 'Stop';
      stopBtn.style.cssText =
        'font-size:12px;padding:2px 8px;border:1px solid var(--ds-border);border-radius:4px;background:var(--ds-bg-subtle);color:#e74c3c;cursor:pointer;';
      stopBtn.onclick = (e) => {
        e.stopPropagation();
        onStop();
      };
      header.appendChild(stopBtn);
    }

    // Auto-collapse on header click
    header.onclick = () => {
      const collapsed = step.getAttribute('data-collapsed');
      if (collapsed === '') {
        step.removeAttribute('data-collapsed');
      } else {
        step.setAttribute('data-collapsed', '');
      }
      this.updateCollapsedState(step);
    };

    // Body
    const body = document.createElement('div');
    body.className = 'ds-agent-step-body';
    body.style.cssText =
      'padding:4px 0;white-space:pre-wrap;word-break:break-word;color:var(--ds-text);line-height:1.6;max-height:400px;overflow-y:auto;';

    // Tools
    const tools = document.createElement('div');
    tools.className = 'ds-agent-step-tools';

    step.appendChild(header);
    step.appendChild(body);
    step.appendChild(tools);
    this.container.appendChild(step);
    this.steps.set(stepIndex, step);
    return step;
  }

  updateStepStatus(step: HTMLElement, label: string, statusType: string) {
    const statusEl = step.querySelector('.ds-agent-step-status');
    if (statusEl) statusEl.textContent = label;
    step.setAttribute('data-status', statusType);
    const colors: Record<string, string> = {
      streaming: '#4e6ef2',
      'tool-executing': '#ff8800',
      complete: '#00b42a',
      error: '#f53f3f',
    };
    step.style.borderLeftColor = colors[statusType] || colors.streaming;
  }

  scrollStepBodyToBottom(step: HTMLElement) {
    const body = step.querySelector('.ds-agent-step-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  addToolResultToStep(step: HTMLElement, toolName: string, ok: boolean, summary: string) {
    const tools = step.querySelector<HTMLElement>('.ds-agent-step-tools');
    if (!tools) return;
    const item = document.createElement('div');
    item.className = 'ds-agent-step-tool-item ' + (ok ? 'ok' : 'err');
    const label = ok ? '[OK]' : '[ERR]';
    const color = ok ? '#00b42a' : '#f53f3f';
    const shortSummary = summary.length > 100 ? summary.slice(0, 100) + '...' : summary;
    item.style.cssText =
      'padding:2px 0;font-size:12px;color:' + color + ';display:flex;align-items:center;gap:4px;';
    item.innerHTML =
      '<span style="font-weight:600">' +
      label +
      '</span> ' +
      esc(toolName) +
      ' — ' +
      esc(shortSummary);
    tools.appendChild(item);
  }

  addFooter(totalSteps: number, totalTools: number, isError: boolean, errorMsg?: string) {
    const footer = document.createElement('div');
    footer.className = 'ds-agent-footer';
    footer.style.cssText =
      'margin-top:8px;padding:6px 0;border-top:1px solid var(--ds-border);font-size:12px;color:var(--ds-text-secondary);display:flex;align-items:center;gap:4px;';
    if (isError) {
      footer.innerHTML =
        '<span style="color:#f53f3f">[ERR]</span> Agent error: ' + esc(errorMsg || '');
    } else {
      footer.innerHTML =
        '<span style="color:#00b42a">[OK]</span> Agent complete (' +
        totalSteps +
        ' step' +
        (totalSteps > 1 ? 's' : '') +
        ', ' +
        totalTools +
        ' tool call' +
        (totalTools > 1 ? 's' : '') +
        ')';
    }
    this.container.appendChild(footer);
  }

  updateCollapsedState(step: HTMLElement) {
    const collapsed = step.getAttribute('data-collapsed') === '';
    const body = step.querySelector<HTMLElement>('.ds-agent-step-body');
    const tools = step.querySelector<HTMLElement>('.ds-agent-step-tools');
    if (body) body.style.display = collapsed ? 'none' : '';
    if (tools) tools.style.display = collapsed ? 'none' : '';
  }
}

// ============================================================
// 来自主世界（Main World）的工具调用入口
// ============================================================
export async function handleMainWorldToolCalls(toolCalls: ToolCall[], isNewUserFlow?: boolean) {
  if (!toolCalls || toolCalls.length === 0) return;

  // 新用户消息触发的首次工具调用 → 先重置 loop 状态 + cleanup agent panel
  // 注意：必须放在锁检查之前——否则上一轮循环残留的状态会永久卡死后续工具调用
  if (isNewUserFlow) {
    if (loopState.getState().depth > 0)
      console.log(
        '[DS-Mini:UI] New flow detected, reset loop state (was ' + loopState.getState().depth + ')',
      );
    loopState.onNewUserFlow();
    cleanupAgentPanel();
  }

  if (toolExecutionInProgress) {
    console.log('[DS-Mini:UI] Skipped — tool execution already in progress');
    return;
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

  if (!loopState.onToolCallsDetected(1)) {
    console.warn('[DS-Mini:UI] Loop limit');
    return;
  }

  toolExecutionInProgress = true;
  try {
    markLastAssistantProcessed(container);

    const currentDepth = loopState.getState().depth;
    console.log('[DS-Mini:UI] Loop #' + currentDepth + ' — ' + toolCalls.length + ' call(s)');

    // Agent Panel: 首次循环 → 创建容器 + 生成 loopId
    if (currentDepth === 1) {
      const loopId = crypto.randomUUID();
      agentPanel = new AgentPanel(loopId);
      const msgs = container.querySelectorAll('.ds-message');
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) agentPanel.mount(lastMsg);
      // loopId 存储在 agentPanel 实例中，通过 postMessage 传递给 MAIN world
      console.log('[DS-Mini:UI] Agent panel created, loopId=' + loopId);
    }

    // Agent Panel: 创建当前 step
    if (agentPanel) {
      agentPanel.createStep(currentDepth, () => {
        // Stop handler — 先标记本地停止状态，再通知 MAIN world 停止循环
        loopState.onStopRequested();
        postToMain({ type: 'DS_MINI_AGENT_STOP' });
      });
    }

    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      const block = createLoadingBlock(call, container);
      insertBlockIntoChat(block, container);
      const result = await executeToolCall(call);
      results.push(result);
      block.replaceWith(createResultBlock(call, result));
    }

    // Agent Panel: 添加工具结果到当前 step
    if (agentPanel) {
      const currentStep = agentPanel.steps.get(currentDepth);
      if (currentStep) {
        for (const r of results) {
          const toolLabel = getLabel(r.toolName);
          agentPanel.addToolResultToStep(
            currentStep,
            toolLabel,
            r.success,
            r.summary || r.result || '',
          );
        }
        agentPanel.updateStepStatus(
          currentStep,
          'Completed (' + results.length + ' tool' + (results.length > 1 ? 's' : '') + ')',
          'complete',
        );
      }
    }

    const ok = results.filter((r) => r.success);
    console.log('[DS-Mini:UI] Tool results:', results.length + ' total, ' + ok.length + ' OK');
    if (ok.length > 0) {
      // 续接 prompt 通过 DOM submit 发送 → 页面自然渲染 → 消息链完整可见
      await domSubmitText(formatResults(ok));
      scanAndHideToolResults();
    }
  } finally {
    // 无论成功或异常都必须释放锁，否则后续工具调用被永久跳过
    await delay(800);
    toolExecutionInProgress = false;
  }
}

function cleanupAgentPanel() {
  if (agentPanel) {
    agentPanel.unmount();
    agentPanel = null;
  }
  console.log('[DS-Mini:UI] Agent panel cleaned up');
}

// ============================================================
// 初始化 — 带保护锁
// ============================================================
export function initToolBlocks(_state: AppState) {
  if (toolBlocksInited) return;
  toolBlocksInited = true;

  // 注入 hover 样式 + CSS 变量（深色/浅色主题）；守卫注册表保证幂等
  applyGuardedCSS(
    'tool-blocks',
    `
    .ds-mini-tool-block > div:first-child > div[onclick]:hover { background: rgba(0,0,0,0.04); }
    :root {
      --ds-text: #1d2129;
      --ds-text-secondary: #86909c;
      --ds-bg-subtle: rgba(0,0,0,0.02);
      --ds-bg-error: rgba(245,63,63,0.04);
      --ds-border: rgba(0,0,0,0.06);
      --ds-border-error: rgba(245,63,63,0.2);
    }
    body.dark {
      --ds-text: #e8e8e8;
      --ds-text-secondary: #999;
      --ds-bg-subtle: rgba(255,255,255,0.06);
      --ds-bg-error: rgba(245,63,63,0.12);
      --ds-border: rgba(255,255,255,0.12);
      --ds-border-error: rgba(245,63,63,0.4);
    }
  `,
  );

  const container = findChatContainer();
  if (!container) return;

  new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) {
          // 续接消息隐藏：在任何新增元素中检测（不限 .ds-message）
          if (isContinuationMessage(node.textContent || '')) {
            node.setAttribute('data-ds-continuation', 'true');
            node.style.display = 'none';
            console.log('[DS-Mini:UI] Continuation message hidden');
            continue; // 已隐藏，跳过后续处理
          }

          // 虚拟列表重渲染：恢复隐藏已标记的续接消息
          if (node.hasAttribute && node.hasAttribute('data-ds-continuation')) {
            node.style.display = 'none';
            continue;
          }

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
function isContinuationMessage(text: string): boolean {
  if (!text) return false;
  // 检测续接 prompt 的两种形式：原始 XML 或被 HTML 转义
  return (
    (text.includes('<original_task>') && text.includes('<tool_results>')) ||
    (text.includes('&lt;original_task&gt;') && text.includes('&lt;tool_results&gt;')) ||
    (text.includes('以下是工具执行结果') && text.includes('original_task'))
  );
}

function processNewContent(node: HTMLElement) {
  if (toolExecutionInProgress) return;
  // 跳过续接消息（已被隐藏）
  if (node.hasAttribute && node.hasAttribute('data-ds-continuation')) return;
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

  // 直接执行工具调用
  // DOM 兜底一律视为工具回注（isNewUserFlow=false），不复位 loop 状态
  handleMainWorldToolCalls(calls, false);
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
function hideRawTaskComplete(
  container: HTMLElement,
  taskComplete: { found: boolean; summary: string },
) {
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

  return [
    '以下是工具执行结果。请基于原始任务和这些结果继续推进。',
    '如果结果已经足够，请输出最终结论；只有确实需要更多信息时才继续调用工具。',
    '',
    '<original_task>',
    '',
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
  // 去重：MAIN 消息路径与 DOM 兜底路径可能对同一工具调用各触发一次，
  // 同一 raw 只下载一次（浏览器会自动加 (1) 后缀产生重复文件）
  if (call.raw && processedDocRaws.has(call.raw)) {
    console.log('[DS-Mini:UI] doc_generate: duplicate raw skipped');
    return;
  }
  const title = String(call.payload.title || 'document');
  const format = String(call.payload.format || 'md').toLowerCase();
  let content = String(call.payload.content || '');
  if (!content) {
    // 兜底：从 raw 里尝试再提取一次（避免 payload 解析失败导致静默丢失）
    content = extractContentFromRaw(call.raw);
  }
  if (!content) {
    console.warn(
      '[DS-Mini:UI] doc_generate: payload missing content, raw:',
      call.raw?.slice(0, 120),
    );
    return;
  }
  const isHtml = format === 'html';
  const ext = isHtml ? '.html' : '.md';
  const mime = isHtml ? 'text/html' : 'text/markdown';
  const safeTitle = title.replace(/[^a-zA-Z0-9一-鿿\s_-]/g, '').trim();
  const fn = (safeTitle || 'document') + ext;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  downloadBlob(blob, fn);
  if (call.raw) {
    processedDocRaws.add(call.raw);
    if (processedDocRaws.size > MAX_PROCESSED_DOC_RAWS) {
      const oldest = processedDocRaws.values().next().value;
      if (oldest !== undefined) processedDocRaws.delete(oldest);
    }
  }
  console.log('[DS-Mini:UI] doc_generate:', fn);
}

/**
 * 兜底提取：从原始 XML 中找 "content" 字段（payload 解析失败时用）
 * 仅处理合法的 JSON 字符串值；找不到返回空串
 */
function extractContentFromRaw(raw: string | undefined): string {
  if (!raw) return '';
  // 宽松匹配 "content" 键后的 JSON 字符串值（含转义）
  const m = /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
  if (!m) return '';
  try {
    return JSON.parse('"' + m[1] + '"') as string;
  } catch {
    return '';
  }
}

// ============================================================
// DOM 提交
// ============================================================
async function domSubmitText(text: string) {
  await delay(400);
  const scope = document.getElementById('root') || document.body;
  const ta = scope.querySelector('textarea');
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
  w.innerHTML = `<div style="border:1px solid var(--ds-border);border-radius:8px;padding:12px 16px;margin:8px 0;background:var(--ds-bg-subtle);font-size:14px"><div style="display:flex;align-items:center;gap:8px;color:var(--ds-text-secondary)"><span style="color:var(--ds-text-secondary)">---</span><span>正在执行 ${getLabel(call.name)}...</span></div></div>`;
  return w;
}

function createResultBlock(call: ToolCall, result: ToolResult): HTMLElement {
  const ok = result.success;
  const bc = ok ? 'var(--ds-border)' : 'var(--ds-border-error)';
  const bg = ok ? 'var(--ds-bg-subtle)' : 'var(--ds-bg-error)';
  const id = `ds-tool-${call.id.slice(0, 8)}`;
  const c = ok ? esc(result.result || '(空)') : `ERR: ${esc(result.error || '')}`;
  const w = document.createElement('div');
  w.className = 'ds-mini-tool-block';
  w.setAttribute('data-ds-tool-status', ok ? 'done' : 'error');
  w.innerHTML = `<div style="border:1px solid ${bc};border-radius:8px;margin:8px 0;background:${bg};font-size:14px;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;user-select:none;color:var(--ds-text);font-weight:500" onclick="var b=document.getElementById('${id}'),i=this.querySelector('.ds-toggle-icon');if(b)b.style.display=b.style.display==='none'?'block':'none';if(i)i.textContent=b.style.display==='none'?'[+]':'[-]'"><div style="display:flex;align-items:center;gap:8px"><span style="color:${ok ? 'var(--ds-text-secondary)' : '#f53f3f'}">[${ok ? 'OK' : 'ERR'}]</span><span>${getLabel(call.name)} ${ok ? '已完成' : '失败'}</span><span style="color:var(--ds-text-secondary);font-weight:400;font-size:12px">${result.duration.toFixed(0)}ms</span></div><span class="ds-toggle-icon" style="color:var(--ds-text-secondary)">[+]</span></div><div id="${id}" style="display:none;padding:0 16px 12px;border-top:1px solid ${bc};white-space:pre-wrap;word-break:break-word;color:var(--ds-text);line-height:1.6">${c}</div></div>`;
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

// 多帧扫描隐藏工具结果回注消息（应对虚拟列表渲染副本；前缀与 formatResults 输出对齐）
function scanAndHideToolResults() {
  let frames = 0;
  const maxFrames = 30;
  // 识别消息级组件：hash class 格式如 _9663006, b13855df（7-8位字母数字）
  function isMsgComponent(el: Element) {
    const cls = el.className;
    if (!cls || typeof cls !== 'string') return false;
    const parts = cls.split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
      if (/^[_a-zA-Z][a-zA-Z0-9]{5,9}$/.test(parts[i])) return true;
    }
    return false;
  }

  function scan() {
    frames++;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode;
    let found = false;
    while ((textNode = walker.nextNode())) {
      if (textNode.textContent && textNode.textContent.indexOf('以下是工具执行结果') === 0) {
        // 从文本节点向上找 hash class 消息容器（限步 8 层）
        let p = textNode.parentElement;
        let steps = 0;
        while (p && p !== document.body && p !== document.documentElement && steps < 8) {
          steps++;
          const pCls = String(p.className || '');
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
