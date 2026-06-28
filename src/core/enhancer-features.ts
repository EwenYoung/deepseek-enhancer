// ============================================================
// deepseek-enhancer — 增强器功能（宽屏/主题/滚动条/语音）
// ============================================================
// 从油猴脚本迁移的 UI 增强功能

const ENHANCER_KEY = 'ds_mini_enhancer';

interface EnhancerConfig {
  wideScreen: boolean;
  themeIdx: number;       // 0=默认, 1-4 对应各主题
  hideScrollbar: boolean;
  autoHideInput: boolean;
  voiceInput: boolean;
}

// ============================================================
// 配置管理
// ============================================================
export async function getConfig(): Promise<EnhancerConfig> {
  try {
    const r = await chrome.storage.local.get(ENHANCER_KEY);
    return r[ENHANCER_KEY] || { wideScreen: false, themeIdx: 0, hideScrollbar: false, autoHideInput: false, voiceInput: false };
  } catch { return { wideScreen: false, themeIdx: 0, hideScrollbar: false, autoHideInput: false, voiceInput: false }; }
}

async function saveConfig(cfg: EnhancerConfig) {
  await chrome.storage.local.set({ [ENHANCER_KEY]: cfg });
}

// ============================================================
// 样式管理
// ============================================================
let styleEl: HTMLStyleElement | null = null;

function getStyleEl(): HTMLStyleElement {
  if (styleEl && document.head.contains(styleEl)) return styleEl;
  styleEl = document.getElementById('ds-enhancer-styles') as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ds-enhancer-styles';
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

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
  { name: '默认',  bg: '',        chatBg: '',        sidebarBg: '',        sidebarHighlight: '' },
  { name: 'Claude浅', bg: '#f5ece2', chatBg: '#fbf3e8',  sidebarBg: '#ede0d4', sidebarHighlight: '#ded0be' },
  { name: 'Cat浅',   bg: '#eef0f0',  chatBg: '#f5f7f6',  sidebarBg: '#e2e6e6', sidebarHighlight: '#d2d6d6' },
  { name: 'Dracula浅', bg: '#f5ecec', chatBg: '#fbf4f2',  sidebarBg: '#ebe0de', sidebarHighlight: '#ddd0ce' },
  { name: 'OneHalf浅', bg: '#edf0e8', chatBg: '#f4f7f0',  sidebarBg: '#e0e5d8', sidebarHighlight: '#ced4c8' },
];

