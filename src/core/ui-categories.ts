// ============================================================
// deepseek-enhancer — 分类面板 UI
// ============================================================
import {
  loadCategories,
  saveCategories,
  addCategory,
  renameCategory,
  deleteCategory,
  categorizeSession,
  uncategorizeSession,
  extractSessionId,
  getConversationTitle,
  toggleSortMode,
  getSortIcon,
  getSortLabel,
  reorderCategory,
  type CategoryState,
} from './conversation-store';

let catState: CategoryState = {
  categories: { order: [], items: {}, sessionCategory: {} },
  hiddenSessions: [],
  sessionTitles: {},
};
let panelInjected = false;
let panelEl: HTMLElement | null = null;
const PENDING_SESSIONS_KEY = 'ds_mini_pending_sessions';
let pendingNewSessions: { sessionId: string; catName: string }[] = [];
let pendingTitles: string[] = [];
let titlePollTimer: ReturnType<typeof setInterval> | null = null;
let sidebarObserver: MutationObserver | null = null;
let hiddenSessionsObserver: MutationObserver | null = null;
let batchModeActive = false;
let _updateDepth = 0;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _panelHovered = false;

function handleSidebarMutation() {
  if (_updateDepth > 0 || _debounceTimer) return;
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    _updateDepth++;
    try {
      if (!panelInjected || !document.body.contains(panelEl)) tryInjectPanel();
      if (!_panelHovered) refreshPanel();
    } finally {
      _updateDepth--;
    }
  }, 200);
}

function handleHiddenMutation() {
  if (_updateDepth > 0) return;
  _updateDepth++;
  try {
    applyHiddenSessions();
  } finally {
    _updateDepth--;
  }
}

const CAT_PANEL_CSS = `
  #ds-category-panel {
    margin: 8px 0 0;
    border-radius: 10px;
    background: var(--card-bg, rgba(255,255,255,0.5));
    backdrop-filter: var(--panel-blur, blur(20px));
    -webkit-backdrop-filter: var(--panel-blur, blur(20px));
    border: 1px solid var(--card-border, rgba(0,0,0,0.06));
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    color: var(--panel-text, #1f2937);
    user-select: none;
    flex-shrink: 0;
    overflow: hidden;
  }
  #ds-cat-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; cursor: pointer;
    font-size: 14px; font-weight: 500;
    transition: background 0.15s;
  }
  #ds-cat-header:hover { background: var(--card-border, rgba(0,0,0,0.04)); }
  #ds-cat-header .ds-cat-actions { display: flex; gap: 2px; align-items: center; }
  #ds-cat-header .ds-cat-actions button {
    background: none; border: none; cursor: pointer;
    width: 24px; height: 24px; border-radius: 5px;
    font-size: 14px; line-height: 1;
    color: var(--panel-text-secondary, #6b7280);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  #ds-cat-header .ds-cat-actions button:hover {
    background: var(--card-border, rgba(0,0,0,0.08));
    color: var(--accent, #007AFF);
  }
  #ds-cat-body { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; max-height: 0; transition: max-height 0.25s ease; }
  #ds-cat-body::-webkit-scrollbar { display: none; }
  #ds-cat-body.ds-cat-expanded { max-height: 35vh; }
  .ds-cat-item { border-top: 1px solid var(--card-border, rgba(0,0,0,0.04)); }
  .ds-cat-item-header {
    display: flex; align-items: center; gap: 4px;
    padding: 5px 12px; cursor: pointer;
    font-size: 14px; transition: background 0.15s;
  }
  .ds-cat-item-header:hover { background: var(--card-border, rgba(0,0,0,0.04)); }
  .ds-cat-item-header .ds-cat-toggle-icon {
    width: 14px; text-align: center; flex-shrink: 0;
    color: var(--panel-text-secondary);
    font-size: 10px;
  }
  .ds-cat-item-header .ds-cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ds-cat-item-header .ds-cat-count {
    font-size: 12px; color: var(--panel-text-secondary);
    background: var(--card-border); padding: 0 5px; border-radius: 8px;
    min-width: 16px; text-align: center; flex-shrink: 0;
  }
  .ds-cat-item-header .ds-cat-menu {
    background: none; border: none; cursor: pointer;
    width: 22px; height: 22px; border-radius: 4px;
    font-size: 14px; padding: 0;
    color: var(--panel-text-secondary);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s;
  }
  .ds-cat-item-header:hover .ds-cat-menu { opacity: 1; }
  .ds-cat-item-header .ds-cat-menu:hover { opacity: 1 !important; color: var(--accent, #007AFF); background: var(--card-border); }
  .ds-cat-item-header .ds-cat-add-session {
    background: none; border: none; cursor: pointer;
    width: 20px; height: 20px; border-radius: 4px;
    font-size: 13px; padding: 0;
    color: var(--panel-text-secondary);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s, color 0.15s;
  }
  .ds-cat-item-header:hover .ds-cat-add-session { opacity: 0.5; }
  .ds-cat-item-header .ds-cat-add-session:hover { opacity: 1 !important; color: var(--accent, #007AFF); background: var(--card-border); }
  .ds-cat-item-header .ds-cat-sort-btn {
    background: none; border: none; cursor: pointer;
    width: 20px; height: 20px; border-radius: 4px;
    font-size: 10px; padding: 0; font-weight: 600;
    color: var(--panel-text-secondary);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: opacity 0.15s, background 0.15s, color 0.15s;
    opacity: 0;
  }
  .ds-cat-item-header:hover .ds-cat-sort-btn { opacity: 0.6; }
  .ds-cat-item-header .ds-cat-sort-btn:hover { opacity: 1 !important; background: var(--card-border); color: var(--accent, #007AFF); }
  .ds-cat-item-sessions { display: none; }
  .ds-cat-item-sessions.open { display: block; }
  .ds-cat-session {
    display: flex; align-items: center; gap: 4px;
    padding: 3px 12px 3px 28px; cursor: pointer;
    font-size: 13px; color: var(--panel-text-secondary);
    transition: background 0.15s;
  }
  .ds-cat-session:hover { background: var(--card-border, rgba(0,0,0,0.04)); color: var(--panel-text); }
  .ds-cat-session .ds-cat-session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ds-cat-session .ds-cat-session-remove {
    background: none; border: none; cursor: pointer;
    padding: 0 3px; font-size: 11px;
    color: var(--panel-text-secondary); border-radius: 3px;
    opacity: 0; transition: opacity 0.15s;
  }
  .ds-cat-session:hover .ds-cat-session-remove { opacity: 1; }
  .ds-cat-session .ds-cat-session-remove:hover { color: var(--danger, #ff3b30); background: var(--card-border); }
  .ds-cat-item.ds-cat-dragging { opacity: 0.35; transform: scale(0.97); }
  .ds-cat-item.ds-cat-drag-over { background: var(--accent-bg, rgba(0,122,255,0.06)); border-radius: 10px; }
  .ds-cat-item.ds-cat-drag-over-before { box-shadow: inset 0 3px 0 0 var(--accent, #007AFF); }
  .ds-cat-item.ds-cat-drag-over-after { box-shadow: inset 0 -3px 0 0 var(--accent, #007AFF); }

  /* 三点菜单注入按钮 — 完全继承父级字体，不覆盖 */
  .ds-cat-menu-inject {
    display: flex !important; align-items: center; gap: 6px;
    width: 100% !important; cursor: pointer;
    padding: 8px 12px !important; box-sizing: border-box !important;
    font: inherit; color: inherit; border: none; background: none; outline: none;
    transition: background 0.1s;
  }
  .ds-cat-menu-inject:hover { background: var(--ds-dropdown-hover, rgba(0,0,0,0.05)) !important; }
  .ds-cat-menu-inject svg { flex-shrink: 0; }
  .ds-dropdown-menu > .ds-cat-menu-inject { flex-shrink: 0; }

  /* 分类弹出菜单 */
  .ds-cat-menu-popup {
    position: fixed; z-index: 99999;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 10px; padding: 4px; min-width: 130px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    backdrop-filter: var(--panel-blur, blur(20px));
    -webkit-backdrop-filter: var(--panel-blur, blur(20px));
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
  }
  .ds-cat-menu-popup button {
    display: block; width: 100%;
    background: none; border: none; cursor: pointer;
    padding: 7px 12px; text-align: left;
    border-radius: 6px; color: var(--panel-text);
    font-size: 13px;
  }
  .ds-cat-menu-popup button:hover { background: var(--card-border); }
  .ds-cat-menu-popup button.ds-cat-menu-danger { color: var(--danger, #ff3b30); }

  /* 批量操作栏 */
  #ds-batch-bar {
    display: none; align-items: center; justify-content: flex-end; gap: 6px;
    padding: 6px 8px; border-top: 1px solid var(--card-border);
    font-size: 12px;
  }
  #ds-batch-bar.ds-batch-active { display: flex; }
  #ds-batch-bar .ds-batch-count { font-weight: 600; flex: 1; }
  #ds-batch-bar .ds-batch-btn {
    padding: 5px 12px; border-radius: 6px; cursor: pointer;
    font-size: 12px; font-weight: 500; border: 1px solid;
    transition: all 0.15s; white-space: nowrap;
    background: var(--card-bg); color: var(--panel-text); border-color: var(--card-border);
  }
  #ds-batch-bar .ds-batch-btn:hover { filter: brightness(0.93); }
  /* 删除 — 用红色文字 + 弱红背景 */
  #ds-batch-bar .ds-batch-btn.ds-batch-danger,
  html:not(.ds-dark) #ds-batch-bar .ds-batch-btn.ds-batch-danger { color: #dc2626; border-color: transparent; background: #fef2f2; }
  /* 深色主题：亮色文字 + 半透明背景 */
  html.ds-dark #ds-batch-bar .ds-batch-btn.ds-batch-danger { color: #fca5a5; border-color: transparent; background: rgba(252,165,165,0.1); }
  html.ds-dark #ds-batch-bar .ds-batch-btn { color: #e0e0e0; background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.12); }

  /* 复选框 */
  .ds-session-checkbox { display: none !important; }
  .ds-batch-active-mode .ds-session-checkbox {
    display: block !important;
    width: 14px; height: 14px; cursor: pointer !important;
    position: absolute !important;
    left: 4px; top: 50%; transform: translateY(-50%);
    margin: 0; padding: 0; z-index: 10;
  }
  .ds-batch-active-mode a[href*="/chat/s/"] {
    padding-left: 22px !important;
    cursor: default !important;
    position: relative !important;
  }
  .ds-batch-active-mode a[href*="/chat/s/"] + button { display: none !important; }
`;

