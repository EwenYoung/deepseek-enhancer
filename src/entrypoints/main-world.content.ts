// ============================================================
// deepseek-enhancer — 主世界 XHR 拦截
// ============================================================
// WARNING: 此脚本运行在 MAIN world，不能使用 chrome.* API 或 ES imports
// 只能使用原生浏览器 API 和 window.postMessage 通信
import { defineContentScript } from 'wxt/utils/define-content-script';
import mainXHRCode from '../core/main-xhr-inject?raw';

export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  world: 'MAIN',

  main() {
    // 将 pre-bundled 的 XHR hook 代码作为 IIFE 注入到页面
    // ponytail: eval the raw code string so it runs in main world as an IIFE
    const script = document.createElement('script');
    script.textContent = mainXHRCode;
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // 执行后移除
  },
});
