// ============================================================
// deepseek-enhancer — 增强器功能（宽屏/主题/滚动条/语音）
// ============================================================
// 从油猴脚本迁移的 UI 增强功能

const ENHANCER_KEY = 'ds_mini_enhancer';

export interface EnhancerConfig {
  wideScreen: boolean;
  themeIdx: number;       // 0=默认, 1-4 对应各主题
  hideScrollbar: boolean;
  autoHideInput: boolean;
  voiceInput: boolean;
  tokenSpeed: boolean;    // token 速度显示
  chatFont: string;       // '' = 默认, 字体 key
  chatMonoFont: string;   // '' = 默认, 字体 key
  chatFontSize: number;   // 0 = 默认, 10-24
}

// ============================================================
// 配置管理
// ============================================================
export async function getConfig(): Promise<EnhancerConfig> {
  try {
    const r = await chrome.storage.local.get(ENHANCER_KEY);
    return r[ENHANCER_KEY] || { wideScreen: false, themeIdx: 0, hideScrollbar: false, autoHideInput: false, voiceInput: false, tokenSpeed: false, chatFont: '', chatMonoFont: '', chatFontSize: 0 };
  } catch { return { wideScreen: false, themeIdx: 0, hideScrollbar: false, autoHideInput: false, voiceInput: false, tokenSpeed: false, chatFont: '', chatMonoFont: '', chatFontSize: 0 }; }
}

async function saveConfig(cfg: EnhancerConfig) {
  await chrome.storage.local.set({ [ENHANCER_KEY]: cfg });
}

// ============================================================
// 样式管理
// ============================================================
function applyCSS(id: string, css: string) {
  // 查找或创建 <style data-rule="id"> 标签（挂在 head 下）
  let rule = document.querySelector(`[data-rule="${id}"]`) as HTMLStyleElement | null;
  if (!rule) {
    rule = document.createElement('style');
    rule.setAttribute('data-rule', id);
    document.head.appendChild(rule);
  }
  rule.textContent = css;
}

function removeCSS(id: string) {
  const el = document.querySelector(`[data-rule="${id}"]`);
  if (el) el.remove();
}

// ============================================================
// 5.1 宽屏模式
// ============================================================
export async function toggleWideScreen(enabled: boolean) {
  const cfg = await getConfig();
  cfg.wideScreen = enabled;
  await saveConfig(cfg);

  if (enabled) {
    // 复用油猴脚本逻辑：先定位布局元素，然后放宽聊天面板约束
    const root = document.getElementById('root');
    if (root) {
      // 找到 flex row 和聊天面板
      const allDivs = root.querySelectorAll('div');
      let flexRow: HTMLElement | null = null;
      let chatPanel: HTMLElement | null = null;

      for (const div of allDivs) {
        const cs = getComputedStyle(div);
        if (cs.display !== 'flex' || cs.flexDirection !== 'row') continue;
        const r = div.getBoundingClientRect();
        if (r.width < window.innerWidth * 0.8) continue;

        const children = Array.from(div.children).filter((c: Element) => {
          const cr = c.getBoundingClientRect();
          return cr.width > 0 && cr.height > 0;
        });
        const hasNarrow = children.some((c: Element) => {
          const cr = c.getBoundingClientRect();
          return cr.width >= 180 && cr.width <= 400 && cr.height > 300;
        });
        const hasWide = children.some((c: Element) => {
          const cr = c.getBoundingClientRect();
          return cr.width > 500 && cr.height > 300;
        });
        if (hasNarrow && hasWide) {
          flexRow = div as HTMLElement;
          // 聊天面板：第二个宽子元素
          for (const child of flexRow.children) {
            const el = child as HTMLElement;
            const cr = el.getBoundingClientRect();
            if (cr.width > 500 && cr.height > 300 && cr.left > 150) {
              chatPanel = el;
              break;
            }
          }
          break;
        }
      }

      // 油猴脚本的操作：放宽聊天面板，让内容自动填充
      if (chatPanel) {
        chatPanel.style.setProperty('flex', '1 1 auto', 'important');
        chatPanel.style.removeProperty('max-width');
        chatPanel.style.removeProperty('min-width');
        chatPanel.style.removeProperty('width');
      }
      if (flexRow) {
        flexRow.style.removeProperty('width');
      }
    }

    // CSS 覆盖 — 只限制消息容器宽度适配剩余空间
    applyCSS('wide', `
      #root [class*="ds-virtual-list-items"] {
        padding-left: 24px !important;
        padding-right: 24px !important;
        box-sizing: border-box !important;
      }
      #root .ds-message {
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      #root .ds-assistant-message-main-content,
      #root .ds-markdown {
        padding: 0 !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        overflow-wrap: break-word !important;
      }
      /* 约束 scroll-area 到父级宽度（覆盖 CSS-in-JS 固定宽） */
      #root .ds-markdown .ds-scroll-area {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow-x: auto !important;
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
    `);
  } else {
    removeCSS('wide');
    // 恢复聊天面板原始样式
    document.querySelectorAll('[style*="flex: 1 1 auto"]').forEach(el => {
      (el as HTMLElement).style.removeProperty('flex');
      (el as HTMLElement).style.removeProperty('max-width');
      (el as HTMLElement).style.removeProperty('min-width');
      (el as HTMLElement).style.removeProperty('width');
    });
  }
}