const CAT_KEY = 'ds_mini_categories_expanded';

// ============================================================
// 初始化
// ============================================================
export async function initCategories() {
  // 恢复页面刷新前未处理的待归类会话（同步，必须在 await 之前）
  try {
    const saved = localStorage.getItem(PENDING_SESSIONS_KEY);
    if (saved) pendingNewSessions = JSON.parse(saved);
  } catch (_e) {}
  // 提前注册监听，避免 await 期间丢失 MAIN world 消息
  setupNewSessionListener();

  catState = await loadCategories();
  injectPanelCSS();
  tryInjectPanel();
  captureThreeDotClicks();

  // 侧边栏原生点击监听：处理待归类会话 + 回收已分类会话
  document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest('a[href*="/chat/s/"]');
    if (link) {
      processPendingSessions();
      setTimeout(() => applyHiddenSessions(), 150);
    }
  });

  // 页面卸载时清理轮询定时器
  window.addEventListener('beforeunload', stopTitlePolling);

  // 面板重注入 observer
  if (!sidebarObserver) {
    const attach = () => {
      const sidebar = findSidebar();
      const target = sidebar?.firstElementChild;
      if (!target) {
        setTimeout(attach, 500);
        return;
      }
      sidebarObserver = new MutationObserver(handleSidebarMutation);
      sidebarObserver.observe(target, { childList: true, subtree: true });
    };
    attach();
  }

  // 隐藏会话 observer
  if (!hiddenSessionsObserver) {
    const attach = () => {
      const sb = findSidebar();
      const la = sb?.querySelector('[class*="ds-scroll-area"], [class*="ds-virtual-list"]');
      if (la) {
        hiddenSessionsObserver = new MutationObserver(handleHiddenMutation);
        hiddenSessionsObserver.observe(la, { childList: true, subtree: true });
      } else {
        setTimeout(attach, 1000);
      }
    };
    attach();
  }
}

