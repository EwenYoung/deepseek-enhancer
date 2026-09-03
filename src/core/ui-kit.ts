// ============================================================
// deepseek-enhancer — UI 层共享助手
// ============================================================
// 收拢自 ui-panel / ui-autocomplete / ui-categories / ui-tool-blocks /
// markdown / chat-exporter / artifact / data-backup 的通用小工具。

/** HTML 转义（DOM 法）：文本写入 div.textContent 再从 innerHTML 读回，转义由浏览器完成 */
export function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** HTML 转义（字符串替换法）：& < > " ' 五项，属性与文本上下文均安全 */
export function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值转义：仅 " ' < >（不转义 &，避免破坏已有实体） */
export function escAttr(s: string): string {
  return s
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 底部居中轻提示：2000ms 淡出，2500ms 移除 */
export function showToast(msg: string) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    z-index:9999999;background:var(--panel-bg, #1f2937);color:var(--panel-text, #fff);border:1px solid var(--panel-border);
    padding:8px 20px;
    border-radius:8px;font-size:13px;font-family:'DM Sans',-apple-system,sans-serif;
    backdrop-filter:var(--panel-blur);
    -webkit-backdrop-filter:var(--panel-blur);
    box-shadow:0 4px 16px rgba(0,0,0,0.15);
    transition:opacity 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
  setTimeout(() => {
    toast.remove();
  }, 2500);
}

/** 触发浏览器下载：createObjectURL → a.click → 100ms 后清理 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/** 弹窗遮罩公共样式；差异属性（如 backdrop-filter）经 extra 追加 */
export function overlayStyle(extra?: string): string {
  return `position:fixed;inset:0;z-index:999997;background:var(--overlay-bg, rgba(0,0,0,0.3));${extra || ''}display:flex;align-items:center;justify-content:center;`;
}
