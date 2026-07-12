// ============================================================
// deepseek-enhancer — Content Script 入口（Isolated World）
// ============================================================
import { defineContentScript } from 'wxt/utils/define-content-script';
import { initAutocomplete } from '../core/ui-autocomplete';
import { initPanel } from '../core/ui-panel';
import { initToolBlocks, handleMainWorldToolCalls, setSilentMode } from '../core/ui-tool-blocks';
import { initArtifacts } from '../core/artifact';
import { loadEnhancerFeatures, initThemeAutoSwitch } from '../core/enhancer-features';
import { setDisabledTools } from '../core/context-builder';
import { initCategories } from '../core/ui-categories';
import type { AppState } from '../core/types';

export const state: AppState = {
  activeSkill: null,
  skills: [],
};

// 全局保护锁
let initialized = false;

export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],

  main() {
    if (initialized) return;
    initialized = true;

    console.log('[DS-Mini:UI] Initializing...');

    // 尽早启动 storage 读取，避免 silentModeEnabled 竞态
    chrome.storage.local.get('ds_mini_agent_mode').then((r) => {
      if (r.ds_mini_agent_mode) setSilentMode(true);
    });
    chrome.storage.local.get('ds_mini_tools_state').then((r) => {
      if (r.ds_mini_tools_state) setDisabledTools(r.ds_mini_tools_state);
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!event.data) return;
      if (event.data.type === 'DS_MINI_TOOL_CALLS') {
        handleMainWorldToolCalls(event.data.toolCalls, event.data.silentDepth);
      }
      if (event.data.type === 'DS_MINI_TOKEN_SPEED') {
        updateTokenSpeed(event.data.tokPerSec, event.data.finished);
      }
      if (event.data.type === 'DS_MINI_FINAL_RESPONSE') {
        renderFinalResponse(event.data.text);
      }
      if (event.data.type === 'DS_MINI_DOM_FALLBACK') {
        domSubmitFallback(event.data.text);
      }
      if (event.data.source === 'DS_MINI_ISOLATED' && event.data.type === 'SET_AGENT_MODE') {
        setSilentMode(event.data.enabled);
      }
      if (event.data.source === 'DS_MINI_ISOLATED' && event.data.type === 'SET_TOOLS_STATE') {
        setDisabledTools(event.data.tools || {});
      }
      if (
        event.data.source === 'DS_MINI_ISOLATED' &&
        event.data.type === 'DS_MINI_TOKEN_SPEED_TOGGLE'
      ) {
        if (!event.data.enabled) {
          if (speedEl) {
            speedEl.remove();
            speedEl = null;
          }
        }
      }
    });

    initAutocomplete(state);
    initPanel(state);
    initToolBlocks(state);
    initArtifacts();
    initCategories();

    // 增强器功能
    loadEnhancerFeatures();
    initThemeAutoSwitch();

    // token 速度监听
    let textareaCheckTimer: ReturnType<typeof setTimeout> | null = null;
    const bodyObserver = new MutationObserver(() => {
      if (textareaCheckTimer) return;
      textareaCheckTimer = setTimeout(() => {
        textareaCheckTimer = null;
        initAutocomplete(state);
      }, 500);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // 注入防覆盖 CSS：用 !important 防止 React 重写
    const hideStyle = document.createElement('style');
    hideStyle.textContent =
      '[data-ds-hidden] { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; border: none !important; position: absolute !important; opacity: 0 !important; }';
    document.head.appendChild(hideStyle);

    // 隐藏 [工具执行结果] 中间消息 — 找含 hash class 的消息级容器
    function isMsgComponent(el) {
      var cls = el.className;
      if (!cls || typeof cls !== 'string') return false;
      var parts = cls.split(/\s+/);
      for (var i = 0; i < parts.length; i++) {
        if (/^[_a-zA-Z][a-zA-Z0-9]{5,9}$/.test(parts[i])) return true;
      }
      return false;
    }

    function hideToolResultMsg(el) {
      var node = el;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.nodeType === 1) {
          var cls = String(node.className || '');
          if (cls.indexOf('virtual-list') !== -1) break;
          if (
            isMsgComponent(node) &&
            node.textContent &&
            node.textContent.indexOf('[工具执行结果]') === 0
          ) {
            node.setAttribute('data-ds-hidden', '');
            console.log(
              '[DS-Mini:UI] Hidden message:',
              node.tagName + '.' + cls.split(/\s+/).slice(0, 2).join('.'),
            );
            return;
          }
        }
        node = node.parentElement;
      }
    }

    const resultHider = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        if (mut.type === 'characterData') {
          if (mut.target.textContent && mut.target.textContent.indexOf('[工具执行结果]') === 0) {
            hideToolResultMsg(mut.target);
          }
        }
        for (const node of mut.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.textContent && node.textContent.indexOf('[工具执行结果]') === 0) {
            hideToolResultMsg(node);
          } else if (node.textContent && node.textContent.indexOf('[工具执行结果]') !== -1) {
            // 文本可能在子元素中，延迟检查
            requestAnimationFrame(function () {
              if (node.textContent && node.textContent.indexOf('[工具执行结果]') === 0) {
                hideToolResultMsg(node);
              }
            });
          }
        }
      }
    });
    resultHider.observe(document.body, { childList: true, subtree: true, characterData: true });

    console.log('[DS-Mini:UI] Ready');
  },
});