// ============================================================
// 5.2 背景色主题
// ============================================================
const LIGHT_THEMES = [
  { name: '默认',  bg: '',        chatBg: '',        sidebarBg: '',        sidebarHighlight: '', brandColor: '' },
  { name: 'Claude浅', bg: '#f7f0e8', chatBg: '#fcf7f0',  sidebarBg: '#f2e8dc', sidebarHighlight: '#e6dccd', brandColor: '#D98A6A' },
  { name: 'Catppuccin浅',   bg: '#eef0f0',  chatBg: '#f5f7f6',  sidebarBg: '#e2e6e6', sidebarHighlight: '#d2d6d6', brandColor: '#179299' },
  { name: 'Dracula浅', bg: '#f5ecec', chatBg: '#fbf4f2',  sidebarBg: '#ebe0de', sidebarHighlight: '#ddd0ce', brandColor: '#bd93f9' },
  { name: 'OneHalf浅', bg: '#edf0e8', chatBg: '#f4f7f0',  sidebarBg: '#e0e5d8', sidebarHighlight: '#ced4c8', brandColor: '#61afef' },
];

const DARK_THEMES = [
  { name: '默认',    bg: '',        chatBg: '',        sidebarBg: '',        sidebarHighlight: '', brandColor: '' },
  { name: 'Claude深', bg: '#1c1a18', chatBg: '#201d1c',  sidebarBg: '#171513', sidebarHighlight: '#292421', brandColor: '#E07850' },
  { name: 'Catppuccin深',   bg: '#1e1e2e',  chatBg: '#181825',  sidebarBg: '#11111b', sidebarHighlight: '#20203a', brandColor: '#89b4fa' },
  { name: 'Dracula深', bg: '#282a36', chatBg: '#21222c',  sidebarBg: '#191a21', sidebarHighlight: '#2c2c3e', brandColor: '#bd93f9' },
  { name: 'OneHalf深', bg: '#282c34', chatBg: '#2c313a',  sidebarBg: '#21252b', sidebarHighlight: '#30353d', brandColor: '#61afef' },
];

function isDarkMode(): boolean {
  return document.body.classList.contains('dark');
}

function getTheme(idx: number, dark: boolean) {
  const list = dark ? DARK_THEMES : LIGHT_THEMES;
  return list[idx % list.length];
}

export function getThemeCount(): number {
  return isDarkMode() ? DARK_THEMES.length : LIGHT_THEMES.length;
}

export function getCurrentThemeName(): string {
  return getTheme(0, isDarkMode()).name;
}

