// ============================================================
// deepseek-enhancer — 增强器功能（宽屏/主题/滚动条/语音）
// ============================================================
// 从油猴脚本迁移的 UI 增强功能

const ENHANCER_KEY = 'ds_mini_enhancer';

export interface EnhancerConfig {
  wideScreen: boolean;
  themeIdx: number; // 0=默认, 1-4 对应各主题
  hideScrollbar: boolean;
  autoHideInput: boolean;
  voiceInput: boolean;
  chatFont: string; // '' = 默认, 字体 key
  chatMonoFont: string; // '' = 默认, 字体 key
  chatFontSize: number; // 0 = 默认, 10-24
  mdTypo: boolean; // 正文排版预设（行高/标题梯度/段距/代码行高），通用手动开关
}

// ============================================================
// 配置管理
// ============================================================
const DEFAULT_CONFIG: EnhancerConfig = {
  wideScreen: false,
  themeIdx: 0,
  hideScrollbar: false,
  autoHideInput: false,
  voiceInput: false,
  chatFont: '',
  chatMonoFont: '',
  chatFontSize: 0,
  mdTypo: false,
};

export async function getConfig(): Promise<EnhancerConfig> {
  try {
    const r = await chrome.storage.local.get(ENHANCER_KEY);
    // 存储值可能是部分字段（历史写入只存增量），与默认值合并保证字段完整
    const stored = r[ENHANCER_KEY] as Partial<EnhancerConfig> | undefined;
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(cfg: EnhancerConfig) {
  await chrome.storage.local.set({ [ENHANCER_KEY]: cfg });
}

// ============================================================
// 样式管理
// ============================================================
// 生效规则注册表：页面 React/Emotion 重渲染可能移除或重排 head 里的扩展样式标签，
// theme 规则靠 500ms 重建自愈，其余规则靠 reassertStyles + head 守卫统一自愈
const activeStyles = new Map<string, string>();

function applyCSS(id: string, css: string) {
  // 查找或创建 <style data-rule="id"> 标签（挂在 head 下）
  let rule = document.querySelector(`[data-rule="${id}"]`) as HTMLStyleElement | null;
  if (!rule) {
    rule = document.createElement('style');
    rule.setAttribute('data-rule', id);
    document.head.appendChild(rule);
  }
  rule.textContent = css;
  activeStyles.set(id, css);
}

function removeCSS(id: string) {
  const el = document.querySelector(`[data-rule="${id}"]`);
  if (el) el.remove();
  activeStyles.delete(id);
}

/** 重申全部生效规则：被移除的标签重建；已存在的物理移到 head 末尾。theme 必须
    最先归位——它与正文染色规则存在同特异性竞争（后定义胜出），而"切到默认主题"
    会删除 theme 标签，再切回非默认时重建的新标签会落到正文样式之后破坏顺序 */
function reassertStyles() {
  const ordered = [...activeStyles.entries()].sort(([a], [b]) =>
    a === 'theme' ? -1 : b === 'theme' ? 1 : 0,
  );
  for (const [id, css] of ordered) {
    const existing = document.querySelector(`[data-rule="${id}"]`);
    if (existing) document.head.appendChild(existing);
    applyCSS(id, css);
  }
}

// head 守卫：页面重渲染移除样式标签时立即重建；MutationObserver 回调按微任务
// 批量合并无需防抖，重申会再触发本观察器但那时标签已齐、空转不成环。
// 存在性检查限定在 head：标签顺序不变量（theme 之后的相对次序）依赖标签都在
// head 内，被挪进 body 的标签视为丢失，由重申搬回原位。
// 在 loadEnhancerFeatures 启动时挂载（模块顶层不碰 DOM，测试环境无 DOM）
let styleGuardStarted = false;

function startStyleGuard() {
  if (styleGuardStarted) return;
  styleGuardStarted = true;
  const guard = new MutationObserver(() => {
    // 扩展热刷新后旧实例访问 chrome API 会抛错，检测到即退场，避免旧守卫用
    // 旧 CSS 复活新实例已删除的规则（僵尸规则）
    let orphaned = false;
    try {
      orphaned = !chrome.runtime?.id;
    } catch {
      orphaned = true;
    }
    if (orphaned) {
      guard.disconnect();
      return;
    }
    for (const id of activeStyles.keys()) {
      if (!document.head.querySelector(`[data-rule="${id}"]`)) {
        reassertStyles();
        break;
      }
    }
  });
  guard.observe(document.head, { childList: true });
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
    applyCSS(
      'wide',
      `
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
    `,
    );
  } else {
    removeCSS('wide');
    // 恢复聊天面板原始样式
    document.querySelectorAll('[style*="flex: 1 1 auto"]').forEach((el) => {
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
  { name: '默认', bg: '', chatBg: '', sidebarBg: '', sidebarHighlight: '', brandColor: '' },
  {
    name: 'Claude浅',
    bg: '#f7f0e8',
    chatBg: '#fcf7f0',
    sidebarBg: '#f2e8dc',
    sidebarHighlight: '#e6dccd',
    brandColor: '#D98A6A',
  },
  {
    name: 'Catppuccin浅',
    bg: '#eef0f0',
    chatBg: '#f5f7f6',
    sidebarBg: '#e2e6e6',
    sidebarHighlight: '#d2d6d6',
    brandColor: '#179299',
  },
  {
    name: 'Dracula浅',
    bg: '#f5ecec',
    chatBg: '#fbf4f2',
    sidebarBg: '#ebe0de',
    sidebarHighlight: '#ddd0ce',
    brandColor: '#bd93f9',
  },
  {
    name: 'OneHalf浅',
    bg: '#edf0e8',
    chatBg: '#f4f7f0',
    sidebarBg: '#e0e5d8',
    sidebarHighlight: '#ced4c8',
    brandColor: '#61afef',
  },
];

const DARK_THEMES = [
  { name: '默认', bg: '', chatBg: '', sidebarBg: '', sidebarHighlight: '', brandColor: '' },
  {
    name: 'Claude深',
    bg: '#1c1a18',
    chatBg: '#201d1c',
    sidebarBg: '#171513',
    sidebarHighlight: '#292421',
    brandColor: '#E07850',
  },
  {
    name: 'Catppuccin深',
    bg: '#1e1e2e',
    chatBg: '#181825',
    sidebarBg: '#11111b',
    sidebarHighlight: '#20203a',
    brandColor: '#89b4fa',
  },
  {
    name: 'Dracula深',
    bg: '#282a36',
    chatBg: '#21222c',
    sidebarBg: '#191a21',
    sidebarHighlight: '#2c2c3e',
    brandColor: '#bd93f9',
  },
  {
    name: 'OneHalf深',
    bg: '#282c34',
    chatBg: '#2c313a',
    sidebarBg: '#21252b',
    sidebarHighlight: '#30353d',
    brandColor: '#61afef',
  },
];

function isDarkMode(): boolean {
  return document.body.classList.contains('dark');
}

/** 品牌底色上的对勾前景色：按相对亮度取白/深灰，避免浅粉彩品牌上白对勾对比不足 */
export function textColorOnBrand(hex: string): string {
  const n = hex.replace('#', '');
  const channel = (i: number) => parseInt(n.slice(i, i + 2), 16) / 255;
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance =
    0.2126 * linearize(channel(0)) +
    0.7152 * linearize(channel(2)) +
    0.0722 * linearize(channel(4));
  return luminance > 0.32 ? '#18181b' : '#ffffff';
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
    // 切回默认主题：配色与精修跟随摘除（正文排版不受影响）
    syncMarkdownStyles(cfg);
    updateVoiceBtnColor();
    return;
  }

  clearInlineBg();
  applyLayoutMarks();
  // 布局标记依赖几何扫描，切换瞬间的布局过渡态可能失手（清了属性却没打回去，
  // 所有 [data-ds-chatpanel]/[data-ds-sidebar] 作用域的染色规则随之失效），按
  // 延时补打惯例自检修复
  scheduleLayoutMarkRetry();

  applyCSS(
    'theme',
    `
    html, body, #root {
      background-color: ${theme.bg} !important;
    }
    ${
      theme.brandColor
        ? `
    body {
      --dsw-alias-brand-primary: ${theme.brandColor} !important;
      /* 原生 hover 色是写死的 DeepSeek 蓝（--dsw-static-deepseek-450/500），
         从品牌色派生：浅色提亮、深色压暗 */
      --dsw-alias-button-primary-hover: color-mix(in srgb, ${theme.brandColor} 86%, ${dark ? 'black' : 'white'}) !important;
    }
    /* 官方多选复选框选中色：原生把 --dsl-checkbox-color 写死在元素级（deepseek 蓝），
       不随 dsw-alias 变量链，须同级覆盖；对勾按品牌亮度取对比色（浅粉彩品牌上白勾对比不足） */
    #root .ds-checkbox--active {
      --dsl-checkbox-color: ${theme.brandColor} !important;
    }
    #root .ds-checkbox--active svg path {
      fill: ${textColorOnBrand(theme.brandColor)} !important;
    }
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
    /* 用户消息气泡着色：d29f3d7d = 用户消息标识类（哈希，随官方构建变化），
       气泡容器 = 消息容器第一个子元素；只叠加品牌色透明底色，不改布局。
       选择器需带 [data-ds-chatpanel]：特异性 (1,4,0) 压过 no-bg 透明规则 (1,3,0) */
    #root [data-ds-chatpanel] .ds-message.d29f3d7d > :first-child {
      background-color: color-mix(in srgb, ${theme.brandColor} ${dark ? 20 : 12}%, transparent) !important;
    }
    `
        : ''
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
    /* 官方多选：勾选圆点保持品牌色。补 background-color 直写（含子树）是因为上面
       sidebar-selected 的 "*" 规则（1-2-1）会盖过原生 var 消费，把当前会话行上勾选圆点
       及其内部方形 svg 涂成 sidebarHighlight，在圆内露出方形色块。
       本规则特异性 (1-3-1) > (1-2-1)，靠特异性压制，不依赖源顺序 */
    #root [data-ds-sidebar] a:has(.ds-checkbox--active) .ds-checkbox--active,
    #root [data-ds-sidebar] a:has(.ds-checkbox--active) .ds-checkbox--active * {
      background-color: ${theme.brandColor} !important;
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
  `,
  );

  // 配色与精修跟随主题自动启停；随后立即归位标签顺序：从默认主题切回时 theme
  // 标签是新建的、落在正文样式之后，同特异性竞争会立刻翻车，不能等 500ms 防御
  syncMarkdownStyles(cfg);
  reassertStyles();

  // 标记输入框区域不染色
  document.querySelectorAll('textarea').forEach((ta) => {
    let el = ta.parentElement;
    for (let i = 0; i < 5 && el; i++) {
      el.setAttribute('data-ds-no-bg', '');
      el = el.parentElement;
    }
  });

  // 标记发送按钮区域不染色（按钮通常不在 textarea 父链上）
  const allBtns = document.querySelectorAll('button');
  const sendBtn = [...allBtns].find(
    (b) =>
      b.querySelector('svg') &&
      (b.closest('[class*="input"]') ||
        b.closest('[class*="composer"]') ||
        b.closest('[class*="footer"]')),
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
    sbar
      .querySelectorAll('[data-ds-sidebar-selected]')
      .forEach((el) => el.removeAttribute('data-ds-sidebar-selected'));
    const links = sbar.querySelectorAll('a');
    let selected = null;
    for (const link of links) {
      const r = link.getBoundingClientRect();
      if (r.width < 100) continue;
      const c = getComputedStyle(link).color;
      if (c === 'rgb(57, 100, 254)' || c === 'rgb(255, 255, 255)') {
        selected = link;
        break;
      }
    }
    if (!selected) {
      let maxBrightness = 0;
      for (const link of links) {
        const r = link.getBoundingClientRect();
        if (r.width < 100) continue;
        const m = getComputedStyle(link).color.match(/\d+/g);
        if (m) {
          const brightness = Number(m[0]) + Number(m[1]) + Number(m[2]);
          if (brightness > maxBrightness) {
            maxBrightness = brightness;
            selected = link;
          }
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
      // 触发前已切回默认主题的情况：theme 已摘除，此时重建/重打只会留下无主
      // 残留（属性没有作用域规则消费），整体跳过
      if (!activeStyles.has('theme')) return;
      const old = document.querySelector('[data-rule="theme"]');
      if (old) {
        const css = old.textContent || '';
        old.remove();
        const fresh = document.createElement('style');
        fresh.setAttribute('data-rule', 'theme');
        fresh.textContent = css;
        document.head.appendChild(fresh);
      }
      // theme 标签重建后统一重申其余规则，让正文样式等也落在 Emotion 重注入之后；
      // 布局标记一并重打，防止切换时机的失手残留
      reassertStyles();
      applyLayoutMarks();
      markSelectedSidebarItem();
    }, 500);
  }

  // 监听侧边栏 DOM 变化（React 切换会话后重新标记选中项）
  const sbar = document.querySelector('[data-ds-sidebar]');
  if (sbar && theme.sidebarHighlight) {
    // 清理旧的 observer 和 click 监听，防止重复调用时泄漏
    if (sidebarObserver) {
      sidebarObserver.disconnect();
      sidebarObserver = null;
    }
    if (sidebarClickHandler) {
      sbar.removeEventListener('click', sidebarClickHandler, true);
      sidebarClickHandler = null;
    }

    // MutationObserver：拦截 React 重渲染
    const listContainer = sbar.querySelector('[class*="_77cdc67"]') || sbar;
    sidebarObserver = new MutationObserver(() => {
      markSelectedSidebarItem();
    });
    sidebarObserver.observe(listContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    // 点击监听：用户点击侧边栏后延迟重标记（React 渲染完成后）
    sidebarClickHandler = () => {
      setTimeout(markSelectedSidebarItem, 100);
    };
    sbar.addEventListener('click', sidebarClickHandler, true);
  }

  // 禁用磨砂玻璃效果：CSS 全局禁用 backdrop-filter（排除面板）
  applyCSS(
    'frosted',
    `
    *:not(#ds-mini-panel):not(#ds-mini-panel *) {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  `,
  );

  // JS 兜底：查找带 backdrop-filter 的元素，设为透明（排除面板）
  const allEls = document.querySelectorAll('*');
  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i] as HTMLElement;
    const cs = getComputedStyle(el);
    const bf =
      cs.backdropFilter ||
      (cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ||
      '';
    if (bf && bf !== 'none' && !el.closest('#ds-mini-panel')) {
      el.style.setProperty('opacity', '0', 'important');
      el.setAttribute('data-ds-no-bg', '');
    }
  }

  updateVoiceBtnColor();
}

function clearInlineBg() {
  document
    .querySelectorAll(
      '[data-ds-sidebar], [data-ds-chatpanel], [data-ds-no-bg], [data-ds-sidebar-selected]',
    )
    .forEach((el) => {
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

    const children = Array.from(div.children).filter((c) => {
      const cr = c.getBoundingClientRect();
      return cr.width > 0 && cr.height > 0;
    });
    const hasNarrow = children.some((c) => {
      const cr = c.getBoundingClientRect();
      return cr.width >= 180 && cr.width <= 400 && cr.height > 300;
    });
    const hasWide = children.some((c) => {
      const cr = c.getBoundingClientRect();
      return cr.width > 500 && cr.height > 300;
    });
    if (hasNarrow && hasWide) {
      flexRow = div as HTMLElement;
      break;
    }
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

/** 在当前布局上重打 sidebar/chatpanel 标记（幂等，只加不清）；返回是否找到 chatPanel */
function applyLayoutMarks(): boolean {
  const { sidebar, chatPanel } = findLayoutElements();
  if (sidebar) sidebar.setAttribute('data-ds-sidebar', '');
  if (chatPanel) chatPanel.setAttribute('data-ds-chatpanel', '');
  return Boolean(chatPanel);
}

// 标记丢失时的补打延时：几何扫描在布局过渡态可能拿空，稍后布局稳定即可命中
function scheduleLayoutMarkRetry() {
  for (const delay of [500, 1500]) {
    setTimeout(() => {
      if (!document.querySelector('[data-ds-chatpanel]')) applyLayoutMarks();
    }, delay);
  }
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
    applyCSS(
      'scrollbar',
      `
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
    `,
    );
  } else {
    removeCSS('scrollbar');
  }
}

// ============================================================
// 5.4 输入框自动隐藏
// ============================================================
let inputHideActive = false;
let inputHideEl: HTMLElement | null = null; // 要平移的元素（_77cefa5）
let inputClipEl: HTMLElement | null = null; // 裁剪溢出的元素（aaff8b8f）
let inputFocused = false; // textarea 是否有焦点
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
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

let recognition: SpeechRecognitionLike | null = null;
let isRecording = false;
let currentBrandColor = '#4d6bfe';

let sidebarObserver: MutationObserver | null = null;
let sidebarClickHandler: ((e: Event) => void) | null = null;

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
      try {
        recognition.stop();
      } catch {}
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
    if (child !== leftGroup) {
      rightGroup = child;
      break;
    }
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
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('浏览器不支持语音识别');
    return;
  }

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
  try {
    recognition.start();
  } catch {
    stopRecording(btn);
  }
}

function stopRecording(btn: HTMLElement) {
  if (recognition) {
    try {
      recognition.stop();
    } catch {}
  }
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
  urls: string[] | null; // null = system font, no CDN needed
}

const FONT_PRESETS: Record<string, Record<string, FontDef>> = {
  chat: {
    wenkai: {
      label: '霞鹜文楷',
      family: "'LXGW WenKai', '霞鹜文楷', serif",
      urls: ['https://fontsapi.zeoseven.com/292/main/result.css'],
    },
    'noto-serif': {
      label: '思源宋体',
      family: "'Noto Serif CJK', '思源宋体', serif",
      urls: ['https://fontsapi.zeoseven.com/285/main/result.css'],
    },
    'noto-sans': {
      label: '思源黑体',
      family: "'Noto Sans CJK', '思源黑体', sans-serif",
      urls: ['https://fontsapi.zeoseven.com/69/main/result.css'],
    },
    zhuque: {
      label: '朱雀仿宋',
      family: "'Zhuque Fangsong', '朱雀仿宋', serif",
      urls: ['https://fontsapi.zeoseven.com/7/main/result.css'],
    },
    hanchan: {
      label: '寒蝉活宋体',
      family: "'ChillHuoSong_F', '寒蝉活宋体', serif",
      urls: ['https://fontsapi.zeoseven.com/875/main/result.css'],
    },
    chill: {
      label: '寒蝉全圆体',
      family: "'ChillRoundF', '寒蝉全圆体', sans-serif",
      urls: ['https://fontsapi.zeoseven.com/3/main/result.css'],
    },
  },
  mono: {
    jetbrains: {
      label: 'JetBrains Mono',
      family: "'JetBrains Mono', monospace",
      urls: [
        'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.1.0/400.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.1.0/700.css',
      ],
    },
    fira: {
      label: 'Fira Code',
      family: "'Fira Code', monospace",
      urls: [
        'https://cdn.jsdelivr.net/npm/@fontsource/fira-code@5.1.0/400.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/fira-code@5.1.0/700.css',
      ],
    },
    cascadia: {
      label: 'Cascadia Code',
      family: "'Cascadia Code', monospace",
      urls: [
        'https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code@5.1.0/400.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code@5.1.0/700.css',
      ],
    },
    'source-code': {
      label: 'Source Code Pro',
      family: "'Source Code Pro', monospace",
      urls: [
        'https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro@5.1.0/400.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro@5.1.0/700.css',
      ],
    },
    'ibm-plex': {
      label: 'IBM Plex Mono',
      family: "'IBM Plex Mono', monospace",
      urls: [
        'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.1.0/400.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.1.0/700.css',
      ],
    },
    roboto: {
      label: 'Roboto Mono',
      family: "'Roboto Mono', monospace",
      urls: [
        'https://cdn.jsdelivr.net/npm/@fontsource/roboto-mono@5.1.0/400.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/roboto-mono@5.1.0/700.css',
      ],
    },
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
  applyCSS(
    CHAT_ID,
    `
    #root { font-family: ${family} !important; }
    #root .ds-markdown, #root .ds-message, #root textarea { font-family: ${family} !important; }
    #ds-category-panel, #ds-category-panel button { font-family: ${family} !important; }
  `,
  );
}

function _injectMonoFont(family: string) {
  applyCSS(
    MONO_ID,
    `
    #root code, #root pre, #root [class*="code"],
    #root .ds-markdown code, #root .ds-markdown pre { font-family: ${family} !important; }
    #ds-category-panel code, #ds-category-panel pre { font-family: ${family} !important; }
  `,
  );
}

export async function applyChatFont(key: string) {
  const cfg = await getConfig();
  cfg.chatFont = key;
  await saveConfig(cfg);

  if (!key) {
    removeCSS(CHAT_ID);
    return;
  }
  const def = FONT_PRESETS.chat[key];
  if (!def) return;
  await _loadFontCSS(def.urls);
  _injectChatFont(def.family);
}

export async function applyChatMonoFont(key: string) {
  const cfg = await getConfig();
  cfg.chatMonoFont = key;
  await saveConfig(cfg);

  if (!key) {
    removeCSS(MONO_ID);
    return;
  }
  const def = FONT_PRESETS.mono[key];
  if (!def) return;
  await _loadFontCSS(def.urls);
  _injectMonoFont(def.family);
}

export function preloadFonts(chatKey: string, monoKey: string) {
  for (const [key, type] of [
    [chatKey, 'chat'],
    [monoKey, 'mono'],
  ] as const) {
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

  if (!size) {
    removeCSS(SIZE_ID);
    return;
  }
  applyCSS(
    SIZE_ID,
    `
    #root .ds-markdown, #root .ds-message, #root .ds-message > div { font-size: ${size}px !important; }
  `,
  );
}

// ============================================================
// 5.7 正文样式（排版/限宽/配色/代码换行/代码精修）
// ============================================================
// 全部规则 id：sync 时按它逐条 apply/remove，保证关闭项的旧样式标签被清掉。
// 顺序即应用顺序：精修在前、配色在后——两者在代码块横条上同特异性竞争
//（同 (1,3,0)!important），配色殿后才能赢下横条的品牌色
const MARKDOWN_STYLE_RULE_IDS = ['md-typo', 'md-code-polish', 'md-tint'] as const;

/**
 * 按配置产出正文样式规则（纯函数，未启用的不产出）。
 * 正文排版是通用手动开关；正文配色与代码精修跟随主题自动启用（themeIdx>0），
 * 应用顺序精修在前、配色在后（见 MARKDOWN_STYLE_RULE_IDS）。排版走定点属性
 * 覆盖：官方 .ds-markdown 消费的是复合字体简写，子变量未被段落消费，且复合
 * 变量被多处哈希类 UI 组件共用，动它会外溢；字号归 chatFontSize 管辖，此处不碰。
 */
export function buildMarkdownStyleRules(cfg: EnhancerConfig): { id: string; css: string }[] {
  const rules: { id: string; css: string }[] = [];

  if (cfg.mdTypo) {
    rules.push({
      id: 'md-typo',
      css: `
      #root .ds-markdown {
        line-height: 1.75;
      }
      #root .ds-markdown h1 { font-size: 22px; line-height: 32px; font-weight: 700; }
      #root .ds-markdown h2 { font-size: 19px; line-height: 28px; font-weight: 700; }
      #root .ds-markdown h3 { font-size: 17px; line-height: 26px; font-weight: 700; }
      #root .ds-markdown h4 { font-size: 16px; line-height: 24px; font-weight: 600; }
      #root .ds-markdown .ds-markdown-paragraph {
        margin: 20px 0;
      }
      #root .md-code-block pre,
      #root .md-code-block pre code {
        line-height: 1.6;
      }
    `,
    });
  }

  // 正文配色与代码精修跟随主题自动启停（非默认主题启用），无手动开关。
  // 精修先于配色产出（MARKDOWN_STYLE_RULE_IDS 同序）：代码块横条的同特异性
  // 竞争由配色胜出，最终效果 = 代码区灰底 + 横条品牌色
  if (cfg.themeIdx > 0) {
    rules.push({
      id: 'md-code-polish',
      css: `
      /* 代码块几何是元素级变量（声明在 .md-code-block 自身），同级覆盖即生效。
         不改官方语法高亮配色 */
      #root .md-code-block {
        --dsl-code-block-border-radius: 10px;
      }
      /* —— 以下仅主题态生效（data-ds-chatpanel 只在非默认主题时打上）——
         官方在代码块底部两角各放一枚 12px 页角色块（color 消费 --code-bottom-color
         取页面底色），wash 规则只刷 background 管不到 color，非默认主题下露出浅色
         角块；在 .md-code-block 上覆盖该变量置透明即可，不依赖其内部哈希类 */
      #root [data-ds-chatpanel] .md-code-block {
        --code-bottom-color: transparent;
      }
      /* wash 规则 (1,2,0)!important 会把代码块底色涂成 chatBg，丢掉默认主题那样的
         灰度区分；用 label-primary 低比例混色做主题无关灰底，(1,3,0) 稳压 wash。
         pre/banner/footer 还原透明露出灰底；banner-wrap 保持实底（长代码 sticky
         吸顶时内容从其下滚过）并补齐顶部圆角 */
      #root [data-ds-chatpanel] [data-ds-no-bg] .ds-markdown .md-code-block,
      #root [data-ds-chatpanel] .ds-markdown .md-code-block {
        background-color: color-mix(
          in srgb,
          var(--dsw-alias-label-primary) 6%,
          transparent
        ) !important;
      }
      #root [data-ds-chatpanel] .ds-markdown .md-code-block pre,
      #root [data-ds-chatpanel] .ds-markdown .md-code-block .md-code-block-banner,
      #root [data-ds-chatpanel] .ds-markdown .md-code-block .md-code-block-footer {
        background-color: transparent !important;
      }
      #root [data-ds-chatpanel] [data-ds-no-bg] .ds-markdown .md-code-block-banner-wrap,
      #root [data-ds-chatpanel] .ds-markdown .md-code-block-banner-wrap {
        background-color: color-mix(
          in srgb,
          var(--dsw-alias-label-primary) 6%,
          transparent
        ) !important;
        border-top-left-radius: var(--dsl-code-block-border-radius);
        border-top-right-radius: var(--dsl-code-block-border-radius);
      }
    `,
    });
    rules.push({
      id: 'md-tint',
      css: `
      /* 品牌色一律 color-mix 官方 alias 变量派生：主题激活时自动跟随主题色，
         默认主题落到官方品牌蓝。深浅比例不同（浅 12% / 深 20%，仿用户气泡先例），
         经变量下发避免整套规则按深浅写两遍；深色判定须同时覆盖 body[data-ds-dark-theme]
         与 body.dark 两种官方标记 */
      #root {
        --ds-md-tint-alpha: 12%;
      }
      body[data-ds-dark-theme] #root,
      body.dark #root {
        --ds-md-tint-alpha: 20%;
      }
      /* 底色规则要压过两层对手：wash 规则 (1,2,0) 与 no-bg 透明毯规则
         ([data-ds-no-bg] *，(1,3,0)，滚动区等祖先链被标记时覆盖全部消息)。
         三档选择器各司其职：no-bg 链变体 (1,3,x) 严格压过透明毯，chatpanel
         变体压过 wash，无前缀变体兜底属性标记重打前的间隙 */
      #root [data-ds-chatpanel] [data-ds-no-bg] .ds-markdown :not(pre) > code,
      #root [data-ds-chatpanel] .ds-markdown :not(pre) > code,
      #root .ds-markdown :not(pre) > code {
        background-color: color-mix(
          in srgb,
          var(--dsw-alias-brand-primary) var(--ds-md-tint-alpha),
          transparent
        ) !important;
        border-radius: 4px;
      }
      /* blockquote 左条 + 淡底；子元素须清透明，否则被 wash 规则涂成 chatBg 盖住淡底
         （代码块相关与嵌套引用除外：前者有专属底色，后者保留各自 tint 叠加加深） */
      #root [data-ds-chatpanel] [data-ds-no-bg] .ds-markdown blockquote,
      #root [data-ds-chatpanel] .ds-markdown blockquote,
      #root .ds-markdown blockquote {
        background-color: color-mix(
          in srgb,
          var(--dsw-alias-brand-primary) var(--ds-md-tint-alpha),
          transparent
        ) !important;
        border-left: 3px solid
          color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent) !important;
      }
      #root [data-ds-chatpanel] .ds-markdown blockquote
        :not(.md-code-block):not(blockquote):not(pre):not(code),
      #root .ds-markdown blockquote :not(.md-code-block):not(blockquote):not(pre):not(code) {
        background-color: transparent !important;
      }
      /* 引用角标 */
      #root [data-ds-chatpanel] [data-ds-no-bg] .ds-markdown .ds-markdown-cite,
      #root [data-ds-chatpanel] .ds-markdown .ds-markdown-cite,
      #root .ds-markdown .ds-markdown-cite {
        background-color: color-mix(
          in srgb,
          var(--dsw-alias-brand-primary) var(--ds-md-tint-alpha),
          transparent
        ) !important;
        border-radius: 3px;
      }
      /* 代码块标题栏品牌色：与精修的横条灰底规则同为 (1,4,0)!important 同分，
         靠配色殿后（MARKDOWN_STYLE_RULE_IDS 序）胜出——重排规则 id 顺序会翻转
         横条颜色，勿动 */
      #root [data-ds-chatpanel] [data-ds-no-bg] .ds-markdown .md-code-block-banner-wrap,
      #root [data-ds-chatpanel] .ds-markdown .md-code-block-banner-wrap,
      #root .ds-markdown .md-code-block-banner-wrap {
        background-color: color-mix(
          in srgb,
          var(--dsw-alias-brand-primary) var(--ds-md-tint-alpha),
          transparent
        ) !important;
      }
    `,
    });
  }

  return rules;
}

/** 按配置同步正文规则：启用的应用 CSS，未启用的移除旧样式标签 */
function syncMarkdownStyles(cfg: EnhancerConfig) {
  const cssById = new Map(buildMarkdownStyleRules(cfg).map((r) => [r.id, r.css]));
  for (const id of MARKDOWN_STYLE_RULE_IDS) {
    const css = cssById.get(id);
    if (css) applyCSS(id, css);
    else removeCSS(id);
  }
}

/** 排版开关会整体改变消息高度，而站点在消息滚动容器上禁用了原生滚动锚定
    （.ds-virtual-list 的 overflow-anchor:none），高度变化时浏览器不做任何补偿，
    整页上下跳。切的前后以视口顶部附近的第一条消息为锚点，重排稳定后把位移差
    补回 scrollTop */
// 代际计数：极短间隔内连续开关排版时，旧补偿的 rAF 会落在新补偿之后、基于
// 中间布局多补一次，发现代际不符即放弃
let scrollAnchorGeneration = 0;

function applyWithScrollAnchor(apply: () => void) {
  const generation = ++scrollAnchorGeneration;
  let anchor: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;
  let beforeTop = 0;
  for (const el of document.querySelectorAll<HTMLElement>('.ds-message')) {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.bottom <= 0) continue;
    anchor = el;
    // 从锚点向上找真实滚动容器（可滚且确实有溢出），不依赖具体容器类名
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) {
        scroller = p;
        break;
      }
    }
    beforeTop = rect.top;
    break;
  }
  apply();
  if (!anchor || !scroller) return;
  // 双 rAF：等样式重排与虚拟列表异步布局都落定后再补偿
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (generation !== scrollAnchorGeneration) return;
      if (!anchor!.isConnected) return;
      // scrollTop 越界由浏览器自行钳制
      scroller!.scrollTop += anchor!.getBoundingClientRect().top - beforeTop;
    });
  });
}

