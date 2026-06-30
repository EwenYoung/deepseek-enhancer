// ============================================================
// deepseek-enhancer — Content Script 入口（Isolated World）
// ============================================================
import { defineContentScript } from 'wxt/utils/define-content-script';
import { initAutocomplete } from '../core/ui-autocomplete';
import { initPanel } from '../core/ui-panel';
import { initToolBlocks, handleMainWorldToolCalls, setSilentMode } from '../core/ui-tool-blocks';
import { initArtifacts } from '../core/artifact';
import { loadEnhancerFeatures, initThemeAutoSwitch } from '../core/enhancer-features';
import { setDisabledTools } from '../core/inject-context';
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

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!event.data) return;
      if (event.data.type === 'DS_MINI_TOOL_CALLS') {
        handleMainWorldToolCalls(event.data.toolCalls);
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
      if (event.data.source === 'DS_MINI_ISOLATED' && event.data.type === 'DS_MINI_TOKEN_SPEED_TOGGLE') {
        if (!event.data.enabled) { if (speedEl) { speedEl.remove(); speedEl = null; } }
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

    // 同步静默循环标志 + 工具状态初始加载
    chrome.storage.local.get('ds_mini_agent_mode').then(r => {
      if (r.ds_mini_agent_mode) setSilentMode(true);
    });
    chrome.storage.local.get('ds_mini_tools_state').then(r => {
      if (r.ds_mini_tools_state) setDisabledTools(r.ds_mini_tools_state);
    });

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
  chrome.storage.local.get(ENHANCER_KEY).then(r => {
    const cfg = r[ENHANCER_KEY] || {};
    if (!cfg.tokenSpeed) {
      if (speedEl) { speedEl.remove(); speedEl = null; }
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
// 静默循环最终渲染
// ============================================================
async function renderFinalResponse(text: string) {
  if (!text.trim()) return;
  // 把最终响应填入输入框并发送（DOM 模式，但只发送一次）
  await new Promise(r => setTimeout(r, 300));
  const ta = document.querySelector('textarea');
  if (!ta) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(ta, text); else ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const btns = document.querySelectorAll('button');
  for (const btn of btns) {
    if (btn.disabled) continue;
    const r = btn.getBoundingClientRect();
    if (r.width > 0 && r.width < 45 && r.height > 0 && r.height < 45) {
      btn.click(); break;
    }
  }
  console.log('[DS-Mini:UI] Final response rendered');
}

async function domSubmitFallback(text: string) {
  // Silent loop XHR 失败时的 fallback
  await new Promise(r => setTimeout(r, 300));
  const ta = document.querySelector('textarea');
  if (!ta) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(ta, text); else ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  ta.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true,
  }));
  console.log('[DS-Mini:UI] DOM fallback used');
}