// ============================================================
// Token 速度显示
// ============================================================
let speedEl: HTMLElement | null = null;
let speedTimer: ReturnType<typeof setTimeout> | null = null;

function updateTokenSpeed(tokPerSec: number, finished: boolean) {
  const ENHANCER_KEY = 'ds_mini_enhancer';
  chrome.storage.local.get(ENHANCER_KEY).then((r) => {
    const cfg = r[ENHANCER_KEY] || {};
    if (!cfg.tokenSpeed) {
      if (speedEl) {
        speedEl.remove();
        speedEl = null;
      }
      return;
    }
    if (!speedEl) {
      speedEl = document.createElement('div');
      speedEl.id = 'ds-mini-tok-speed';
      speedEl.style.cssText = `
        position: fixed; right: 16px; bottom: 120px; z-index: 99999;
        font-family: -apple-system, sans-serif; font-size: 11px;
        color: #9ca3af; pointer-events: none; user-select: none;
        opacity: 0; transition: opacity 0.3s;
        background: rgba(0,0,0,0.05); padding: 2px 8px;
        border-radius: 4px;
      `;
      document.body.appendChild(speedEl);
    }
    speedEl.textContent = `~${tokPerSec.toFixed(0)} tok/s`;
    speedEl.style.opacity = '1';
    if (finished) {
      if (speedTimer) clearTimeout(speedTimer);
      speedTimer = setTimeout(() => {
        speedEl!.style.opacity = '0';
      }, 2000);
    }
  });
}

// 注入语音脉冲 CSS
const voiceStyle = document.createElement('style');
voiceStyle.textContent = `
  @keyframes ds-voice-pulse {
    0% { box-shadow: 0 0 0 0 rgba(77, 107, 254, 0.4); }
    70% { box-shadow: 0 0 0 8px rgba(77, 107, 254, 0); }
    100% { box-shadow: 0 0 0 0 rgba(77, 107, 254, 0); }
  }
`;
document.head.appendChild(voiceStyle);

// ============================================================
// 通用 DOM 提交 — 填 textarea + 点发送按钮
// ============================================================
async function submitViaDOM(text: string) {
  await new Promise((r) => setTimeout(r, 300));
  const ta = document.querySelector('textarea');
  if (!ta) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(ta, text);
  else ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));

  await new Promise((r) => setTimeout(r, 200));

  // 找发送按钮：优先中尺寸（20-80px），fallback 任意可见按钮
  const root = ta.closest('form, div, section') || document.body;
  const btns = root.querySelectorAll('button');
  let found = false;
  for (const btn of btns) {
    if (btn.disabled) continue;
    const r = btn.getBoundingClientRect();
    if (r.width >= 20 && r.width <= 80 && r.height >= 20 && r.height <= 80) {
      btn.click();
      found = true;
      break;
    }
  }
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
  }
}

// ============================================================
// 静默循环最终渲染 — 把模型响应插入聊天区显示
// ============================================================
function renderFinalResponse(text: string) {
  if (!text.trim()) return;
  const container = document.getElementById('root') || document.body;
  // 插在最后一个 tool block 或最后一条消息之后
  const toolBlocks = container.querySelectorAll('.ds-mini-tool-block');
  const lastBlock = toolBlocks[toolBlocks.length - 1];
  const msg = document.createElement('div');
  msg.className = 'ds-message ds-mini-final-response';
  msg.dataset.dsToolProcessed = 'true';
  msg.style.cssText =
    'padding:12px 16px;margin:8px 0;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word';
  msg.textContent = text;
  if (lastBlock && lastBlock.parentNode === container) {
    lastBlock.after(msg);
  } else {
    const msgs = container.querySelectorAll('.ds-message');
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg) lastMsg.after(msg);
    else container.appendChild(msg);
  }
  console.log('[DS-Mini:UI] Final response rendered');
}

// ponytail: reuse submitViaDOM instead of duplicate Enter-only logic
async function domSubmitFallback(text: string) {
  await submitViaDOM(text);
  console.log('[DS-Mini:UI] DOM fallback used');
}