// ============================================================
// 查找侧边栏
// ============================================================
function findSidebar(): HTMLElement | null {
  const tagged = document.querySelector('[data-ds-sidebar]');
  if (tagged) return tagged as HTMLElement;
  const root = document.getElementById('root');
  if (!root) return null;
  for (const div of root.querySelectorAll('div')) {
    const cs = getComputedStyle(div);
    if (cs.display !== 'flex' || cs.flexDirection !== 'row') continue;
    if (div.getBoundingClientRect().width < window.innerWidth * 0.8) continue;
    const children = Array.from(div.children).filter((c) => c.getBoundingClientRect().width > 0);
    const hasNarrow = children.some((c) => {
      const r = c.getBoundingClientRect();
      return r.width >= 180 && r.width <= 400 && r.height > 300;
    });
    const hasWide = children.some((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 500 && r.height > 300;
    });
    if (hasNarrow && hasWide) {
      for (const child of div.children) {
        const el = child as HTMLElement;
        const r = el.getBoundingClientRect();
        if (r.width >= 180 && r.width <= 400 && r.height > 300) return el;
      }
    }
  }
  return null;
}

function injectPanelCSS() {
  if (document.getElementById('ds-cat-panel-styles')) return;
  const s = document.createElement('style');
  s.id = 'ds-cat-panel-styles';
  s.textContent = CAT_PANEL_CSS;
  document.head.appendChild(s);
}

// ============================================================
// 三点菜单归类注入
// ============================================================
function injectIntoContextMenu(menu: HTMLElement, sessionId: string) {
  if (menu.querySelector('.ds-cat-menu-inject')) return;

  const innerMenu = (menu.querySelector('[class*="ds-dropdown-menu"]') as HTMLElement) || menu;
  const btn = document.createElement('div');
  btn.className = 'ds-cat-menu-inject';
  btn.setAttribute('tabindex', '-1');
  btn.setAttribute('role', 'menuitem');
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>归类到';
  btn.style.cssText =
    'display:flex;align-items:center;gap:6px;width:100%!important;cursor:pointer;padding:6px 12px;box-sizing:border-box;font:inherit;color:inherit;transition:background 0.1s;border:none;background:none;outline:none;';
  btn.addEventListener(
    'mouseenter',
    () => (btn.style.background = 'var(--ds-dropdown-hover,rgba(0,0,0,0.05))'),
  );
  btn.addEventListener('mouseleave', () => (btn.style.background = ''));
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBatchCategorizeDialog([sessionId]);
  });
  if (innerMenu.firstChild) {
    innerMenu.insertBefore(btn, innerMenu.firstChild);
  } else {
    innerMenu.appendChild(btn);
  }
}

function captureThreeDotClicks() {
  document.addEventListener(
    'click',
    (e) => {
      const sidebar = findSidebar();
      if (!sidebar) return;
      const sr = sidebar.getBoundingClientRect();
      const cx = (e as MouseEvent).clientX,
        cy = (e as MouseEvent).clientY;
      if (cx < sr.left - 10 || cx > sr.right + 10 || cy < sr.top - 20 || cy > sr.bottom + 20)
        return;
      const target = e.target as HTMLElement;
      if (target.closest('#ds-category-panel') || target.closest('.ds-cat-menu-popup')) return;

      let sessionId: string | null = null;
      const clickedLink = target.closest('a[href*="/chat/s/"]');
      if (clickedLink) {
        sessionId = extractSessionId(clickedLink as HTMLAnchorElement);
      }
      if (!sessionId) {
        const links = sidebar.querySelectorAll('a[href*="/chat/s/"]');
        let best = '',
          bestDist = 9999;
        for (const l of links) {
          const r = l.getBoundingClientRect();
          const d = Math.abs(r.top - cy) + Math.abs(r.left - cx);
          if (d < bestDist) {
            bestDist = d;
            const id = extractSessionId(l as HTMLAnchorElement);
            if (id) best = id;
          }
        }
        if (bestDist < 150) sessionId = best;
      }
      if (!sessionId) return;

      let injected = false;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      function tryInject() {
        if (injected) return;
        const menus = findMenuDeep();
        for (const menu of menus) {
          const wrapper = (menu.closest('[class*="ds-floating-position"]') || menu) as HTMLElement;
          const wrapperVisible = wrapper.style.display !== 'none' && wrapper.offsetHeight > 0;
          if (!wrapperVisible) {
            const old = wrapper.querySelector('.ds-cat-menu-inject');
            if (old) old.remove();
            continue;
          }
          const innerMenu =
            (menu.querySelector('[class*="ds-dropdown-menu"]') as HTMLElement) || menu;
          const existingBtn = innerMenu.querySelector('.ds-cat-menu-inject');
          if (existingBtn) {
            continue;
          }
          injectIntoContextMenu(menu, sessionId!);
          injected = true;
          ob?.disconnect();
          if (pollTimer) clearTimeout(pollTimer);
          return;
        }
      }

      const ob = new MutationObserver(tryInject);
      ob.observe(document.body, { childList: true });
      const rootEl = document.getElementById('root');
      if (rootEl) ob.observe(rootEl, { childList: true });

      let retries = 10;
      function poll() {
        pollTimer = setTimeout(() => {
          tryInject();
          if (!injected && --retries > 0) poll();
          else if (!injected) ob?.disconnect();
        }, 200);
      }
      poll();
    },
    true,
  );
}

function findMenuDeep(): HTMLElement[] {
  const results: HTMLElement[] = [];
  const sidebar = findSidebar();
  if (!sidebar) return results;
  const sr = sidebar.getBoundingClientRect();
  const seen = new Set<HTMLElement>();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
  while (walker.nextNode()) {
    const el = walker.currentNode as HTMLElement;
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.closest('#ds-category-panel') || el.closest('.ds-cat-menu-popup')) continue;
    if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
    const r = el.getBoundingClientRect();
    const sideDist = Math.abs(r.left - sr.right);
    if (sideDist > 200) continue;
    if (r.width < 60 || r.width > 450 || r.height < 30 || r.height > 500) continue;
    if (r.bottom < sr.top || r.top > sr.bottom) continue;
    const text = (el.textContent || '').trim();
    if (!text.match(/重命名|置顶|分享|删除|rename|pin|share|delete/i)) continue;
    if (el.querySelector('textarea, input, [contenteditable]')) continue;
    const isChild = results.some((parent) => parent.contains(el));
    if (isChild) continue;
    results.push(el);
  }
  return results;
}

