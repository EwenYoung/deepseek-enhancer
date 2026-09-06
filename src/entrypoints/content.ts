// ============================================================
// deepseek-enhancer — Content Script 入口（Isolated World）
// ============================================================
import { defineContentScript } from 'wxt/utils/define-content-script';
import { initAutocomplete } from '../core/ui-autocomplete';
import { initPanel } from '../core/ui-panel';
import { initToolBlocks, handleMainWorldToolCalls } from '../core/ui-tool-blocks';
import { initArtifacts } from '../core/artifact';
import { initCollapse } from '../core/ui-collapse';
import {
  loadEnhancerFeatures,
  initThemeAutoSwitch,
  applyGuardedCSS,
  brandWithAlpha,
} from '../core/enhancer-features';
import { initCategories } from '../core/ui-categories';
import { isMainToIsolated } from '../core/protocol';
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

    // 扩展热刷新后，旧实例的 chrome.* 调用会 reject（Extension context invalidated）。
    // preventDefault 消费该 rejection，让旧实例静默失效、不污染控制台。
    // 注意：addEventListener 回调返回值被忽略，只有 DOM0 形式才靠 return true。
    window.addEventListener('unhandledrejection', (e) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      if (msg.includes('Extension context invalidated')) {
        e.preventDefault();
      }
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!isMainToIsolated(event.data)) return;
      if (event.data.type === 'DS_MINI_TOOL_CALLS') {
        // handleMainWorldToolCalls 内部有 try/finally 释放 toolExecutionInProgress；
        // 此处 catch 仅吞掉 DOM 操作异常，避免 unhandled rejection 污染 console
        handleMainWorldToolCalls(event.data.toolCalls, event.data.isNewUserFlow).catch((err) => {
          console.error('[DS-Mini:UI] handleMainWorldToolCalls failed:', err);
        });
      }
    });

    initAutocomplete(state);
    initPanel(state);
    initToolBlocks(state);
    initArtifacts();
    initCollapse();
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
    applyGuardedCSS(
      'hide',
      '[data-ds-hidden] { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; border: none !important; position: absolute !important; opacity: 0 !important; }',
    );

    // 注入语音脉冲 CSS（模块级不碰 DOM，统一在 main 内注册）
    // 颜色走主题品牌色变量 --ds-brand-rgb（applyTheme 注入）；默认主题无该变量时 fallback 官方蓝
    applyGuardedCSS(
      'voice-pulse',
      `
      @keyframes ds-voice-pulse {
        0% { box-shadow: 0 0 0 0 ${brandWithAlpha(0.4)}; }
        70% { box-shadow: 0 0 0 8px ${brandWithAlpha(0)}; }
        100% { box-shadow: 0 0 0 0 ${brandWithAlpha(0)}; }
      }
    `,
    );

    // 隐藏工具结果回注中间消息 — 找含 hash class 的消息级容器（前缀与 formatResults 输出对齐）
    function isMsgComponent(el: Element) {
      const cls = el.className;
      if (!cls || typeof cls !== 'string') return false;
      const parts = cls.split(/\s+/);
      for (let i = 0; i < parts.length; i++) {
        if (/^[_a-zA-Z][a-zA-Z0-9]{5,9}$/.test(parts[i])) return true;
      }
      return false;
    }

    function hideToolResultMsg(el: Element) {
      let node: Element | null = el;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.nodeType === 1) {
          const cls = String(node.className || '');
          if (cls.indexOf('virtual-list') !== -1) break;
          // 只允许隐藏气泡内组件：domSubmitText 填入续接文本时输入框容器/镜像
          // 节点也会命中前缀特征，误隐藏会把输入框压扁
          if (
            isMsgComponent(node) &&
            node.closest('.ds-message') &&
            node.textContent &&
            node.textContent.indexOf('以下是工具执行结果') === 0
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
          if (
            mut.target.textContent &&
            mut.target.textContent.indexOf('以下是工具执行结果') === 0
          ) {
            hideToolResultMsg(mut.target as Element);
          }
        }
        for (const node of mut.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.textContent && node.textContent.indexOf('以下是工具执行结果') === 0) {
            hideToolResultMsg(node);
          } else if (node.textContent && node.textContent.indexOf('以下是工具执行结果') !== -1) {
            // 文本可能在子元素中，延迟检查
            requestAnimationFrame(function () {
              if (node.textContent && node.textContent.indexOf('以下是工具执行结果') === 0) {
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
