// ============================================================
// deepseek-enhancer — Skill 管理浮层面板
// ============================================================
// 从页面右侧滑出的管理面板
import type { AppState, Skill } from './types';
import { loadSkills, saveSkill, deleteSkill, toggleSkill } from './skill-registry';
import { importFromGitHub, importFromGitHubPath, importFromLocal, importAndSave } from './skill-importer';
import { exportChat } from './chat-exporter';
import {
  toggleWideScreen, applyTheme, toggleScrollbar,
  toggleAutoHideInput, toggleVoiceInput,
  getConfig, getThemeCount,
} from './enhancer-features';

// ============================================================
// DOM
// ============================================================
let panelEl: HTMLElement | null = null;
let panelInited = false;

// ============================================================
// 初始化
// ============================================================
export async function initPanel(state: AppState) {
  state.skills = await loadSkills();

  if (panelInited) {
    refreshSkillList(state);
    return;
  }

  createPanel(state);
  panelInited = true;
}

// ============================================================
// 创建面板
// ============================================================
let tabTop = 0;
let tabLeft = 0;

// 从 storage 恢复位置
chrome.storage.local.get('ds_mini_tab_pos').then(r => {
  if (r.ds_mini_tab_pos) {
    tabTop = r.ds_mini_tab_pos.top;
    tabLeft = r.ds_mini_tab_pos.left;
    const tab = document.getElementById('ds-mini-panel-tab');
    if (tab) {
      tab.style.top = tabTop + 'px';
      tab.style.left = tabLeft + 'px';
      tab.style.right = 'auto';
    }
  }
});