// ============================================================
// 分类面板 DOM 注入
// ============================================================
function tryInjectPanel() {
  if (panelInjected && document.body.contains(panelEl)) return;
  const sidebar = findSidebar();
  if (!sidebar) return;
  const fc = sidebar.firstElementChild as HTMLElement | null;
  if (!fc) return;
  const children = Array.from(fc.children) as HTMLElement[];
  let ib: HTMLElement | null = null;
  for (let i = children.length - 1; i >= 0; i--) {
    if (
      children[i].querySelector(
        '[class*="ds-scroll-area"], [class*="ds-virtual-list"], a[href*="/chat/s/"]',
      )
    ) {
      ib = children[i];
      break;
    }
  }
  if (!ib) return;
  panelEl = document.createElement('div');
  panelEl.id = 'ds-category-panel';
  panelEl.innerHTML = buildCategoryHTML();
  panelEl.addEventListener('mouseenter', () => {
    _panelHovered = true;
  });
  panelEl.addEventListener('mouseleave', () => {
    _panelHovered = false;
  });
  fc.insertBefore(panelEl, ib);
  panelInjected = true;
  bindCategoryEvents();
  applyHiddenSessions();
}

// ============================================================
// SVG 图标
// ============================================================
function folderSVG() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
}
function plusSVG() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>';
}
function listSVG() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';
}
function moreSVG() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
}
function chevronDownSVG() {
  return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';
}
function chevronRightSVG() {
  return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>';
}

// ============================================================
// HTML 构建
// ============================================================
function buildCategoryHTML(): string {
  const ex = sessionStorage.getItem(CAT_KEY) !== 'false';
  return (
    '<div id="ds-cat-header"><span style="display:inline-flex;align-items:center;gap:4px;">' +
    folderSVG() +
    '分类</span><div class="ds-cat-actions"><button id="ds-cat-toggle-all" title="' +
    (ex ? '收起' : '展开') +
    '">' +
    (ex ? chevronDownSVG() : chevronRightSVG()) +
    '</button><button id="ds-cat-add" title="新建分类">' +
    plusSVG() +
    '</button><button id="ds-cat-batch" title="批量选择">' +
    listSVG() +
    '</button></div></div><div id="ds-cat-body" class="' +
    (ex ? 'ds-cat-expanded' : '') +
    '">' +
    buildCategoryListHTML() +
    '</div><div id="ds-batch-bar"><span>已选 <span id="ds-batch-count" class="ds-batch-count">0</span></span><button id="ds-batch-categorize" class="ds-batch-btn ds-batch-primary">归类到</button><button id="ds-batch-delete" class="ds-batch-btn ds-batch-danger">删除</button><button id="ds-batch-cancel" class="ds-batch-btn">取消</button></div>'
  );
}

function buildCategoryListHTML(): string {
  const cats = catState.categories;
  if (cats.order.length === 0)
    return '<div style="padding:8px 12px;font-size:12px;color:var(--panel-text-secondary);">暂无分类，点击 + 新建</div>';
  return cats.order
    .map((n) => {
      const item = cats.items[n];
      if (!item) return '';
      const open = sessionStorage.getItem('ds_cat_open_' + n) !== 'false';
      // 按排序模式渲染会话列表
      const sessionIds = [...item.sessions];
      if (item.sortBy === 'time-asc') sessionIds.reverse();
      return (
        '<div class="ds-cat-item" draggable="true" data-cat-name="' +
        escAttr(n) +
        '"><div class="ds-cat-item-header"><span class="ds-cat-toggle-icon">' +
        (open ? chevronDownSVG() : chevronRightSVG()) +
        '</span><span class="ds-cat-name">' +
        escHtml(n) +
        '</span><button class="ds-cat-sort-btn" title="' +
        getSortLabel(item.sortBy) +
        '">' +
        getSortIcon(item.sortBy) +
        '</button><button class="ds-cat-add-session" title="新建会话">' +
        plusSVG() +
        '</button><span class="ds-cat-count">' +
        item.sessions.length +
        '</span><button class="ds-cat-menu" title="操作">' +
        moreSVG() +
        '</button></div><div class="ds-cat-item-sessions ' +
        (open ? 'open' : '') +
        '">' +
        (sessionIds.length === 0
          ? '<div style="padding:2px 12px 2px 28px;font-size:11px;color:var(--panel-text-secondary);">空</div>'
          : sessionIds
              .map(
                (sid) =>
                  '<div class="ds-cat-session" data-session-id="' +
                  escAttr(sid) +
                  '"><span class="ds-cat-session-title">' +
                  escHtml(getSessionTitleFromDOM(sid)) +
                  '</span><button class="ds-cat-session-remove" title="移出分类">✕</button></div>',
              )
              .join('')) +
        '</div></div>'
      );
    })
    .join('');
}

function getSessionTitleFromDOM(sid: string): string {
  for (const link of document.querySelectorAll('a[href*="/chat/s/"]')) {
    if (extractSessionId(link as HTMLAnchorElement) === sid) {
      const title = getConversationTitle(link as HTMLAnchorElement);
      const trimmed = title.trim();
      if (!isPlaceholderTitle(trimmed)) {
        catState.sessionTitles[sid] = trimmed;
        return trimmed;
      }
      // sidebar 仍是占位标题，尝试 document.title
      const dt = document.title.replace(/[\s\-–—|]+(DeepSeek|Chat|deepseek).*$/i, '').trim();
      if (dt && dt !== '新对话' && dt !== 'New Chat') {
        catState.sessionTitles[sid] = dt;
        return dt;
      }
    }
  }
  // DOM 取不到（隐藏会话、未渲染等），回退缓存标题
  return catState.sessionTitles[sid] || sid;
}