export async function applyTheme(idx: number) {
  const cfg = await getConfig();
  cfg.themeIdx = idx;
  await saveConfig(cfg);

  const dark = isDarkMode();
  const theme = getTheme(idx, dark);
  currentBrandColor = theme.brandColor || '#4d6bfe';

  if (idx === 0 || !theme.bg) {
    removeCSS('theme');
    clearInlineBg();
    updateVoiceBtnColor();
    return;
  }

  clearInlineBg();

  // 定位侧边栏和聊天面板（油猴脚本的查找策略）
  const { sidebar, chatPanel } = findLayoutElements();
  if (sidebar) sidebar.setAttribute('data-ds-sidebar', '');
  if (chatPanel) chatPanel.setAttribute('data-ds-chatpanel', '');

  applyCSS('theme', `
    html, body, #root {
      background-color: ${theme.bg} !important;
    }
    ${theme.brandColor ? `
    body { --dsw-alias-brand-primary: ${theme.brandColor} !important; }
    /* 精确着色：仅对标记了蓝色的原生图标位置 */
    /* 1. Header 模式指示图标（快速模式/专家模式/识图模式）*/
    #root .the-header .ds-icon,
    /* 2. 已思考 brain icon */
    #root [style*="collapsible-area"] .ds-icon,
    /* 3. Toggle 按钮图标（仅开启状态） */
    #root .ds-toggle-button--selected .ds-toggle-button__icon,
    /* 4. 新对话页 whale icon */
    #root .cddfb2ed,
    /* 5. 活跃 mode tab（_31a22b0 是 DeepSeek 活跃模式标识类）*/
    #root ._31a22b0,
    #root ._31a22b0 svg {
      color: ${theme.brandColor} !important;
    }
    /* toggle 按钮：选中=品牌色，未选中=灰色 */
    #root .ds-toggle-button--selected {
      color: ${theme.brandColor} !important;
      border-color: ${theme.brandColor} !important;
    }
    #root .ds-toggle-button:not(.ds-toggle-button--selected) {
      color: ${dark ? 'rgb(160, 160, 170)' : 'rgb(130, 130, 140)'} !important;
      border-color: ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'} !important;
    }
    /* 输入框边框着色 + 移除原生阴影（新对话页 _9996a53 / 会话页 _3d616d3） */
    #root ._9996a53, #root ._3d616d3 {
      border-color: ${theme.brandColor}26 !important;
      box-shadow: none !important;
    }
    /* mode tab 选中态 oval box-shadow */
    #root .c15ec89f {
      box-shadow: inset 0 0 0 2px ${theme.brandColor}66 !important;
    }
    ` : ''}
    #root [data-ds-sidebar] {
      background-color: ${theme.sidebarBg} !important;
    }
    /* 侧边栏直接子容器染色（覆盖可能的 DeepSeek 白色背景） */
    #root [data-ds-sidebar] > * {
      background-color: ${theme.sidebarBg} !important;
    }
    #root [data-ds-chatpanel],
    #root [data-ds-chatpanel] *:not([class*="ds-button"]) {
      background: ${theme.chatBg} !important;
    }
    /* no-bg 区域：同特异性(0-1-3-0最高)后定义 → 透明 */
    #root [data-ds-chatpanel] [data-ds-no-bg],
    #root [data-ds-chatpanel] [data-ds-no-bg] *:not([class*="ds-button"]) {
      background: transparent !important;
    }
    /* 外部 no-bg 包裹器（右侧间隙）：同样排除按钮 */
    #root [data-ds-no-bg],
    #root [data-ds-no-bg] *:not([class*="ds-button"]) {
      background: transparent !important;
    }
    /* 放在最后：选中会话条目高亮 + 清除所有 Emotion 蓝色残留 */
    #root [data-ds-sidebar] a[data-ds-sidebar-selected],
    #root [data-ds-sidebar] a[data-ds-sidebar-selected] * {
      background-color: ${theme.sidebarHighlight} !important;
      background-image: none !important;
    }
    #root [data-ds-sidebar] a[data-ds-sidebar-selected] .c08e6e93 {
      color: ${dark ? 'rgb(249, 250, 251)' : 'rgb(15, 17, 21)'} !important;
    }
    #root [data-ds-sidebar] a[data-ds-sidebar-selected] .ds-focus-ring {
      outline: none !important;
      box-shadow: none !important;
    }
    /* 已思考折叠区域：融入主题色 */
    #root [data-ds-chatpanel] .ds-message:has(.ds-think-content) > :first-child {
      background-color: ${theme.chatBg} !important;
      border-radius: 6px !important;
      margin-bottom: 0 !important;
    }
    /* 思考内容子区域的背景也用主题色 - 同类优先级覆盖 no-bg 的透明化 */
    #root [data-ds-chatpanel] [data-ds-no-bg] .ds-think-content,
    #root [data-ds-chatpanel] .ds-think-content {
      background: ${theme.chatBg} !important;
    }
    /* 思考内容内的子元素同样适配主题 */
    #root [data-ds-chatpanel] [data-ds-no-bg] .ds-think-content .ds-markdown,
    #root [data-ds-chatpanel] [data-ds-no-bg] .ds-think-content .ds-markdown-paragraph,
    #root [data-ds-chatpanel] [data-ds-no-bg] .ds-think-content ._9ecc93a,
    #root [data-ds-chatpanel] [data-ds-no-bg] .ds-think-content .ddd26891,
    #root [data-ds-chatpanel] .ds-think-content .ds-markdown,
    #root [data-ds-chatpanel] .ds-think-content .ds-markdown-paragraph,
    #root [data-ds-chatpanel] .ds-think-content ._9ecc93a,
    #root [data-ds-chatpanel] .ds-think-content .ddd26891 {
      background: ${theme.chatBg} !important;
    }
    /* 折叠标题栏伪元素（::before/::after）融入主题色，覆盖 DeepSeek 默认白色 */
    #root [data-ds-chatpanel] [style*="collapsible-area"] ::before,
    #root [data-ds-chatpanel] [style*="collapsible-area"] ::after {
      background-color: ${theme.chatBg} !important;
      border-radius: 8px !important;
    }
  `);

  // 标记输入框区域不染色
  document.querySelectorAll('textarea').forEach(ta => {
    let el = ta.parentElement;
    for (let i = 0; i < 5 && el; i++) {
      el.setAttribute('data-ds-no-bg', '');
      el = el.parentElement;
    }
  });

  // 标记发送按钮区域不染色（按钮通常不在 textarea 父链上）
  const allBtns = document.querySelectorAll('button');
  const sendBtn = [...allBtns].find(b =>
    b.querySelector('svg') && (b.closest('[class*="input"]') || b.closest('[class*="composer"]') || b.closest('[class*="footer"]'))
  );
  if (sendBtn) {
    let el = sendBtn.parentElement;
    for (let i = 0; i < 5 && el; i++) {
      el.setAttribute('data-ds-no-bg', '');
      el = el.parentElement;
    }
  }

  // 标记右侧历史消息滚动条（ds-scroll-area）不染色，防止遮挡文字
  // 油猴脚本的处理方式：从 ds-scroll-area 往上走 10 层全部标记 no-bg
  const scrollAreas = document.querySelectorAll('[class*="ds-scroll-area"]');
  for (const area of scrollAreas) {
    let el = area as HTMLElement | null;
    for (let i = 0; i < 10 && el && el !== document.body; i++) {
      el.setAttribute('data-ds-no-bg', '');
      el = el.parentElement;
    }
  }

  // 标记侧边栏选中的会话条目（提取为函数，可在 React 切换后重新调用）
  function markSelectedSidebarItem() {
    const sbar = document.querySelector('[data-ds-sidebar]');
    if (!sbar || !theme.sidebarHighlight) return;
    // 清除旧的选中标记
    sbar.querySelectorAll('[data-ds-sidebar-selected]').forEach(el => el.removeAttribute('data-ds-sidebar-selected'));
    const links = sbar.querySelectorAll('a');
    let selected = null;
    for (const link of links) {
      const r = link.getBoundingClientRect();
      if (r.width < 100) continue;
      const c = getComputedStyle(link).color;
      if (c === 'rgb(57, 100, 254)' || c === 'rgb(255, 255, 255)') { selected = link; break; }
    }
    if (!selected) {
      let maxBrightness = 0;
      for (const link of links) {
        const r = link.getBoundingClientRect();
        if (r.width < 100) continue;
        const m = getComputedStyle(link).color.match(/\d+/g);
        if (m) {
          const brightness = Number(m[0]) + Number(m[1]) + Number(m[2]);
          if (brightness > maxBrightness) { maxBrightness = brightness; selected = link; }
        }
      }
    }
    if (selected) selected.setAttribute('data-ds-sidebar-selected', '');
  }
  markSelectedSidebarItem();

  // Emotion 可能在 React 重渲染后重新注入 <style> 标签
  // 延迟 500ms 重新创建 theme 样式标签 + 重新检测选中项
  if (theme.sidebarHighlight) {
    setTimeout(() => {
      const old = document.querySelector('[data-rule="theme"]');
      if (old) {
        const css = old.textContent || '';
        old.remove();
        const fresh = document.createElement('style');
        fresh.setAttribute('data-rule', 'theme');
        fresh.textContent = css;
        document.head.appendChild(fresh);
      }
      markSelectedSidebarItem();
    }, 500);
  }

  // 监听侧边栏 DOM 变化（React 切换会话后重新标记选中项）
  const sbar = document.querySelector('[data-ds-sidebar]');
  if (sbar && theme.sidebarHighlight) {
    // MutationObserver：拦截 React 重渲染
    const listContainer = sbar.querySelector('[class*="_77cdc67"]') || sbar;
    const observer = new MutationObserver(() => {
      markSelectedSidebarItem();
    });
    observer.observe(listContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    // 点击监听：用户点击侧边栏后延迟重标记（React 渲染完成后）
    sbar.addEventListener('click', () => {
      setTimeout(markSelectedSidebarItem, 100);
    }, true);
  }

  // 禁用磨砂玻璃效果：CSS 全局禁用 backdrop-filter（排除面板）
  applyCSS('frosted', `
    *:not(#ds-mini-panel):not(#ds-mini-panel *) {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  `);

  // JS 兜底：查找带 backdrop-filter 的元素，设为透明（排除面板）
  const allEls = document.querySelectorAll('*');
  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i] as HTMLElement;
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || (cs as CSSStyleDeclaration).webkitBackdropFilter || '';
    if (bf && bf !== 'none' && !el.closest('#ds-mini-panel')) {
      el.style.setProperty('opacity', '0', 'important');
      el.setAttribute('data-ds-no-bg', '');
    }
  }

  updateVoiceBtnColor();
}