function createPanel(state: AppState) {
  // Tab 触发器（可拖拽）
  const tab = document.createElement('div');
  tab.id = 'ds-mini-panel-tab';
  tab.innerHTML = '⚡';
  tab.title = 'Deepseek Enhancer ✦ 工具面板（可拖拽）';
  tab.style.cssText = `
    position: fixed;
    right: 0;
    top: 50%;
    z-index: 999998;
    width: 24px;
    height: 80px;
    background: #4f46e5;
    color: #fff;
    border-radius: 8px 0 0 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    font-size: 16px;
    writing-mode: vertical-lr;
    letter-spacing: 4px;
    opacity: 0.7;
    user-select: none;
    transition: opacity 0.3s;
  `;
  tab.addEventListener('mouseenter', () => { tab.style.opacity = '1'; });
  tab.addEventListener('mouseleave', () => { if (!isDragging) tab.style.opacity = '0.7'; });

  // 拖拽逻辑
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let isDragging = false;
  let hasMoved = false;

  tab.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 只响应左键
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = tab.getBoundingClientRect();
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
    isDragging = true;
    hasMoved = false;
    tab.style.cursor = 'grabbing';
    tab.style.transition = 'none';
    tab.style.right = 'auto';
    tab.style.left = dragStartLeft + 'px';
    tab.style.top = dragStartTop + 'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
    tab.style.left = Math.max(0, Math.min(dragStartLeft + dx, window.innerWidth - 24)) + 'px';
    tab.style.top = Math.max(0, Math.min(dragStartTop + dy, window.innerHeight - 80)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    tab.style.cursor = 'grab';
    tab.style.opacity = '0.7';

    // 保存位置
    tabTop = parseInt(tab.style.top, 10) || 0;
    tabLeft = parseInt(tab.style.left, 10) || 0;
    chrome.storage.local.set({ ds_mini_tab_pos: { top: tabTop, left: tabLeft } });

    // 恢复位置
    if (tabTop) tab.style.top = tabTop + 'px';
    if (tabLeft) tab.style.left = tabLeft + 'px';
  });

  // 点击（没拖拽才算点击）
  tab.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    togglePanel(state);
  });

  document.body.appendChild(tab);

  // 面板主体
  panelEl = document.createElement('div');
  panelEl.id = 'ds-mini-panel';
  panelEl.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 360px;
    height: 100vh;
    z-index: 999999;
    background: #fff;
    box-shadow: -4px 0 24px rgba(0,0,0,0.12);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, sans-serif;
    font-size: 14px;
    color: #1f2937;
  `;

  panelEl.innerHTML = buildPanelHTML();
  document.body.appendChild(panelEl);

  // 事件绑定
  bindPanelEvents(state);
}

// ============================================================
// 面板 HTML
// ============================================================
function buildPanelHTML(): string {
  return `
    <!-- 标题栏 -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
      <span style="font-weight:800;font-size:16px;background:linear-gradient(135deg,#4f46e5,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:0.5px;">✦ Deepseek Enhancer</span>
      <button id="ds-mini-panel-close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9ca3af;padding:4px 8px;">×</button>
    </div>

    <!-- 1. Agent 模式（最重要，置顶） -->
    <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;background:#f0f5ff;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div><span style="font-size:13px;font-weight:600;color:#1e40af;">🤖 Agent 模式</span>
        <div style="font-size:11px;color:#6b7280;margin-top:1px;">注入工具定义 + 自动循环</div></div>
        <label id="ds-mini-agent-toggle" style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
          <input type="checkbox" id="ds-mini-agent-checkbox" style="opacity:0;width:0;height:0;">
          <span id="ds-mini-agent-slider" style="position:absolute;inset:0;background:#d1d5db;border-radius:24px;transition:background 0.3s;"></span>
          <span style="position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform 0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);" id="ds-mini-agent-knob"></span>
        </label>
      </div>
    </div>

    <!-- 2. 工具卡片 -->
    <div style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">🧰 Tools</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;"><div style="font-size:13px;font-weight:600;">🔍 搜索</div><div style="font-size:10px;color:#9ca3af;">web_search</div></div>
        <div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;"><div style="font-size:13px;font-weight:600;">📄 抓取</div><div style="font-size:10px;color:#9ca3af;">web_fetch</div></div>
        <div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;"><div style="font-size:13px;font-weight:600;">📰 新闻</div><div style="font-size:10px;color:#9ca3af;">news_hub</div></div>
        <div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;"><div style="font-size:13px;font-weight:600;">🔥 GitHub</div><div style="font-size:10px;color:#9ca3af;">github_trending</div></div>
        <div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;"><div style="font-size:13px;font-weight:600;">📝 生成文档</div><div style="font-size:10px;color:#9ca3af;">doc_generate</div></div>
      </div>
    </div>

    <!-- 3. 导出 -->
    <div style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:12px;font-weight:600;color:#166534;margin-bottom:6px;">📤 导出会话</div>
      <div style="display:flex;gap:6px;">
        <button id="ds-mini-export-md" style="flex:1;padding:5px 10px;border:1px solid #16a34a;border-radius:6px;background:#fff;color:#166534;cursor:pointer;font-size:11px;font-weight:500;">📄 Markdown</button>
        <button id="ds-mini-export-html" style="flex:1;padding:5px 10px;border:none;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer;font-size:11px;font-weight:500;">🌐 HTML</button>
      </div>
    </div>

    <!-- 4. 技能列表 -->
    <div style="flex:1;overflow-y:auto;padding:10px 14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:600;">📋 Skills</span>
        <div style="display:flex;gap:4px;">
          <button id="ds-mini-import-gh" title="GitHub导入" style="padding:3px 8px;font-size:10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;">📦</button>
          <button id="ds-mini-import-local" title="本地导入" style="padding:3px 8px;font-size:10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;">📁</button>
          <button id="ds-mini-add-skill" title="新建技能" style="padding:3px 8px;font-size:10px;border:none;border-radius:4px;background:#4f46e5;color:#fff;cursor:pointer;">+</button>
        </div>
      </div>
      <div id="ds-mini-skill-list"></div>
    </div>

    <!-- 5. 设置（折叠） -->
    <div style="border-top:1px solid #e5e7eb;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;cursor:pointer;user-select:none;color:#6b7280;font-size:12px;" onclick="
        var c=document.getElementById('ds-mini-settings-body'),i=this.querySelector('.ds-set-icon');
        if(c){c.style.display=c.style.display==='none'?'block':'none'}
        if(i){i.textContent=c.style.display==='none'?'▶':'▼'}
      ">
        <span>⚙️ 设置</span>
        <span class="ds-set-icon" style="color:#d1d5db;font-size:10px;">▶</span>
      </div>
      <div id="ds-mini-settings-body" style="display:none;padding:0 14px 12px;">
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#92400e;">🔑 Tavily API Key</span>
            <span id="ds-mini-apikey-status" style="font-size:10px;"></span>
          </div>
          <div style="display:flex;gap:4px;">
            <input id="ds-mini-apikey" type="password" placeholder="tvly-xxxxxxxx" style="flex:1;padding:5px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;">
            <button id="ds-mini-apikey-save" style="padding:5px 8px;border:none;border-radius:4px;background:#4f46e5;color:#fff;cursor:pointer;font-size:10px;white-space:nowrap;">保存</button>
            <button id="ds-mini-apikey-test" style="padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:10px;">🔍</button>
          </div>
        </div>
        <!-- 增强功能 -->
        <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:4px;">🎨 增强功能</div>
        <div class="ds-enh-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;border-bottom:1px solid #f3f4f6;">
          <span>🖥️ 宽屏模式</span>
          <button id="ds-enh-wide" style="padding:2px 8px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;font-size:10px;">关闭</button>
        </div>
        <div class="ds-enh-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;border-bottom:1px solid #f3f4f6;">
          <span>🎨 背景主题</span>
          <button id="ds-enh-theme" style="padding:2px 8px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;font-size:10px;">默认</button>
        </div>
        <div class="ds-enh-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;border-bottom:1px solid #f3f4f6;">
          <span>📜 滚动条</span>
          <button id="ds-enh-scrollbar" style="padding:2px 8px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;font-size:10px;">显示</button>
        </div>
        <div class="ds-enh-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;border-bottom:1px solid #f3f4f6;">
          <span>⬇️ 输入框自动隐藏</span>
          <button id="ds-enh-autohide" style="padding:2px 8px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;font-size:10px;">关闭</button>
        </div>
        <div class="ds-enh-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;">
          <span>🎤 语音输入</span>
          <button id="ds-enh-voice" style="padding:2px 8px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;font-size:10px;">关闭</button>
        </div>
      </div>
    </div>

    <!-- 编辑/新建表单（默认隐藏） -->
    <div id="ds-mini-editor" style="display:none;flex:1;overflow-y:auto;padding:12px;flex-direction:column;"></div>

    <!-- GitHub 导入弹层 -->
    <div id="ds-mini-gh-dialog" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.3);align-items:center;justify-content:center;"></div>
  `;
}

// ============================================================
// 事件绑定
// ============================================================
function bindPanelEvents(state: AppState) {
  if (!panelEl) return;

  panelEl.querySelector('#ds-mini-panel-close')?.addEventListener('click', () => closePanel());
  panelEl.querySelector('#ds-mini-add-skill')?.addEventListener('click', () => showEditor(state));
  panelEl.querySelector('#ds-mini-import-gh')?.addEventListener('click', () => showGHDialog());
  panelEl.querySelector('#ds-mini-import-local')?.addEventListener('click', () => handleLocalImport(state));

  // 导出
  panelEl.querySelector('#ds-mini-export-md')?.addEventListener('click', () => exportChat('markdown'));
  panelEl.querySelector('#ds-mini-export-html')?.addEventListener('click', () => exportChat('html'));

  // API Key
  loadAPIKey();
  panelEl.querySelector('#ds-mini-apikey-save')?.addEventListener('click', saveAPIKey);
  panelEl.querySelector('#ds-mini-apikey-test')?.addEventListener('click', testTavilyConnection);

  // Agent 模式
  loadAgentMode();
  panelEl.querySelector('#ds-mini-agent-toggle')?.addEventListener('click', toggleAgentMode);

  // 增强器功能
  loadEnhancerPanel();
  panelEl.querySelector('#ds-enh-wide')?.addEventListener('click', handleEnhancerToggle);
  panelEl.querySelector('#ds-enh-theme')?.addEventListener('click', handleEnhancerToggle);
  panelEl.querySelector('#ds-enh-scrollbar')?.addEventListener('click', handleEnhancerToggle);
  panelEl.querySelector('#ds-enh-autohide')?.addEventListener('click', handleEnhancerToggle);
  panelEl.querySelector('#ds-enh-voice')?.addEventListener('click', handleEnhancerToggle);

  refreshSkillList(state);
}

// ============================================================
// API Key 管理
// ============================================================
async function loadAPIKey() {
  const input = panelEl?.querySelector('#ds-mini-apikey') as HTMLInputElement | null;
  if (!input) return;

  try {
    const r = await chrome.storage.local.get('ds_mini_tavily_key');
    input.value = r.ds_mini_tavily_key || '';
    updateAPIKeyStatus(!!r.ds_mini_tavily_key);
  } catch {
    try {
      chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, (resp) => {
        if (resp?.key) {
          input.value = resp.key;
          updateAPIKeyStatus(true);
        } else {
          updateAPIKeyStatus(false);
        }
      });
    } catch { /* ignore */ }
  }
}

function updateAPIKeyStatus(hasKey: boolean) {
  const statusEl = panelEl?.querySelector('#ds-mini-apikey-status');
  if (!statusEl) return;
  statusEl.textContent = hasKey ? '✅ 已配置' : '❌ 未配置';
}

function saveAPIKey() {
  const input = panelEl?.querySelector('#ds-mini-apikey') as HTMLInputElement | null;
  if (!input) return;

  const key = input.value.trim();
  chrome.storage.local.set({ ds_mini_tavily_key: key }).then(() => {
    chrome.runtime.sendMessage({ type: 'SET_API_KEY', key });
    updateAPIKeyStatus(!!key);
    showToast(key ? 'API Key 已保存 ✅' : 'API Key 已清除');
  }).catch(() => {
    showToast('保存失败 ❌');
  });
}

async function testTavilyConnection() {
  const testBtn = panelEl?.querySelector('#ds-mini-apikey-test') as HTMLButtonElement | null;
  if (!testBtn) return;

  testBtn.disabled = true;
  testBtn.textContent = '⏳ 测试中...';

  try {
    chrome.runtime.sendMessage({ type: 'TEST_TAVILY' }, (resp) => {
      testBtn.disabled = false;
      testBtn.textContent = '🔍 测试';
      if (resp?.ok) {
        showToast('Tavily 连接正常 ✅');
      } else {
        showToast(`Tavily 测试失败: ${resp?.message || '未知错误'} ❌`);
      }
    });
  } catch (err) {
    testBtn.disabled = false;
    testBtn.textContent = '🔍 测试';
    showToast(`测试请求失败: ${err} ❌`);
  }
}

// ============================================================
// Agent 模式管理
// ============================================================
const AGENT_MODE_KEY = 'ds_mini_agent_mode';

function updateAgentSlider(enabled: boolean) {
  const slider = panelEl?.querySelector('#ds-mini-agent-slider') as HTMLElement | null;
  const knob = panelEl?.querySelector('#ds-mini-agent-knob') as HTMLElement | null;
  if (slider) slider.style.background = enabled ? '#4f46e5' : '#d1d5db';
  if (knob) knob.style.transform = enabled ? 'translateX(20px)' : '';
}

async function loadAgentMode() {
  const checkbox = panelEl?.querySelector('#ds-mini-agent-checkbox') as HTMLInputElement | null;
  if (!checkbox) return;

  try {
    const r = await chrome.storage.local.get(AGENT_MODE_KEY);
    const enabled = !!r[AGENT_MODE_KEY];
    checkbox.checked = enabled;
    updateAgentSlider(enabled);
    postAgentMode(enabled);
  } catch { /* ignore */ }
}

function toggleAgentMode() {
  const checkbox = panelEl?.querySelector('#ds-mini-agent-checkbox') as HTMLInputElement | null;
  if (!checkbox) return;

  const enabled = !checkbox.checked;
  checkbox.checked = enabled;
  updateAgentSlider(enabled);
  chrome.storage.local.set({ [AGENT_MODE_KEY]: enabled });
  postAgentMode(enabled);
  showToast(enabled ? 'Agent 模式已开启 ✅' : 'Agent 模式已关闭');
}

function postAgentMode(enabled: boolean) {
  window.postMessage({
    source: 'DS_MINI_ISOLATED',
    type: 'SET_AGENT_MODE',
    enabled,
  }, '*');
  console.log('[DS-Mini:UI] Agent mode:', enabled ? 'ON' : 'OFF');
}

// ============================================================
// 增强器功能
// ============================================================
let enhState: any = { wideScreen: false, themeIdx: 0, hideScrollbar: false, autoHideInput: false, voiceInput: false };

async function loadEnhancerPanel() {
  enhState = await getConfig();
  updateEnhButtons();
}

async function handleEnhancerToggle(e: Event) {
  const btn = e.currentTarget as HTMLElement;
  const id = btn.id;

  switch (id) {
    case 'ds-enh-wide':
      enhState.wideScreen = !enhState.wideScreen;
      await toggleWideScreen(enhState.wideScreen);
      break;
    case 'ds-enh-theme':
      enhState.themeIdx = (enhState.themeIdx + 1) % getThemeCount();
      await applyTheme(enhState.themeIdx);
      break;
    case 'ds-enh-scrollbar':
      enhState.hideScrollbar = !enhState.hideScrollbar;
      await toggleScrollbar(enhState.hideScrollbar);
      break;
    case 'ds-enh-autohide':
      enhState.autoHideInput = !enhState.autoHideInput;
      await toggleAutoHideInput(enhState.autoHideInput);
      break;
    case 'ds-enh-voice':
      enhState.voiceInput = !enhState.voiceInput;
      await toggleVoiceInput(enhState.voiceInput);
      break;
  }
  updateEnhButtons();
}

function updateEnhButtons() {
  const labels: Record<string, string> = {
    wideScreen: '宽屏模式',
    themeIdx: '背景主题',
    hideScrollbar: '滚动条',
    autoHideInput: '输入框自动隐藏',
    voiceInput: '语音输入',
  };
  const btn = (id: string) => panelEl?.querySelector(id) as HTMLElement | null;

  const bW = btn('#ds-enh-wide');
  if (bW) bW.textContent = enhState.wideScreen ? '开启' : '关闭';

  const bT = btn('#ds-enh-theme');
  if (bT) {
    const names = ['默认', 'Claude', 'Cat', 'Dracula', 'OneHalf'];
    bT.textContent = names[enhState.themeIdx % names.length];
  }

  const bS = btn('#ds-enh-scrollbar');
  if (bS) bS.textContent = enhState.hideScrollbar ? '隐藏' : '显示';

  const bA = btn('#ds-enh-autohide');
  if (bA) bA.textContent = enhState.autoHideInput ? '开启' : '关闭';

  const bV = btn('#ds-enh-voice');
  if (bV) bV.textContent = enhState.voiceInput ? '开启' : '关闭';
}

function showToast(msg: string) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    z-index:9999999;background:#1f2937;color:#fff;padding:8px 20px;
    border-radius:6px;font-size:14px;font-family:-apple-system,sans-serif;
    transition:opacity 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
  setTimeout(() => { toast.remove(); }, 2500);
}

// ============================================================
// 面板开关
// ============================================================
function togglePanel(state: AppState) {
  if (!panelEl) return;
  const isOpen = panelEl.style.transform === 'translateX(0px)';
  if (isOpen) {
    closePanel();
  } else {
    openPanel(state);
  }
}

function openPanel(state: AppState) {
  if (!panelEl) return;
  panelEl.style.transform = 'translateX(0)';
  refreshSkillList(state);
}

function closePanel() {
  if (!panelEl) return;
  panelEl.style.transform = 'translateX(100%)';
  hideEditor();
}

// ============================================================
// Skill 列表刷新
// ============================================================
async function refreshSkillList(state: AppState) {
  state.skills = await loadSkills();
  const listEl = panelEl?.querySelector('#ds-mini-skill-list');
  if (!listEl) return;

  listEl.innerHTML = state.skills.map(s => skillCardHTML(s)).join('');

  // 绑定每个卡片的按钮
  listEl.querySelectorAll('[data-skill-id]').forEach(card => {
    const id = card.getAttribute('data-skill-id')!;
    card.querySelector('.ds-mini-toggle')?.addEventListener('click', async () => {
      const skill = state.skills.find(s => s.id === id);
      if (skill) {
        await toggleSkill(id, !skill.enabled);
        await refreshSkillList(state);
      }
    });
    card.querySelector('.ds-mini-edit')?.addEventListener('click', () => {
      const skill = state.skills.find(s => s.id === id);
      if (skill) showEditor(state, skill);
    });
    card.querySelector('.ds-mini-delete')?.addEventListener('click', async () => {
      if (confirm(`确定删除 "${state.skills.find(s => s.id === id)?.name}"？`)) {
        await deleteSkill(id);
        await refreshSkillList(state);
      }
    });
  });
}

// ============================================================
// HTML 转义（防止 XSS）
// ============================================================
function esc(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function skillCardHTML(skill: Skill): string {
  const sourceLabel = {
    builtin: '内置',
    github: 'GitHub',
    local: '本地',
    custom: '自定义',
  }[skill.source] || skill.source;

  return `
    <div data-skill-id="${esc(skill.id)}" style="
      border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px;
      background:${skill.enabled ? '#fff' : '#f9fafb'};
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:600;">/${esc(skill.name)}</span>
          <span style="font-size:11px;color:#9ca3af;margin-left:6px;">${esc(sourceLabel)}</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="ds-mini-toggle" style="
            background:none;border:none;cursor:pointer;font-size:16px;
          ">${skill.enabled ? '✅' : '⭕'}</button>
          ${skill.source !== 'builtin' ? `
            <button class="ds-mini-edit" style="
              background:none;border:none;cursor:pointer;font-size:14px;
            ">✏️</button>
            <button class="ds-mini-delete" style="
              background:none;border:none;cursor:pointer;font-size:14px;
            ">🗑️</button>
          ` : ''}
        </div>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">${esc(skill.description)}</div>
    </div>
  `;
}

// ============================================================
// 编辑器（新建 / 编辑）
// ============================================================
function showEditor(state: AppState, skill?: Skill) {
  const editorEl = panelEl?.querySelector('#ds-mini-editor');
  const listEl = panelEl?.querySelector('#ds-mini-skill-list');
  if (!editorEl || !listEl) return;

  const isEdit = !!skill;
  editorEl.style.display = 'flex';
  (listEl as HTMLElement).style.display = 'none';

  editorEl.innerHTML = `
    <div style="font-weight:600;margin-bottom:12px;">
      ${isEdit ? `✏️ 编辑 /${esc(skill!.name)}` : '➕ 新建技能'}
    </div>

    <label style="font-size:12px;color:#6b7280;margin-bottom:4px;">名称 (kebab-case)</label>
    <input id="ds-mini-editor-name" value="${esc(skill?.name || '')}" placeholder="my-skill"
      style="padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px;"
      ${isEdit ? 'disabled' : ''}>

    <label style="font-size:12px;color:#6b7280;margin-bottom:4px;">描述</label>
    <input id="ds-mini-editor-desc" value="${esc(skill?.description || '')}" placeholder="一句话描述"
      style="padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:8px;">

    <label style="font-size:12px;color:#6b7280;margin-bottom:4px;">指令内容 (Markdown)</label>
    <textarea id="ds-mini-editor-instructions" placeholder="系统指令..."
      style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:none;min-height:200px;font-family:monospace;font-size:13px;"
    >${skill?.instructions || ''}</textarea>

    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
      <button id="ds-mini-editor-cancel" style="
        padding:6px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;
      ">取消</button>
      <button id="ds-mini-editor-save" style="
        padding:6px 16px;border:none;border-radius:4px;background:#4f46e5;color:#fff;cursor:pointer;
      ">保存</button>
    </div>
  `;

  editorEl.querySelector('#ds-mini-editor-cancel')?.addEventListener('click', () => hideEditor());
  editorEl.querySelector('#ds-mini-editor-save')?.addEventListener('click', async () => {
    const name = (editorEl.querySelector('#ds-mini-editor-name') as HTMLInputElement).value.trim();
    const desc = (editorEl.querySelector('#ds-mini-editor-desc') as HTMLInputElement).value.trim();
    const instructions = (editorEl.querySelector('#ds-mini-editor-instructions') as HTMLTextAreaElement).value.trim();

    if (!name || !instructions) {
      alert('名称和指令内容不能为空');
      return;
    }

    const newSkill: Skill = {
      id: skill?.id || 'custom-' + Date.now().toString(36),
      name,
      description: desc || name,
      instructions,
      source: skill?.source || 'custom',
      enabled: skill?.enabled ?? true,
      memoryEnabled: skill?.memoryEnabled ?? false,
    };

    await saveSkill(newSkill);
    hideEditor();
    await refreshSkillList(state);
  });
}

function hideEditor() {
  const editorEl = panelEl?.querySelector('#ds-mini-editor');
  const listEl = panelEl?.querySelector('#ds-mini-skill-list');
  if (editorEl) (editorEl as HTMLElement).style.display = 'none';
  if (listEl) (listEl as HTMLElement).style.display = '';
}

// ============================================================
// GitHub 导入弹层
// ============================================================
function showGHDialog() {
  const dialog = panelEl?.querySelector('#ds-mini-gh-dialog');
  if (!dialog) return;

  (dialog as HTMLElement).style.display = 'flex';
  dialog.innerHTML = `
    <div style="
      background:#fff;border-radius:8px;padding:20px;width:300px;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
    ">
      <div style="font-weight:600;margin-bottom:12px;">📦 从 GitHub 导入</div>
      <input id="ds-mini-gh-url" placeholder="https://github.com/user/repo"
        style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:12px;box-sizing:border-box;">
      <div id="ds-mini-gh-content"></div>
      <div id="ds-mini-gh-error" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="ds-mini-gh-cancel" style="
          padding:6px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;
        ">取消</button>
        <button id="ds-mini-gh-import" style="
          padding:6px 16px;border:none;border-radius:4px;background:#4f46e5;color:#fff;cursor:pointer;
        ">导入</button>
      </div>
    </div>
  `;

  dialog.querySelector('#ds-mini-gh-cancel')?.addEventListener('click', () => {
    (dialog as HTMLElement).style.display = 'none';
  });

  dialog.querySelector('#ds-mini-gh-import')?.addEventListener('click', async () => {
    const url = (dialog.querySelector('#ds-mini-gh-url') as HTMLInputElement).value.trim();
    const errorEl = dialog.querySelector('#ds-mini-gh-error') as HTMLElement;
    const contentEl = dialog.querySelector('#ds-mini-gh-content') as HTMLElement;
    if (!url) { errorEl.textContent = '请输入 GitHub URL'; errorEl.style.display = ''; return; }

    errorEl.style.display = 'none';

    try {
      const result = await importFromGitHub(url);

      // 发现多个技能 → 展示列表让用户选择
      if (result.discovered) {
        const { entries, files, user, repo, branch } = result.discovered;
        const listHtml = entries.map((e, i) =>
          `<div data-idx="${i}" data-path="${e}" style="padding:8px 12px;cursor:pointer;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px;display:flex;align-items:center;gap:8px;background:#fff;" onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='#fff'">
            <span>📂</span>
            <span style="font-weight:500;">${esc(e)}</span>
          </div>`
        ).join('');

        contentEl.innerHTML = `
          <div style="font-weight:600;margin-bottom:8px;">从仓库中发现以下技能：</div>
          <div style="max-height:240px;overflow-y:auto;">${listHtml}</div>
          <div style="margin-top:8px;font-size:11px;color:#9ca3af;">点击技能名称直接导入</div>`;

        // 绑定点击事件
        contentEl.querySelectorAll('[data-path]').forEach(el => {
          el.addEventListener('click', async () => {
            const path = el.getAttribute('data-path')!;
            try {
              const subResult = await importFromGitHubPath(user, repo, branch, path);
              if (subResult.skill) {
                await importAndSave(subResult.skill);
                (dialog as HTMLElement).style.display = 'none';
                refreshSkillList({ skills: await loadSkills(), activeSkill: null });
              }
            } catch (err2) {
              errorEl.textContent = err2 instanceof Error ? err2.message : '导入失败';
              errorEl.style.display = '';
            }
          });
        });
        return;
      }

      // 单个技能 → 直接导入
      if (result.skill) {
        await importAndSave(result.skill);
        (dialog as HTMLElement).style.display = 'none';
        refreshSkillList({ skills: await loadSkills(), activeSkill: null });
      }
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : '导入失败';
      errorEl.style.display = '';
    }
  });

  // 自动聚焦
  setTimeout(() => {
    (dialog.querySelector('#ds-mini-gh-url') as HTMLInputElement)?.focus();
  }, 100);
}

// ============================================================
// 本地导入
// ============================================================
async function handleLocalImport(state: AppState) {
  try {
    const skill = await importFromLocal();
    await importAndSave(skill);
    refreshSkillList(state);
  } catch (err) {
    if (err instanceof Error && err.message !== '已取消') {
      alert(`本地导入失败: ${err.message}`);
    }
  }
}