// ============================================================
function bindCategoryEvents() {
  if (!panelEl) return;

  // 事件委托：只绑定一次到 panelEl 自身（React 重渲染不丢失）
  const elWithFlag = panelEl as HTMLElement & { _dsBound?: boolean };
  if (elWithFlag._dsBound) return;
  elWithFlag._dsBound = true;

  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // 面板折叠/展开
    if (
      target.closest('#ds-cat-header') &&
      !target.closest('.ds-cat-actions') &&
      !target.closest('button')
    ) {
      togglePanel();
      return;
    }
    // 展开/收缩按钮
    if (target.closest('#ds-cat-toggle-all')) {
      e.stopPropagation();
      togglePanel();
      return;
    }
    // 新建分类
    if (target.closest('#ds-cat-add')) {
      e.stopPropagation();
      showCategoryDialog('new');
      return;
    }
    // 分类内新建会话
    if (target.closest('.ds-cat-add-session')) {
      e.stopPropagation();
      const item = target.closest('.ds-cat-item') as HTMLElement;
      const catName = item?.dataset.catName || '';
      if (catName) createSessionInCategory(catName);
      return;
    }
    // 批量按钮
    if (target.closest('#ds-cat-batch')) {
      e.stopPropagation();
      toggleBatchMode();
      return;
    }
    // 分类项标题（展开/折叠）
    if (
      target.closest('.ds-cat-item-header') &&
      !target.closest('.ds-cat-menu') &&
      !target.closest('.ds-cat-sort-btn') &&
      !target.closest('.ds-cat-add-session')
    ) {
      const item = target.closest('.ds-cat-item') as HTMLElement;
      const name = item?.dataset.catName || '';
      const s = item?.querySelector('.ds-cat-item-sessions') as HTMLElement;
      const icon = item?.querySelector('.ds-cat-toggle-icon') as HTMLElement;
      if (s && icon) {
        const open = s.classList.toggle('open');
        icon.innerHTML = open ? chevronDownSVG() : chevronRightSVG();
        sessionStorage.setItem('ds_cat_open_' + name, String(open));
      }
      return;
    }
    // 分类菜单操作（重命名/删除）
    if (target.closest('.ds-cat-menu')) {
      e.stopPropagation();
      const item = target.closest('.ds-cat-item') as HTMLElement;
      showCategoryMenu(target as HTMLElement, item?.dataset.catName || '');
      return;
    }
    // 排序模式切换（↓ 最新优先 ↔ ↑ 最早优先）
    if (target.closest('.ds-cat-sort-btn')) {
      e.stopPropagation();
      const item = target.closest('.ds-cat-item') as HTMLElement;
      const catName = item?.dataset.catName || '';
      const catItem = catState.categories.items[catName];
      if (!catItem) return;
      toggleSortMode(catItem);
      saveCategories(catState).then(() => refreshPanel());
      return;
    }
    // 分类内会话点击
    if (target.closest('.ds-cat-session') && !target.closest('.ds-cat-session-remove')) {
      const sid = target.closest('.ds-cat-session')?.getAttribute('data-session-id');
      if (sid) navigateToSession(sid);
      return;
    }
    // 移出分类
    if (target.closest('.ds-cat-session-remove')) {
      e.stopPropagation();
      const sid = target.closest('.ds-cat-session')?.getAttribute('data-session-id');
      if (sid) handleUncategorize(sid);
      return;
    }
    // 批量操作按钮
    if (target.closest('#ds-batch-categorize')) {
      const s = getSelectedSessions();
      if (s.length) showBatchCategorizeDialog(s);
      return;
    }
    if (target.closest('#ds-batch-delete')) {
      const s = getSelectedSessions();
      if (s.length) showBatchDeleteDialog(s);
      return;
    }
    if (target.closest('#ds-batch-cancel')) {
      toggleBatchMode();
      return;
    }
  });

  // 分类拖拽排序
  let _dragCatIdx = -1;
  panelEl.addEventListener('dragstart', (e) => {
    if (!panelEl || !e.dataTransfer) return;
    const el = (e.target as HTMLElement).closest('.ds-cat-item') as HTMLElement | null;
    if (!el || el.closest('#ds-cat-header')) {
      e.preventDefault();
      return;
    }
    _dragCatIdx = Array.from(panelEl.querySelectorAll('.ds-cat-item')).indexOf(el);
    el.classList.add('ds-cat-dragging');
    panelEl.classList.add('ds-cat-dragging-active');
    e.dataTransfer?.setDragImage(document.createElement('div'), 0, 0);
    e.dataTransfer.effectAllowed = 'move';
  });
  panelEl.addEventListener('dragend', () => {
    if (!panelEl) return;
    _dragCatIdx = -1;
    panelEl.classList.remove('ds-cat-dragging-active');
    panelEl
      .querySelectorAll(
        '.ds-cat-dragging, .ds-cat-drag-over, .ds-cat-drag-over-before, .ds-cat-drag-over-after',
      )
      .forEach((el) =>
        el.classList.remove(
          'ds-cat-dragging',
          'ds-cat-drag-over',
          'ds-cat-drag-over-before',
          'ds-cat-drag-over-after',
        ),
      );
  });
  panelEl.addEventListener('dragover', (e) => {
    if (!panelEl) return;
    const el = (e.target as HTMLElement).closest('.ds-cat-item') as HTMLElement | null;
    if (!el || _dragCatIdx < 0) return;
    e.preventDefault();
    panelEl
      .querySelectorAll('.ds-cat-drag-over, .ds-cat-drag-over-before, .ds-cat-drag-over-after')
      .forEach((el) =>
        el.classList.remove(
          'ds-cat-drag-over',
          'ds-cat-drag-over-before',
          'ds-cat-drag-over-after',
        ),
      );
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isBefore = e.clientY < midY;
    el.classList.add(
      'ds-cat-drag-over',
      isBefore ? 'ds-cat-drag-over-before' : 'ds-cat-drag-over-after',
    );
  });
  panelEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!panelEl || _dragCatIdx < 0) return;
    const overEl = panelEl.querySelector(
      '.ds-cat-drag-over-before, .ds-cat-drag-over-after',
    ) as HTMLElement | null;
    if (!overEl) return;
    const items = Array.from(panelEl.querySelectorAll('.ds-cat-item'));
    const overIdx = items.indexOf(overEl);
    if (overIdx < 0) return;
    const targetIdx = overEl.classList.contains('ds-cat-drag-over-before') ? overIdx : overIdx + 1;
    if (targetIdx === _dragCatIdx) return;
    reorderCategory(catState, _dragCatIdx, targetIdx);
    saveCategories(catState).then(() => refreshPanel());
  });

  function togglePanel() {
    const b = panelEl?.querySelector('#ds-cat-body');
    const tb = panelEl?.querySelector('#ds-cat-toggle-all');
    if (!b || !tb) return;
    const ex = b.classList.toggle('ds-cat-expanded');
    tb.innerHTML = ex ? chevronDownSVG() : chevronRightSVG();
    (tb as HTMLElement).title = ex ? '收起' : '展开';
    sessionStorage.setItem(CAT_KEY, String(ex));
  }
}