function clearInlineBg() {
  document.querySelectorAll('[data-ds-sidebar], [data-ds-chatpanel], [data-ds-no-bg], [data-ds-sidebar-selected]').forEach(el => {
    el.removeAttribute('data-ds-sidebar');
    el.removeAttribute('data-ds-chatpanel');
    el.removeAttribute('data-ds-no-bg');
    el.removeAttribute('data-ds-sidebar-selected');
  });
  removeCSS('frosted');
}

function findLayoutElements(): { sidebar: HTMLElement | null; chatPanel: HTMLElement | null } {
  const root = document.getElementById('root');
  if (!root) return { sidebar: null, chatPanel: null };

  // 查找根 flex row 容器
  const allDivs = root.querySelectorAll('div');
  let flexRow: HTMLElement | null = null;

  for (const div of allDivs) {
    const cs = getComputedStyle(div);
    if (cs.display !== 'flex' || cs.flexDirection !== 'row') continue;
    const r = div.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.8) continue;

    const children = Array.from(div.children).filter(c => {
      const cr = c.getBoundingClientRect();
      return cr.width > 0 && cr.height > 0;
    });
    const hasNarrow = children.some(c => { const cr = c.getBoundingClientRect(); return cr.width >= 180 && cr.width <= 400 && cr.height > 300; });
    const hasWide = children.some(c => { const cr = c.getBoundingClientRect(); return cr.width > 500 && cr.height > 300; });
    if (hasNarrow && hasWide) { flexRow = div as HTMLElement; break; }
  }

  if (!flexRow) return { sidebar: null, chatPanel: null };

  let sidebar: HTMLElement | null = null;
  let chatPanel: HTMLElement | null = null;

  for (const child of flexRow.children) {
    const el = child as HTMLElement;
    const r = el.getBoundingClientRect();
    if (r.width >= 180 && r.width <= 400 && r.height > 300) sidebar = el;
    else if (r.width > 500 && r.height > 300 && r.left > 150) chatPanel = el;
  }

  return { sidebar, chatPanel };
}

