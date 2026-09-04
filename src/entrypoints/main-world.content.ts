// ============================================================
// deepseek-enhancer — 主世界 XHR 拦截
// ============================================================
// WARNING: 此脚本运行在 MAIN world，不能使用 chrome.* API 或 ES imports
// 只能使用原生浏览器 API 和 window.postMessage 通信
import { defineContentScript } from 'wxt/utils/define-content-script';
import mainXHRCode from '../core/main-xhr-inject?raw';
import { TOOL_DESCRIPTORS, buildToolDefsJson } from '../core/tool-descriptors';

function escapeRegExp(s: string): string {
  // `/` 也必须转义：工具名会拼进正则字面量 `/<(...)>/g`，裸 `/` 会提前终止字面量
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function buildToolRegex(): string {
  const names = TOOL_DESCRIPTORS.map((t) => escapeRegExp(t.name)).join('|');
  // 只匹配标签本身；JSON 主体含嵌套花括号（content 里的代码/公式），
  // 由 extractFromText 的平衡扫描提取，不能用非贪婪正则截取
  return `/<(${names})>/g`;
}

export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  world: 'MAIN',

  main() {
    // replaceAll 而非 replace：只要源文件任何位置（含注释）出现占位符字面量，
    // replace 只替换第一处就会放走真正的注入点 → 运行时 JSON.parse 抛错、IIFE 中断
    const code = mainXHRCode
      .replaceAll('__DS_TOOL_NAMES_REGEX__', () => buildToolRegex())
      .replaceAll('__DS_TOOL_DEFS__', () => buildToolDefsJson());
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // 执行后移除
  },
});