// ============================================================
// 对话框
// ============================================================
function showCategoryDialog(mode: 'new' | 'rename', oldName?: string) {
  document.getElementById('ds-cat-dialog-overlay')?.remove();
  const isNew = mode === 'new';
  const overlay = document.createElement('div');
  overlay.id = 'ds-cat-dialog-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999997;background:var(--overlay-bg,rgba(0,0,0,0.3));display:flex;align-items:center;justify-content:center;';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  const d = document.createElement('div');
  d.style.cssText =
    "width:300px;padding:20px;background:var(--panel-bg);backdrop-filter:var(--panel-blur);-webkit-backdrop-filter:var(--panel-blur);border:1px solid var(--panel-border);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.15);color:var(--panel-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;";
  d.innerHTML =
    '<div style="font-weight:600;font-size:14px;margin-bottom:12px;">' +
    (isNew ? '新建分类' : '重命名分类') +
    '</div><input id="ds-cat-dialog-input" value="' +
    escAttr(oldName || '') +
    '" placeholder="输入分类名称" style="width:100%;padding:8px 10px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--panel-text);font-size:13px;box-sizing:border-box;margin-bottom:12px;"><div style="display:flex;gap:8px;justify-content:flex-end;"><button id="ds-cat-dialog-cancel" style="padding:7px 16px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:12px;">取消</button><button id="ds-cat-dialog-confirm" style="padding:7px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font-size:12px;font-weight:500;">' +
    (isNew ? '创建' : '保存') +
    '</button></div>';
  overlay.appendChild(d);
  document.body.appendChild(overlay);
  const input = d.querySelector('#ds-cat-dialog-input') as HTMLInputElement;
  input.focus();
  input.select();
  d.querySelector('#ds-cat-dialog-cancel')?.addEventListener('click', () => overlay.remove());
  const confirm = () => {
    const v = input.value.trim();
    if (!v) return;
    let ok = false;
    if (isNew) {
      ok = addCategory(catState, v);
      if (!ok) {
        alert('分类名已存在或无效');
        return;
      }
    } else if (oldName) {
      ok = renameCategory(catState, oldName, v);
      if (!ok) {
        alert('重命名失败');
        return;
      }
    }
    saveCategories(catState).then(() => {
      overlay.remove();
      refreshPanel();
    });
  };
  d.querySelector('#ds-cat-dialog-confirm')?.addEventListener('click', confirm);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') overlay.remove();
  });
}

function showCategoryMenu(anchor: HTMLElement, catName: string) {
  document.querySelector('.ds-cat-menu-popup')?.remove();
  const r = anchor.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'ds-cat-menu-popup';
  popup.innerHTML =
    '<button data-action="rename">重命名</button><button data-action="delete" class="ds-cat-menu-danger">删除</button>';
  popup.style.cssText +=
    'left:' + Math.min(r.left, window.innerWidth - 120) + 'px;top:' + (r.bottom + 2) + 'px;';
  document.body.appendChild(popup);
  popup.querySelector('[data-action="rename"]')?.addEventListener('click', () => {
    popup.remove();
    showCategoryDialog('rename', catName);
  });
  popup.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    popup.remove();
    if (confirm('确定删除分类"' + catName + '"？会话不会被删除。')) {
      deleteCategory(catState, catName);
      await saveCategories(catState);
      refreshPanel();
    }
  });
  const c = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      popup.remove();
      document.removeEventListener('mousedown', c);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', c), 10);
}

// ============================================================
// 导航 / 移出
// ============================================================
let _navigating = false;

function navigateToSession(sid: string) {
  if (_navigating) return;
  _navigating = true;
  for (const link of document.querySelectorAll('a[href*="/chat/s/"]')) {
    if (extractSessionId(link as HTMLAnchorElement) === sid) {
      const el = link as HTMLElement;
      el.style.display = '';
      el.click();
      // ponytail: el.click() 触发同步 React 重渲染，高亮已正确设置；
      // 延迟重新隐藏，避免 MutationObserver 未检测到 class-only 变化
      setTimeout(() => applyHiddenSessions(), 50);
      _navigating = false;
      return;
    }
  }
  _navigating = false;
}
async function handleUncategorize(sid: string) {
  uncategorizeSession(catState, sid);
  await saveCategories(catState);
  applyHiddenSessions();
  refreshPanel();
}

// ============================================================
// 分类内创建新会话
// ============================================================
/** 在指定分类中创建新会话 */
function createSessionInCategory(catName: string) {
  try {
    localStorage.setItem('ds_mini_pending_category', catName);
  } catch (_e) {}
  location.href = '/chat';
}

function setupNewSessionListener() {
  window.addEventListener('message', (event) => {
    if (event.data?.source === 'DS_MINI_MAIN' && event.data?.type === 'DS_MINI_NEW_SESSION') {
      const { sessionId, categoryName } = event.data;
      if (!sessionId || !categoryName) return;
      pendingNewSessions.push({ sessionId, catName: categoryName });
      try {
        localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify(pendingNewSessions));
      } catch (_e) {}
      processPendingSessions();
    }
  });
}

// ============================================================
// 处理待归类会话：先归类但不隐藏，等标题确定后再隐藏
// ============================================================
function isPlaceholderTitle(t: string): boolean {
  return !t || t === '新对话' || t === 'New Chat' || t === '新会话';
}

function stopTitlePolling() {
  if (titlePollTimer) {
    clearInterval(titlePollTimer);
    titlePollTimer = null;
  }
  pendingTitles = [];
}

function processPendingSessions() {
  if (pendingNewSessions.length === 0) return;
  for (const { sessionId, catName } of pendingNewSessions) {
    categorizeSession(catState, sessionId, catName);
    // 从当前可见的 sidebar link 尝试读标题
    for (const link of document.querySelectorAll('a[href*="/chat/s/"]')) {
      if (extractSessionId(link as HTMLAnchorElement) === sessionId) {
        const title = getConversationTitle(link as HTMLAnchorElement);
        if (!isPlaceholderTitle(title)) {
          catState.sessionTitles[sessionId] = title;
        } else {
          pendingTitles.push(sessionId);
        }
        break;
      }
    }
  }
  pendingNewSessions = [];
  try {
    localStorage.removeItem(PENDING_SESSIONS_KEY);
  } catch (_e) {}
  saveCategories(catState).then(() => refreshPanel());
  // 标题已确定的立即隐藏，未确定的保持可见等轮询
  applyHiddenSessions();

  if (pendingTitles.length > 0 && !titlePollTimer) {
    titlePollTimer = setInterval(() => {
      let updated = false;
      pendingTitles = pendingTitles.filter((sid) => {
        for (const link of document.querySelectorAll('a[href*="/chat/s/"]')) {
          if (extractSessionId(link as HTMLAnchorElement) === sid) {
            const title = getConversationTitle(link as HTMLAnchorElement);
            if (!isPlaceholderTitle(title)) {
              catState.sessionTitles[sid] = title;
              updated = true;
              return false;
            }
            break;
          }
        }
        return true;
      });
      if (updated) {
        saveCategories(catState);
        applyHiddenSessions();
        refreshPanel();
      }
      if (pendingTitles.length === 0) stopTitlePolling();
    }, 1000);
    setTimeout(() => stopTitlePolling(), 30000);
  }
}