// 自动跟随 DeepSeek 主题切换
export function initThemeAutoSwitch() {
  let lastDark = isDarkMode();
  new MutationObserver(async () => {
    const nowDark = isDarkMode();
    if (nowDark !== lastDark) {
      lastDark = nowDark;
      const cfg = await getConfig();
      if (cfg.themeIdx > 0) applyTheme(cfg.themeIdx);
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// ============================================================
// 5.3 滚动条隐藏
// ============================================================
export async function toggleScrollbar(hidden: boolean) {
  const cfg = await getConfig();
  cfg.hideScrollbar = hidden;
  await saveConfig(cfg);

  if (hidden) {
    applyCSS('scrollbar', `
      #root [class*="ds-virtual-list"]::-webkit-scrollbar,
      #root [class*="ds-scroll-area"]::-webkit-scrollbar {
        display: none !important;
      }
      #root [class*="ds-virtual-list"],
      #root [class*="ds-scroll-area"] {
        scrollbar-width: none !important;
      }
      /* DeepSeek 自定义滚动条 div 元素 */
      #root [class*="ds-scroll-area__vertical-bar"],
      #root [class*="ds-scroll-area__horizontal-bar"],
      #root [class*="ds-scroll-area__vertical-gutter"],
      #root [class*="ds-scroll-area__horizontal-gutter"] {
        display: none !important;
      }
    `);
  } else {
    removeCSS('scrollbar');
  }
}

// ============================================================
// 5.4 输入框自动隐藏
// ============================================================
let inputHideActive = false;
let inputHideEl: HTMLElement | null = null;  // 要平移的元素（_77cefa5）
let inputClipEl: HTMLElement | null = null;  // 裁剪溢出的元素（aaff8b8f）
let inputFocused = false;  // textarea 是否有焦点
let inputCurrentlyHidden = true;

function onMouseMove(e: MouseEvent) {
  if (!inputHideActive || !inputHideEl) return;
  if (!document.querySelector('[class*="ds-message"]')) return;
  // 输入框有文字时不下滑隐藏
  const ta = document.querySelector('textarea');
  if (ta && ta.value.trim().length > 0) {
    inputCurrentlyHidden = false;
    inputHideEl.style.transform = 'translateY(0)';
    return;
  }
  const dist = window.innerHeight - e.clientY;
  if (inputFocused) {
    inputCurrentlyHidden = false;
    inputHideEl.style.transform = 'translateY(0)';
  } else {
    // 迟滞：显示阈值 80px，隐藏阈值 150px
    if (inputCurrentlyHidden) {
      if (dist < 80) {
        inputCurrentlyHidden = false;
        inputHideEl.style.transform = 'translateY(0)';
      }
    } else {
      if (dist > 150) {
        inputCurrentlyHidden = true;
        inputHideEl.style.transform = 'translateY(120px)';
      }
    }
  }
}

function onTextareaFocus() {
  inputFocused = true;
  inputCurrentlyHidden = false;
  inputHideEl?.style.setProperty('transform', 'translateY(0)');
}

function onTextareaBlur() {
  inputFocused = false;
  // 输入框有文字时不下滑隐藏
  const ta = document.querySelector('textarea');
  if (ta && ta.value.trim().length > 0 && inputHideEl) {
    inputHideEl.style.transform = 'translateY(0)';
  }
}

let textareaObserver: MutationObserver | null = null;

function setupTextareaObserver() {
  textareaObserver?.disconnect();
  textareaObserver = new MutationObserver(() => {
    const ta = document.querySelector('textarea');
    if (ta && (!inputHideEl || !document.body.contains(inputHideEl))) {
      // textarea 被 React 重建了，重新初始化
      const tryInit = () => {
        inputHideEl = ta.parentElement?.parentElement?.parentElement as HTMLElement | null;
        inputClipEl = inputHideEl?.parentElement as HTMLElement | null;
        if (!inputHideEl || !inputClipEl || !document.body.contains(inputHideEl)) return false;
        inputClipEl.style.overflow = 'hidden';
        inputHideEl.style.transition = 'transform 0.35s ease';
        inputFocused = document.activeElement === ta;
        const hasMessages = !!document.querySelector('[class*="ds-message"]');
        inputCurrentlyHidden = !inputFocused && hasMessages && ta.value.trim().length === 0;
        inputHideEl.style.transform = inputCurrentlyHidden ? 'translateY(120px)' : 'translateY(0)';
        ta.addEventListener('focus', onTextareaFocus);
        ta.addEventListener('blur', onTextareaBlur);
        return true;
      };
      if (!tryInit()) {
        let retries = 4;
        const iv = setInterval(() => {
          if (tryInit() || --retries <= 0) clearInterval(iv);
        }, 500);
      }
    }
  });
  textareaObserver.observe(document.body, { childList: true, subtree: true });
}

export async function toggleAutoHideInput(enabled: boolean) {
  const cfg = await getConfig();
  cfg.autoHideInput = enabled;
  await saveConfig(cfg);
  inputHideActive = enabled;

  if (enabled) {
    // 提取初始化逻辑，支持重试（页面加载时 textarea 可能还没渲染）
    const tryInit = () => {
      const ta = document.querySelector('textarea');
      if (!ta) return false;
      inputHideEl = ta.parentElement?.parentElement?.parentElement as HTMLElement | null;
      inputClipEl = inputHideEl?.parentElement as HTMLElement | null;
      if (!inputHideEl || !inputClipEl) return false;
      inputClipEl.style.overflow = 'hidden';
      inputHideEl.style.transition = 'transform 0.35s ease';
      inputFocused = document.activeElement === ta;
      const hasMessages = !!document.querySelector('[class*="ds-message"]');
      inputCurrentlyHidden = !inputFocused && hasMessages && ta.value.trim().length === 0;
      inputHideEl.style.transform = inputCurrentlyHidden ? 'translateY(120px)' : 'translateY(0)';
      ta.addEventListener('focus', onTextareaFocus);
      ta.addEventListener('blur', onTextareaBlur);
      return true;
    };
    // 尝试重试（页面加载时 textarea 可能还没渲染）
    if (!tryInit()) {
      let retries = 6;
      const iv = setInterval(() => {
        if (tryInit() || --retries <= 0) clearInterval(iv);
      }, 500);
    }
    // 监听 textarea 替换（SPA 切换会话时 React 重建）
    setupTextareaObserver();
    document.addEventListener('mousemove', onMouseMove);
  } else {
    if (inputHideEl) {
      inputHideEl.style.transform = '';
      inputHideEl.style.transition = '';
    }
    if (inputClipEl) inputClipEl.style.overflow = '';
    // 清理事件
    const ta = document.querySelector('textarea');
    if (ta) {
      ta.removeEventListener('focus', onTextareaFocus);
      ta.removeEventListener('blur', onTextareaBlur);
    }
    inputHideEl = null;
    inputClipEl = null;
    inputFocused = false;
    inputCurrentlyHidden = true;
    textareaObserver?.disconnect();
    textareaObserver = null;
    document.removeEventListener('mousemove', onMouseMove);
  }
}

// ============================================================
// 5.5 语音输入
// ============================================================
let recognition: SpeechRecognition | null = null;
let isRecording = false;
let currentBrandColor = '#4d6bfe';

function onVoiceKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
    e.preventDefault();
    // 先确保输入框显示
    if (inputHideActive && inputHideEl && inputCurrentlyHidden) {
      inputCurrentlyHidden = false;
      inputHideEl.style.transform = 'translateY(0)';
    }
    // 再切换录音
    const btn = document.getElementById('ds-voice-btn') as HTMLElement | null;
    if (btn) toggleRecording(btn);
  }
}

export async function toggleVoiceInput(enabled: boolean) {
  const cfg = await getConfig();
  cfg.voiceInput = enabled;
  await saveConfig(cfg);

  if (enabled) {
    createVoiceButton();
    setupVoiceObserver();
    document.addEventListener('keydown', onVoiceKeydown);
  } else {
    document.getElementById('ds-voice-btn')?.remove();
    document.removeEventListener('keydown', onVoiceKeydown);
    voiceObserver?.disconnect();
    voiceObserver = null;
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    isRecording = false;
  }
}

function createVoiceButton() {
  if (document.getElementById('ds-voice-btn')) return;

  // 找到底部工具栏：从 toggle 按钮定位到 toolbar row 的右组
  const toggleBtn = document.querySelector('.ds-toggle-button');
  if (!toggleBtn) return;

  const leftGroup = toggleBtn.parentElement;
  const toolbarRow = leftGroup?.parentElement;
  if (!toolbarRow) return;

  // 右组 = toolbar row 中不是左组的那个孩子
  let rightGroup: Element | null = null;
  for (const child of toolbarRow.children) {
    if (child !== leftGroup) { rightGroup = child; break; }
  }
  if (!rightGroup) return;

  const btn = document.createElement('button');
  btn.id = 'ds-voice-btn';
  btn.type = 'button';
  btn.title = '语音输入';
  const c = currentBrandColor;
  btn.style.cssText = `
    width: 38px; height: 38px; border-radius: 50%;
    border: none;
    background: ${c}1A;
    color: ${c}; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; margin-right: 8px;
  `;
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M12 16v3"/><path d="M8 21h8"/><path d="M5 11a7 7 0 0 0 14 0"/></svg>`;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleRecording(btn);
  });

  rightGroup.insertBefore(btn, rightGroup.firstChild);
}

