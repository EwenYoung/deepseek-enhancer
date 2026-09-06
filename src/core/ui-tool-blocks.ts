// ============================================================
// deepseek-enhancer — 工具调用折叠块 UI
// ============================================================
import type { AppState, ToolCall, ToolResult } from './types';
import { getToolByName } from './tool-descriptors';
import { extractToolCalls } from './sse-parser';
import { executeToolCall } from './tool-executor';
import { createLoopState } from './loop-state';
import { postToMain } from './protocol';
import { applyGuardedCSS } from './enhancer-features';
import { esc, downloadBlob } from './ui-kit';
import { resolveDocPlan } from './doc-generate';
// ============================================================
// 状态
// ============================================================
let toolExecutionInProgress = false;
const loopState = createLoopState(); // Agent 循环状态（深度/停止标记/阶段）
let toolBlocksInited = false;
let agentPanel: AgentPanel | null = null; // Agent loop UI panel

// doc_generate 去重：SSE 主路径与 DOM 兜底路径在流式过程中会对同一调用各触发一次
// （raw 随流式截断而不同，不能拿 raw 当键），去重键由解析结果决定，见 doc-generate.ts。
// 只保留最近处理的键，避免无限增长
const processedDocKeys = new Set<string>();
const MAX_PROCESSED_DOC_KEYS = 50;

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

  // execution==='local' 的工具直接在 isolated world 中处理（不需要 background worker）
  const localCalls = toolCalls.filter((c) => getToolByName(c.name)?.execution === 'local');
  const otherCalls = toolCalls.filter((c) => getToolByName(c.name)?.execution !== 'local');

  for (const call of localCalls) {
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
          // 续接消息隐藏：在任何新增元素中检测（不限 .ds-message），
          // 但只允许气泡内节点——domSubmitText 填入续接文本时输入框容器/镜像
          // 节点也会命中文本特征，误隐藏会把输入框压扁
          if (isContinuationMessage(node.textContent || '') && node.closest('.ds-message')) {
            node.setAttribute('data-ds-continuation', 'true');
            node.style.display = 'none';
            console.log('[DS-Mini:UI] Continuation message hidden');
            continue; // 已隐藏，跳过后续处理
          }

          // 虚拟列表重渲染：恢复隐藏已标记的续接消息
          if (
            node.hasAttribute &&
            node.hasAttribute('data-ds-continuation') &&
            !node.querySelector('textarea')
          ) {
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
  // 检测续接 prompt：现行 XML 格式以 <tool_results> 开头（含 HTML 转义形态）。
  // 用开头匹配：用户/模型在正文中引用该标签词不应误伤整条气泡（漏判由
  // content.ts resultHider 与 scanAndHideToolResults 两条前缀路径兜底）；
  // 旧版中文前缀格式（历史会话）保留 original_task 判据
  const head = text.trimStart();
  return (
    head.indexOf('<tool_results>') === 0 ||
    head.indexOf('&lt;tool_results&gt;') === 0 ||
    (text.includes('以下是工具执行结果') && text.includes('original_task'))
  );
}

function processNewContent(node: HTMLElement) {
  if (toolExecutionInProgress) return;
  // 跳过续接消息（已被隐藏）
  if (node.hasAttribute && node.hasAttribute('data-ds-continuation')) return;
  if (node.closest && node.closest('[data-ds-tool-processed]')) return;
  // 扩展自渲染的 UI（工具块、折叠条）里含原始调用文本，扫到会把已执行的调用再执行一遍
  if (node.closest && (node.closest('.ds-mini-tool-block') || node.closest('[data-ds-collapse]')))
    return;
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
    return {
      tool: getLabel(r.toolName),
      ok: r.success,
      summary: r.summary || '',
      detail: clampText(r.detail || r.result || '', 4000),
      output: r.output ?? null,
      error: r.error || undefined,
      truncated: r.truncated || false,
    };
  });

  // <tool_results> 开头的续接 prompt：回注判定（main-xhr-inject / content.ts）
  // 按同前缀识别，导出侧提取正则 <tool_results>…</tool_results> 与此格式对齐
  return [
    '<tool_results>',
    JSON.stringify(structured, null, 2),
    '</tool_results>',
    '以上是工具执行结果。请基于原始任务继续推进；结果已足够时输出最终结论，只有确实需要更多信息时才继续调用工具。',
  ].join('\n');
}

function clampText(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen) + '...（已截断）';
}

function handleDocGenerate(call: import('./types').ToolCall) {
  const plan = resolveDocPlan(call.raw, call.payload);
  if (!plan) {
    console.warn(
      '[DS-Mini:UI] doc_generate: payload missing content, raw:',
      call.raw?.slice(0, 120),
    );
    return;
  }
  if (processedDocKeys.has(plan.key)) {
    console.log('[DS-Mini:UI] doc_generate: duplicate call skipped');
    return;
  }
  const blob = new Blob([plan.out], { type: `${plan.mime};charset=utf-8` });
  downloadBlob(blob, plan.filename);
  processedDocKeys.add(plan.key);
  if (processedDocKeys.size > MAX_PROCESSED_DOC_KEYS) {
    const oldest = processedDocKeys.values().next().value;
    if (oldest !== undefined) processedDocKeys.delete(oldest);
  }
  console.log('[DS-Mini:UI] doc_generate:', plan.filename);
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
  return getToolByName(name)?.label ?? name;
}

function findChatContainer(): HTMLElement | null {
  return document.getElementById('root') || document.body;
}

// 多帧扫描隐藏工具结果回注消息（应对虚拟列表渲染副本；前缀与 formatResults 输出
// 对齐：现行 <tool_results> 开头 + 旧版中文前缀，历史会话气泡仍为旧格式）
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
      if (
        textNode.textContent &&
        (textNode.textContent.indexOf('<tool_results>') === 0 ||
          textNode.textContent.indexOf('以下是工具执行结果') === 0)
      ) {
        // 从文本节点向上找 hash class 消息容器（限步 8 层）
        let p = textNode.parentElement;
        let steps = 0;
        while (p && p !== document.body && p !== document.documentElement && steps < 8) {
          steps++;
          const pCls = String(p.className || '');
          // 跳过虚拟列表容器
          if (pCls.indexOf('virtual-list') !== -1) break;
          // 只隐藏气泡内组件：domSubmitText 填入续接文本时输入框容器/镜像
          // 节点也会命中前缀特征，误隐藏会把输入框压扁（与 content.ts resultHider 对齐）
          if (isMsgComponent(p) && p.closest('.ds-message') && !p.hasAttribute('data-ds-hidden')) {
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