// ============================================================
// 监听 MAIN world 发来的新会话通知
// ============================================================
// ============================================================
// 隐藏
// ============================================================
function getActiveSessionId(): string | null {
  const m = window.location.pathname.match(/\/chat\/s\/([a-f0-9-]+)/);
  return m ? m[1] : null;
}

function applyHiddenSessions() {
  try {
    const sidebar = findSidebar() || document;
    const hidden = new Set(catState.hiddenSessions);
    const activeSid = getActiveSessionId();
    let orphanCount = 0;
    for (const link of sidebar.querySelectorAll('a[href*="/chat/s/"]')) {
      const id = extractSessionId(link as HTMLAnchorElement);
      if (!id) continue;
      // 只隐藏属于某个分类的会话（归类后隐藏），不隐藏孤儿记录
      const belongsToCat = id && catState.categories.sessionCategory[id];
      if (id && hidden.has(id) && belongsToCat && id !== activeSid && !pendingTitles.includes(id)) {
        (link as HTMLElement).style.display = 'none';
      } else {
        (link as HTMLElement).style.display = '';
        // 清理孤儿隐藏记录（旧版本假删除遗留）
        if (id && hidden.has(id) && !belongsToCat) {
          orphanCount++;
          const idx = catState.hiddenSessions.indexOf(id);
          if (idx !== -1) catState.hiddenSessions.splice(idx, 1);
        }
      }
    }
    if (orphanCount > 0) saveCategories(catState);
  } catch (e) {
    console.error('[Categories] applyHidden:', e);
  }
}

// ============================================================
// 批量模式
// ============================================================
function toggleBatchMode() {
  batchModeActive = !batchModeActive;
  console.log('[Categories] toggleBatchMode →', batchModeActive);
  applyBatchMode();
}
function exitBatchMode() {
  if (!batchModeActive) return; // already exited
  batchModeActive = false;
  console.log('[Categories] exitBatchMode');
  applyBatchMode();
}
function applyBatchMode() {
  try {
    if (batchModeActive) {
      console.log('[Categories] applyBatchMode: enter');
      document.body.classList.add('ds-batch-active-mode');
      addCheckboxes();
      const bar = document.getElementById('ds-batch-bar');
      if (bar) {
        bar.classList.add('ds-batch-active');
        console.log('[Categories] batch bar shown');
      }
      const catBody = document.getElementById('ds-cat-body');
      const tgl = document.getElementById('ds-cat-toggle-all');
      if (catBody) catBody.classList.remove('ds-cat-expanded');
      if (tgl) {
        tgl.innerHTML = chevronRightSVG();
        tgl.title = '展开';
      }
    } else {
      console.log('[Categories] applyBatchMode: exit');
      document.body.classList.remove('ds-batch-active-mode');
      removeCheckboxes();
      const bar = document.getElementById('ds-batch-bar');
      if (bar) bar.classList.remove('ds-batch-active');
    }
  } catch (e) {
    console.error('[Categories] batchMode error:', e);
  }
}

function addCheckboxes() {
  try {
    removeCheckboxes();
    const sidebar = findSidebar() || document;
    const allLinks = sidebar.querySelectorAll('a[href*="/chat/s/"]');
    console.log('[Categories] addCheckboxes: found', allLinks.length, 'links');
    let added = 0;
    for (const link of allLinks) {
      if ((link as HTMLElement).style.display === 'none') continue;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ds-session-checkbox';
      cb.dataset.sessionId = extractSessionId(link as HTMLAnchorElement) || '';
      cb.addEventListener('mousedown', (e) => e.stopPropagation());
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      cb.addEventListener('change', updateBatchCount);
      link.insertBefore(cb, link.firstChild);
      added++;
    }
    console.log('[Categories] addCheckboxes: added', added, 'checkboxes');
  } catch (e) {
    console.error('[Categories] addCheckboxes error:', e);
  }
}

function updateBatchCount() {
  const count = document.querySelectorAll('.ds-session-checkbox:checked').length;
  const el = document.getElementById('ds-batch-count');
  if (el) el.textContent = String(count);
}
function removeCheckboxes() {
  document.querySelectorAll('.ds-session-checkbox').forEach((el) => el.remove());
  const e = document.getElementById('ds-batch-count');
  if (e) e.textContent = '0';
}
function getSelectedSessions(): string[] {
  const r: string[] = [];
  document.querySelectorAll('.ds-session-checkbox:checked').forEach((cb) => {
    const s = (cb as HTMLInputElement).dataset.sessionId;
    if (s) r.push(s);
  });
  return r;
}

// ============================================================
// 批量归类
// ============================================================
function showBatchCategorizeDialog(ids: string[]) {
  document.getElementById('ds-cat-dialog-overlay')?.remove();
  const cats = catState.categories;
  const overlay = document.createElement('div');
  overlay.id = 'ds-cat-dialog-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999997;background:var(--overlay-bg,rgba(0,0,0,0.3));display:flex;align-items:center;justify-content:center;';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  const has = cats.order.length > 0;
  const d = document.createElement('div');
  d.style.cssText =
    "width:320px;max-height:70vh;padding:20px;background:var(--panel-bg);backdrop-filter:var(--panel-blur);-webkit-backdrop-filter:var(--panel-blur);border:1px solid var(--panel-border);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.15);color:var(--panel-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;overflow-y:auto;";
  d.innerHTML =
    '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">归类 ' +
    ids.length +
    ' 条会话</div>' +
    (has
      ? '<div style="margin-bottom:12px;">' +
        cats.order
          .map(
            (n) =>
              '<label style="display:block;padding:6px 8px;cursor:pointer;border-radius:6px;font-size:13px;" onmouseover="this.style.background=\'var(--card-border)\'" onmouseout="this.style.background=\'transparent\'"><input type="radio" name="ds-batch-cat" value="' +
              escAttr(n) +
              '" style="margin-right:6px;vertical-align:middle;">' +
              escHtml(n) +
              ' (' +
              (cats.items[n]?.sessions.length || 0) +
              ')</label>',
          )
          .join('') +
        '</div>'
      : '<div style="color:var(--panel-text-secondary);font-size:12px;margin-bottom:12px;">暂无分类，请先创建分类</div>') +
    '<div style="margin-bottom:12px;"><input id="ds-batch-new-cat" placeholder="或新建分类..." style="width:100%;padding:7px 10px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--panel-text);font-size:12px;box-sizing:border-box;"></div><div style="display:flex;gap:8px;justify-content:flex-end;"><button id="ds-cat-dialog-cancel" style="padding:7px 16px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:12px;">取消</button><button id="ds-cat-dialog-confirm" style="padding:7px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font-size:12px;font-weight:500;" ' +
    (has ? '' : 'disabled') +
    '>归类</button></div>';
  overlay.appendChild(d);
  document.body.appendChild(overlay);
  d.querySelector('#ds-cat-dialog-cancel')?.addEventListener('click', () => overlay.remove());
  d.querySelector('#ds-cat-dialog-confirm')?.addEventListener('click', async () => {
    let t = '';
    const sel = d.querySelector('input[name="ds-batch-cat"]:checked') as HTMLInputElement;
    const nc = (d.querySelector('#ds-batch-new-cat') as HTMLInputElement).value.trim();
    if (nc) {
      t = nc;
      addCategory(catState, t);
    } else if (sel) {
      t = sel.value;
    } else return;
    for (const id of ids) categorizeSession(catState, id, t);
    await saveCategories(catState);
    overlay.remove();
    exitBatchMode();
    applyHiddenSessions();
    refreshPanel();
  });
}