/** 面板开关入口：保存配置并同步正文排版规则（配色/精修由主题驱动，不走此入口） */
export async function toggleMarkdownTypo(enabled: boolean) {
  const cfg = await getConfig();
  cfg.mdTypo = enabled;
  await saveConfig(cfg);
  applyWithScrollAnchor(() => syncMarkdownStyles(cfg));
}

// ============================================================
// 初始加载
// ============================================================
export async function loadEnhancerFeatures() {
  const cfg = await getConfig();
  startStyleGuard();
  if (cfg.wideScreen) await toggleWideScreen(true);
  if (cfg.themeIdx > 0) await applyTheme(cfg.themeIdx);
  if (cfg.hideScrollbar) await toggleScrollbar(true);
  if (cfg.autoHideInput) await toggleAutoHideInput(true);
  if (cfg.voiceInput) {
    setTimeout(() => {
      createVoiceButton();
      setupVoiceObserver();
      document.addEventListener('keydown', onVoiceKeydown);
    }, 1000);
  }
  if (cfg.chatFont) applyChatFont(cfg.chatFont);
  if (cfg.chatMonoFont) applyChatMonoFont(cfg.chatMonoFont);
  if (cfg.chatFontSize) applyChatFontSize(cfg.chatFontSize);
  // 正文样式 5 项：开启的应用、关闭的清除，幂等
  syncMarkdownStyles(cfg);

  // 始终应用（不依赖主题）
  applyCSS(
    'voice-btn',
    `
    #root button[style*="border"][style*="rgba(77"] {
      border-radius: 50% !important;
    }
    #ds-mini-panel[style*="opacity: 0"],
    #ds-mini-panel[style*="opacity:0"] {
      pointer-events: none !important;
    }
  `,
  );
}