function updateVoiceBtnColor() {
  const btn = document.getElementById('ds-voice-btn');
  if (!btn) return;
  const c = currentBrandColor;
  btn.style.background = c + '1A';
  btn.style.color = c;
}

// 语音按钮的 textarea 重建监听
let voiceObserver: MutationObserver | null = null;

function setupVoiceObserver() {
  voiceObserver?.disconnect();
  voiceObserver = new MutationObserver(() => {
    const existing = document.getElementById('ds-voice-btn');
    const ta = document.querySelector('textarea');
    if (ta && !existing) {
      // textarea 被重建了，重新创建语音按钮
      let retries = 4;
      const tryCreate = () => {
        if (document.getElementById('ds-voice-btn')) return true;
        createVoiceButton();
        return !!document.getElementById('ds-voice-btn');
      };
      if (!tryCreate()) {
        const iv = setInterval(() => {
          if (tryCreate() || --retries <= 0) clearInterval(iv);
        }, 500);
      }
    }
  });
  voiceObserver.observe(document.body, { childList: true, subtree: true });
}

function toggleRecording(btn: HTMLElement) {
  if (isRecording) {
    stopRecording(btn);
  } else {
    startRecording(btn);
  }
}

function startRecording(btn: HTMLElement) {
  const SpeechRecognition = window.SpeechRecognition || (window as Record<string, unknown>).webkitSpeechRecognition;
  if (!SpeechRecognition) { alert('浏览器不支持语音识别'); return; }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
  }

  const ta = document.querySelector('textarea');
  if (!ta) return;

  isRecording = true;
  btn.style.background = 'rgba(77,107,254,0.3)';
  btn.style.animation = 'ds-voice-pulse 1.5s infinite';

  const startLen = ta.value.length;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t;
    }
    if (finalText) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, ta.value.substring(0, startLen) + finalText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  recognition.onerror = () => stopRecording(btn);
  recognition.onend = () => stopRecording(btn);
  try { recognition.start(); } catch { stopRecording(btn); }
}

