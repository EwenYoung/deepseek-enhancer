// ============================================================
// deepseek-enhancer — 主世界 XHR 拦截
// ============================================================
// WARNING: 此脚本运行在 MAIN world，不能使用 chrome.* API 或 ES imports
// 只能使用原生浏览器 API 和 window.postMessage 通信
import { defineContentScript } from 'wxt/utils/define-content-script';
import mainXHRCode from '../core/main-xhr-inject?raw';
import { TOOL_DESCRIPTORS } from '../core/tool-descriptors';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildToolRegex(): string {
  const names = TOOL_DESCRIPTORS.map((t) => escapeRegExp(t.name)).join('|');
  return `/<(${names})>\\s*(\\{[\\s\\S]*?\\})\\s*(?:<\\/\\1>)?/g`;
}

export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  world: 'MAIN',

  main() {
    const code = mainXHRCode.replace('__DS_TOOL_NAMES_REGEX__', buildToolRegex());
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // 执行后移除
  },
});