const DARK_THEMES = [
  { name: '默认',    bg: '',        chatBg: '',        sidebarBg: '',        sidebarHighlight: '' },
  { name: 'Claude深', bg: '#1a1625', chatBg: '#1e1a2a',  sidebarBg: '#15121f', sidebarHighlight: '#261f35' },
  { name: 'Cat深',   bg: '#1e1e2e',  chatBg: '#181825',  sidebarBg: '#11111b', sidebarHighlight: '#20203a' },
  { name: 'Dracula深', bg: '#282a36', chatBg: '#21222c',  sidebarBg: '#191a21', sidebarHighlight: '#2c2c3e' },
  { name: 'OneHalf深', bg: '#282c34', chatBg: '#2c313a',  sidebarBg: '#21252b', sidebarHighlight: '#30353d' },
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

  if (idx === 0 || !theme.bg) {
    removeCSS('theme');
    clearInlineBg();
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
    #root [data-ds-sidebar] {
      background-color: ${theme.sidebarBg} !important;
    }
    /* 侧边栏直接子容器染色（覆盖可能的 DeepSeek 白色背景） */
    #root [data-ds-sidebar] > * {
      background-color: ${theme.sidebarBg} !important;
    }
    #root [data-ds-chatpanel],
    #root [data-ds-chatpanel] *:not([class*="ds-button"]) {
      background-color: ${theme.chatBg} !important;
    }
    /* no-bg 区域：同特异性(0-1-3-0最高)后定义 → 透明 */
    #root [data-ds-chatpanel] [data-ds-no-bg],
    #root [data-ds-chatpanel] [data-ds-no-bg] *:not([class*="ds-button"]) {
      background-color: transparent !important;
    }
    /* 外部 no-bg 包裹器（右侧间隙）：同样排除按钮 */
    #root [data-ds-no-bg],
    #root [data-ds-no-bg] *:not([class*="ds-button"]) {
      background-color: transparent !important;
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

  // 禁用磨砂玻璃效果：CSS 全局禁用 backdrop-filter
  applyCSS('frosted', `
    * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  `);

  // JS 兜底：查找带 backdrop-filter 的元素，设为透明
  const allEls = document.querySelectorAll('*');
  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i] as HTMLElement;
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || (cs as any).webkitBackdropFilter || '';
    if (bf && bf !== 'none') {
      el.style.setProperty('opacity', '0', 'important');
      el.setAttribute('data-ds-no-bg', '');
    }
  }
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
    `);
  } else {
    removeCSS('scrollbar');
  }
}

// ============================================================
// 5.4 输入框自动隐藏
// ============================================================
let inputHideActive = false;
let inputHideTimer: ReturnType<typeof setTimeout> | null = null;

function onMouseMove(e: MouseEvent) {
  if (!inputHideActive) return;
  const nearBottom = window.innerHeight - e.clientY < 120;
  document.querySelectorAll('.ds-input-autohide').forEach(el => {
    (el as HTMLElement).classList.toggle('ds-input-visible', nearBottom);
  });
}

export async function toggleAutoHideInput(enabled: boolean) {
  const cfg = await getConfig();
  cfg.autoHideInput = enabled;
  await saveConfig(cfg);
  inputHideActive = enabled;

  if (enabled) {
    applyCSS('inputHide', `
      .ds-input-autohide {
        transform: translateY(65%) !important;
        transition: transform 0.35s ease !important;
      }
      .ds-input-autohide.ds-input-visible {
        transform: translateY(0) !important;
      }
    `);
    // 标记输入包装层
    const ta = document.querySelector('textarea');
    if (ta) {
      let el = ta.parentElement;
      for (let i = 0; i < 5 && el; i++) {
        if (el.tagName === 'DIV' && getComputedStyle(el).position !== 'static') {
          el.classList.add('ds-input-autohide');
          break;
        }
        el = el.parentElement;
      }
    }
    document.addEventListener('mousemove', onMouseMove);
  } else {
    removeCSS('inputHide');
    document.querySelectorAll('.ds-input-autohide, .ds-input-visible').forEach(el => {
      el.classList.remove('ds-input-autohide', 'ds-input-visible');
    });
    document.removeEventListener('mousemove', onMouseMove);
  }
}

// ============================================================
// 5.5 语音输入
// ============================================================
let recognition: SpeechRecognition | null = null;
let isRecording = false;

export async function toggleVoiceInput(enabled: boolean) {
  const cfg = await getConfig();
  cfg.voiceInput = enabled;
  await saveConfig(cfg);

  if (enabled) {
    createVoiceButton();
  } else {
    document.getElementById('ds-voice-btn')?.remove();
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    isRecording = false;
  }
}

function createVoiceButton() {
  if (document.getElementById('ds-voice-btn')) return;
  const ta = document.querySelector('textarea');
  if (!ta) return;

  const btn = document.createElement('button');
  btn.id = 'ds-voice-btn';
  btn.type = 'button';
  btn.title = '语音输入';
  btn.style.cssText = `
    position: absolute; right: 12px; bottom: 12px;
    width: 28px; height: 28px; border-radius: 6px;
    border: 1px solid rgba(77,107,254,0.3);
    background: rgba(77,107,254,0.1);
    color: #4d6bfe; cursor: pointer; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  `;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleRecording(btn);
  });

  const container = ta.closest('div') || ta.parentElement;
  if (container && getComputedStyle(container).position === 'static') {
    (container as HTMLElement).style.position = 'relative';
  }
  container?.appendChild(btn);
}

function toggleRecording(btn: HTMLElement) {
  if (isRecording) {
    stopRecording(btn);
  } else {
    startRecording(btn);
  }
}

function startRecording(btn: HTMLElement) {
  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
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
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t;
      else interimText += t;
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
// 初始加载
// ============================================================
export async function loadEnhancerFeatures() {
  const cfg = await getConfig();
  if (cfg.wideScreen) await toggleWideScreen(true);
  if (cfg.themeIdx > 0) await applyTheme(cfg.themeIdx);
  if (cfg.hideScrollbar) await toggleScrollbar(true);
  if (cfg.autoHideInput) await toggleAutoHideInput(true);
  if (cfg.voiceInput) { setTimeout(createVoiceButton, 1000); }
}