function stopRecording(btn: HTMLElement) {
  if (recognition) { try { recognition.stop(); } catch {} }
  btn.style.background = 'rgba(77,107,254,0.1)';
  btn.style.animation = '';
  isRecording = false;
}

// ============================================================
// 5.6 聊天字体
// ============================================================
interface FontDef {
  label: string;
  family: string;
  urls: string[] | null;  // null = system font, no CDN needed
}

const FONT_PRESETS: Record<string, Record<string, FontDef>> = {
  chat: {
    'wenkai':    { label: '霞鹜文楷',   family: "'LXGW WenKai', '霞鹜文楷', serif",         urls: 'https://fontsapi.zeoseven.com/292/main/result.css' },
    'noto-serif':{ label: '思源宋体',   family: "'Noto Serif CJK', '思源宋体', serif",         urls: 'https://fontsapi.zeoseven.com/285/main/result.css' },
    'noto-sans': { label: '思源黑体',   family: "'Noto Sans CJK', '思源黑体', sans-serif",     urls: 'https://fontsapi.zeoseven.com/69/main/result.css' },
    'zhuque':    { label: '朱雀仿宋',   family: "'Zhuque Fangsong', '朱雀仿宋', serif",      urls: 'https://fontsapi.zeoseven.com/7/main/result.css' },
    'hanchan':   { label: '寒蝉活宋体', family: "'ChillHuoSong_F', '寒蝉活宋体', serif",    urls: 'https://fontsapi.zeoseven.com/875/main/result.css' },
    'chill':     { label: '寒蝉全圆体', family: "'ChillRoundF', '寒蝉全圆体', sans-serif",    urls: 'https://fontsapi.zeoseven.com/3/main/result.css' },
  },
  mono: {
    'jetbrains':  { label: 'JetBrains Mono',  family: "'JetBrains Mono', monospace",   urls: ['https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.1.0/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.1.0/700.css'] },
    'fira':       { label: 'Fira Code',       family: "'Fira Code', monospace",        urls: ['https://cdn.jsdelivr.net/npm/@fontsource/fira-code@5.1.0/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/fira-code@5.1.0/700.css'] },
    'cascadia':   { label: 'Cascadia Code',   family: "'Cascadia Code', monospace",    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code@5.1.0/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code@5.1.0/700.css'] },
    'source-code':{ label: 'Source Code Pro', family: "'Source Code Pro', monospace",  urls: ['https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro@5.1.0/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro@5.1.0/700.css'] },
    'ibm-plex':   { label: 'IBM Plex Mono',   family: "'IBM Plex Mono', monospace",    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.1.0/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.1.0/700.css'] },
    'roboto':     { label: 'Roboto Mono',     family: "'Roboto Mono', monospace",      urls: ['https://cdn.jsdelivr.net/npm/@fontsource/roboto-mono@5.1.0/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/roboto-mono@5.1.0/700.css'] },
  },
};

const CHAT_ID = 'chat-font';
const MONO_ID = 'chat-mono-font';
const SIZE_ID = 'chat-font-size';

export function getFontOptions(type: 'chat' | 'mono'): { key: string; label: string }[] {
  return Object.entries(FONT_PRESETS[type]).map(([k, v]) => ({ key: k, label: v.label }));
}

async function _loadFontCSS(urls: string[] | null) {
  if (!urls) return;
  const list = typeof urls === 'string' ? [urls] : urls;
  for (const url of list) {
    if (document.querySelector(`link[data-font-css="${url}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-font-css', url);
    document.head.appendChild(link);
  }
}

function _injectChatFont(family: string) {
  applyCSS(CHAT_ID, `
    #root { font-family: ${family} !important; }
    #root .ds-markdown, #root .ds-message, #root textarea { font-family: ${family} !important; }
  `);
}

function _injectMonoFont(family: string) {
  applyCSS(MONO_ID, `
    #root code, #root pre, #root [class*="code"],
    #root .ds-markdown code, #root .ds-markdown pre { font-family: ${family} !important; }
  `);
}

export async function applyChatFont(key: string) {
  const cfg = await getConfig();
  cfg.chatFont = key;
  await saveConfig(cfg);

  if (!key) { removeCSS(CHAT_ID); return; }
  const def = FONT_PRESETS.chat[key];
  if (!def) return;
  await _loadFontCSS(def.urls);
  _injectChatFont(def.family);
}

export async function applyChatMonoFont(key: string) {
  const cfg = await getConfig();
  cfg.chatMonoFont = key;
  await saveConfig(cfg);

  if (!key) { removeCSS(MONO_ID); return; }
  const def = FONT_PRESETS.mono[key];
  if (!def) return;
  await _loadFontCSS(def.urls);
  _injectMonoFont(def.family);
}

export function preloadFonts(chatKey: string, monoKey: string) {
  for (const [key, type] of [[chatKey, 'chat'], [monoKey, 'mono']] as const) {
    if (!key) continue;
    const def = FONT_PRESETS[type][key];
    if (!def?.urls) continue;
    const list = typeof def.urls === 'string' ? [def.urls] : def.urls;
    for (const url of list) {
      if (document.querySelector(`link[href="${url}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = url;
      document.head.appendChild(link);
    }
  }
}

export async function applyChatFontSize(size: number) {
  const cfg = await getConfig();
  cfg.chatFontSize = size;
  await saveConfig(cfg);

  if (!size) { removeCSS(SIZE_ID); return; }
  applyCSS(SIZE_ID, `
    #root .ds-markdown, #root .ds-message { font-size: ${size}px !important; }
    #root textarea { font-size: ${size}px !important; }
  `);
}

// ============================================================
// 初始加载
// ============================================================
export async function loadEnhancerFeatures() {
  const cfg = await getConfig();
  if (cfg.wideScreen) await toggleWideScreen(true);
  if (cfg.themeIdx > 0) await applyTheme(cfg.themeIdx);
  if (cfg.hideScrollbar) await toggleScrollbar(true);
  if (cfg.autoHideInput) await toggleAutoHideInput(true);
  if (cfg.voiceInput) { setTimeout(() => { createVoiceButton(); setupVoiceObserver(); document.addEventListener('keydown', onVoiceKeydown); }, 1000); }
  if (cfg.chatFont) applyChatFont(cfg.chatFont);
  if (cfg.chatMonoFont) applyChatMonoFont(cfg.chatMonoFont);
  if (cfg.chatFontSize) applyChatFontSize(cfg.chatFontSize);

  // 始终应用（不依赖主题）
  applyCSS('voice-btn', `
    #root button[style*="border"][style*="rgba(77"] {
      border-radius: 50% !important;
    }
    #ds-mini-panel[style*="opacity: 0"],
    #ds-mini-panel[style*="opacity:0"] {
      pointer-events: none !important;
    }
  `);
}