// ============================================================
// 批量删除（真删除 + 清理本地状态）
// ============================================================
function showBatchDeleteDialog(ids: string[]) {
  document.getElementById('ds-cat-dialog-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'ds-cat-dialog-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999997;background:var(--overlay-bg,rgba(0,0,0,0.3));display:flex;align-items:center;justify-content:center;';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  const d = document.createElement('div');
  d.style.cssText =
    "width:360px;padding:20px;background:var(--panel-bg);backdrop-filter:var(--panel-blur);-webkit-backdrop-filter:var(--panel-blur);border:1px solid var(--panel-border);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.15);color:var(--panel-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;";
  d.innerHTML =
    '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">确认删除</div><div style="font-size:13px;color:var(--panel-text-secondary);margin-bottom:16px;">确认删除 <strong>' +
    ids.length +
    '</strong> 条会话？此操作不可撤销。</div><div style="font-size:11px;color:var(--danger,#ff3b30);margin-bottom:12px;display:none;" id="ds-del-progress"></div><div style="display:flex;gap:8px;justify-content:flex-end;"><button id="ds-del-cancel" style="padding:7px 16px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:12px;">取消</button><button id="ds-del-confirm" style="padding:7px 16px;border:none;border-radius:8px;background:var(--danger);color:#fff;cursor:pointer;font-size:12px;font-weight:500;">删除</button></div>';
  overlay.appendChild(d);
  document.body.appendChild(overlay);
  d.querySelector('#ds-del-cancel')?.addEventListener('click', () => overlay.remove());
  d.querySelector('#ds-del-confirm')?.addEventListener('click', async () => {
    const c = d.querySelector('#ds-del-confirm') as HTMLButtonElement,
      cancel = d.querySelector('#ds-del-cancel') as HTMLButtonElement,
      p = d.querySelector('#ds-del-progress') as HTMLElement;
    c.disabled = true;
    cancel.disabled = true;
    c.style.opacity = '0.5';
    p.style.display = 'block';
    let ok = 0,
      fail = 0;
    for (let i = 0; i < ids.length; i++) {
      p.textContent = '删除中... (' + (i + 1) + '/' + ids.length + ')';
      try {
        if (await callDeleteAPI(ids[i])) {
          ok++;
          const oldCat = catState.categories.sessionCategory[ids[i]];
          if (oldCat) {
            const item = catState.categories.items[oldCat];
            if (item) {
              const sidx = item.sessions.indexOf(ids[i]);
              if (sidx !== -1) item.sessions.splice(sidx, 1);
            }
            delete catState.categories.sessionCategory[ids[i]];
          }
          const hidx = catState.hiddenSessions.indexOf(ids[i]);
          if (hidx !== -1) catState.hiddenSessions.splice(hidx, 1);
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
      if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
    await saveCategories(catState);
    p.textContent = '删除完成：成功 ' + ok + ' 条，失败 ' + fail + ' 条';
    p.style.color = fail > 0 ? 'var(--danger)' : 'var(--accent)';
    c.textContent = '关闭';
    c.disabled = false;
    c.style.opacity = '1';
    // 2 秒后自动刷新页面（所有会话已从服务器删除）
    setTimeout(() => {
      overlay.remove();
      location.reload();
    }, 2000);
  });
}

async function callDeleteAPI(sid: string): Promise<boolean> {
  return new Promise((resolve) => {
    function handler(event: MessageEvent) {
      if (
        event.data?.source === 'DS_MINI_MAIN' &&
        event.data?.type === 'DS_MINI_DELETE_RESPONSE' &&
        event.data.sessionId === sid
      ) {
        window.removeEventListener('message', handler);
        console.log('[Categories] Delete result:', event.data.response);
        resolve(event.data.success === true);
      }
    }
    window.addEventListener('message', handler);
    window.postMessage(
      {
        source: 'DS_MINI_ISOLATED',
        type: 'DS_MINI_DELETE_SESSION',
        sessionId: sid,
      },
      '*',
    );
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(false);
    }, 2000);
  });
}

// ============================================================
// 刷新
// ============================================================
function refreshPanel() {
  try {
    if (!panelEl || !document.body.contains(panelEl)) {
      panelInjected = false;
      tryInjectPanel();
      return;
    }
    const b = panelEl.querySelector('#ds-cat-body') as HTMLElement;
    if (b) {
      b.innerHTML = buildCategoryListHTML();
      bindCategoryEvents();
    }
  } catch (e) {
    console.error('[Categories] refreshPanel:', e);
  }
}

/** 从 storage 重新加载分类数据并刷新面板（供备份恢复后调用） */
export async function refreshCategories() {
  catState = await loadCategories();
  await ensurePanelRendered();
}

/** 确保分类面板已渲染（带重试，应对侧边栏 DOM 被其他模块重建的情况） */
async function ensurePanelRendered() {
  for (let i = 0; i < 6; i++) {
    const el = panelEl as HTMLElement | null;
    if (panelInjected && el && document.body.contains(el)) {
      const b = el.querySelector('#ds-cat-body') as HTMLElement | null;
      if (b) {
        b.innerHTML = buildCategoryListHTML();
        bindCategoryEvents();
        return;
      }
    }
    // 面板不存在或已被移除，重置并重注入
    panelInjected = false;
    panelEl = null;
    tryInjectPanel();
    // 等待侧边栏就绪后重试
    await delay(400);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escAttr(s: string): string {
  return s
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
