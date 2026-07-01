// ============================================================
// deepseek-enhancer — Skill 管理浮层面板
// ============================================================
// 从页面右侧滑出的管理面板
import type { AppState, Skill } from './types';
import { loadSkills, saveSkill, deleteSkill, toggleSkill } from './skill-registry';
import { importFromLocal, importAndSave } from './skill-importer';
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
function createPanel(state: AppState) {
  // 注入 CSS 变量（浅色/深色主题）
  const panelVars = document.createElement('style');
  panelVars.id = 'ds-panel-vars';
  panelVars.textContent = `
    :root {
      --panel-bg: rgba(255,255,255,0.92);
      --panel-blur: blur(20px);
      --panel-text: #1f2937;
      --panel-text-secondary: #6b7280;
      --panel-border: rgba(0,0,0,0.08);
      --accent: #007AFF;
      --accent-secondary: #5E5CE6;
      --danger: #FF3B30;
      --card-bg: rgba(255,255,255,0.5);
      --card-border: rgba(0,0,0,0.06);
      --toggle-on: #007AFF;
      --toggle-off: rgba(0,0,0,0.2);
      --toggle-knob: #fff;
      --input-bg: rgba(255,255,255,0.7);
      --input-border: rgba(0,0,0,0.12);
      --overlay-bg: rgba(0,0,0,0.3);
    }
    html.ds-dark {
      --panel-bg: rgba(0,0,0,0.88);
      --panel-text: #e0e0e0;
      --panel-text-secondary: #a0a0b0;
      --panel-border: rgba(255,255,255,0.08);
      --accent: #5E5CE6;
      --accent-secondary: #007AFF;
      --danger: #FF453A;
      --card-bg: rgba(255,255,255,0.08);
      --card-border: rgba(255,255,255,0.06);
      --toggle-on: #5E5CE6;
      --toggle-off: rgba(255,255,255,0.15);
      --toggle-knob: #fff;
      --input-bg: rgba(255,255,255,0.1);
      --input-border: rgba(255,255,255,0.12);
      --overlay-bg: rgba(0,0,0,0.5);
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: 0s !important; }
    }
    .ds-panel-body { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .ds-panel-fixed { flex-shrink: 0; }
    .ds-panel-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0 12px 4px; scrollbar-width: none; }
    .ds-panel-scroll::-webkit-scrollbar { display: none; }
    .ds-panel-scroll::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 2px; }
    .ds-settings-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      margin-top: 8px;
    }
    .ds-card-header {
      display: flex; align-items: center; gap: 4px;
      padding: 8px 12px;
      font-size: 11px; font-weight: 600;
      color: var(--panel-text-secondary);
    }
    .ds-card-header .ds-card-icon { display: flex; color: var(--accent); flex-shrink: 0; }
    .ds-card-body { padding: 0 12px 10px; }
    .ds-switch-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0; font-size: 12px;
    }
    .ds-skills-body { padding: 4px 12px 10px; }
    #ds-tools-list::-webkit-scrollbar,
    #ds-mini-skill-list::-webkit-scrollbar { display: none; }
  `;
  document.head.appendChild(panelVars);

  // 面板主体（玻璃风格）
  panelEl = document.createElement('div');
  panelEl.id = 'ds-mini-panel';
  panelEl.style.cssText = `
    position: fixed; right: 12px; top: 12px;
    width: 340px; height: calc(100vh - 24px);
    z-index: 999999;
    background: var(--panel-bg);
    backdrop-filter: var(--panel-blur);
    -webkit-backdrop-filter: var(--panel-blur);
    border: 1px solid var(--panel-border);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    transform: translateX(calc(100% + 20px));
    transition: transform 0.25s ease-out;
    display: flex; flex-direction: column;
    font-family: 'DM Sans', -apple-system, sans-serif;
    font-size: 14px;
    color: var(--panel-text);
    overflow: hidden;
  `;
  panelEl.innerHTML = buildPanelHTML();
  document.body.appendChild(panelEl);

  // 右下角发光触发器
  const trigger = document.createElement('div');
  trigger.id = 'ds-mini-trigger';
  trigger.innerHTML = `
    <span id="ds-mini-trigger-icon" style="font-size:14px;">✦</span>
    <span id="ds-mini-trigger-label" style="
      font-size:12px;font-weight:500;white-space:nowrap;
      max-width:0;overflow:hidden;transition:max-width 0.2s, margin 0.2s;
    ">DeepSeek Enhancer</span>
  `;
  trigger.style.cssText = `
    position: fixed; bottom: 16px; right: 16px;
    z-index: 999998;
    display: flex; align-items: center; gap: 6px;
    background: var(--accent, #007AFF);
    color: #fff;
    border: none; border-radius: 20px;
    padding: 8px 10px;
    cursor: pointer;
    box-shadow: 0 0 12px var(--accent, #007AFF);
    transition: box-shadow 0.15s, padding 0.2s;
    font-family: 'DM Sans', -apple-system, sans-serif;
  `;
  trigger.addEventListener('mouseenter', () => {
    const label = document.getElementById('ds-mini-trigger-label');
    if (label) { label.style.maxWidth = '200px'; label.style.marginLeft = '4px'; }
    trigger.style.padding = '8px 14px';
  });
  trigger.addEventListener('mouseleave', () => {
    const label = document.getElementById('ds-mini-trigger-label');
    if (label) { label.style.maxWidth = '0'; label.style.marginLeft = '0'; }
    trigger.style.padding = '8px 10px';
  });
  trigger.addEventListener('click', () => togglePanel(state));
  document.body.appendChild(trigger);

  // 初始检测深色模式
  const initialDark = document.body.classList.contains('dark');
  if (initialDark) {
    panelEl.classList.add('dark');
    document.documentElement.classList.add('ds-dark');
    trigger.style.setProperty('--accent', '#5E5CE6');
  }

  // 监听深色模式切换
  const darkObserver = new MutationObserver(() => {
    const isDark = document.body.classList.contains('dark');
    panelEl?.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('ds-dark', isDark);
    const accent = isDark ? '#5E5CE6' : '#007AFF';
    trigger.style.setProperty('--accent', accent);
    // 切换透明度值
    chrome.storage.local.get([isDark ? 'ds_panel_opacity_dark' : 'ds_panel_opacity_light']).then(r => {
      const val = r[isDark ? 'ds_panel_opacity_dark' : 'ds_panel_opacity_light'];
      const slider = document.getElementById('ds-enh-opacity') as HTMLInputElement | null;
      const label = document.getElementById('ds-enh-opacity-val');
      if (slider) slider.value = val ? String(val) : '100';
      if (label) label.textContent = val ? val + '%' : '100%';
      applyOpacity(val || 100);
    });
  });
  darkObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // 事件绑定
  bindPanelEvents(state);
}

// ============================================================
// 面板 HTML（固定区 + 滚动区）
// ============================================================
function buildPanelHTML(): string {
  const boltSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  const paletteSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-10-10-10Z"/></svg>';
  const keySVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3Z"/></svg>';
  const gridSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';

  function toolRow(name: string, label: string, svg: string) {
    return '<div class="ds-tool-row" data-tool="' + name + '" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:var(--card-bg);">' + svg + '<span style="font-size:12px;font-weight:500;color:var(--panel-text);flex:1;">' + label + '</span><span class="ds-tool-toggle" data-tool="' + name + '" style="position:relative;display:inline-block;width:28px;height:16px;cursor:pointer;flex-shrink:0;background:var(--toggle-on);border-radius:16px;transition:background 0.2s;"><span style="position:absolute;top:2px;right:2px;width:12px;height:12px;background:var(--toggle-knob);border-radius:50%;transition:right 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.15);"></span></span></div>';
  }
  function enhToggle(id: string, label: string) {
    return '<div class="ds-switch-row"><span>' + label + '</span><span class="ds-enh-toggle" data-id="' + id + '" style="position:relative;display:inline-block;width:36px;height:20px;cursor:pointer;flex-shrink:0;background:var(--toggle-off);border-radius:20px;transition:background 0.2s;"><span class="ds-enh-knob" style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:var(--toggle-knob);border-radius:50%;transition:left 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.15);"></span></span></div>';
  }

  const s = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
  const g = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  const n = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>';
  const gh = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>';
  const d = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

  return `
    <!-- 标题栏 -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--panel-border);flex-shrink:0;">
      <span style="font-weight:700;font-size:15px;color:var(--accent);letter-spacing:0.3px;">✦ DeepSeek Enhancer</span>
      <button id="ds-mini-panel-close" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--panel-text-secondary);padding:2px 6px;border-radius:6px;transition:background 0.15s;">✕</button>
    </div>

    <div class="ds-panel-body">
      <!-- ========== FIXED AREA ========== -->
      <div class="ds-panel-fixed">
        <!-- Agent -->
        <div style="padding:12px 16px;border-bottom:1px solid var(--panel-border);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                <span style="font-size:13px;font-weight:600;color:var(--panel-text);">Agent 模式</span>
              </div>
              <div style="font-size:11px;color:var(--panel-text-secondary);margin-top:2px;">注入工具定义 + 自动循环</div>
            </div>
            <label id="ds-mini-agent-toggle" style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">
              <input type="checkbox" id="ds-mini-agent-checkbox" style="opacity:0;width:0;height:0;">
              <span id="ds-mini-agent-slider" style="position:absolute;inset:0;background:var(--toggle-off);border-radius:24px;transition:background 0.2s;"></span>
              <span style="position:absolute;top:2px;left:2px;width:20px;height:20px;background:var(--toggle-knob);border-radius:50%;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);" id="ds-mini-agent-knob"></span>
            </label>
          </div>
        </div>

        <!-- Tools 内部滚动 -->
        <div style="padding:8px 16px;border-bottom:1px solid var(--panel-border);">
          <div style="font-size:12px;font-weight:600;color:var(--panel-text-secondary);margin-bottom:6px;">Tools</div>
          <div id="ds-tools-list" style="max-height:108px;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:4px;">
            ${toolRow('web_search','搜索','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>')}
            ${toolRow('web_fetch','抓取','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>')}
            ${toolRow('news_hub','新闻','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>')}
            ${toolRow('github_trending','GitHub 趋势','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>')}
            ${toolRow('doc_generate','生成文档','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>')}
          </div>
        </div>

        <!-- Skills -->
        <div style="padding:8px 16px;border-bottom:1px solid var(--panel-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:600;color:var(--panel-text-secondary);">Skills</span>
            <div style="display:flex;gap:4px;">
              <button id="ds-mini-import-local" title="本地导入" style="padding:2px 6px;font-size:10px;border:1px solid var(--panel-border);border-radius:5px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;display:flex;align-items:center;gap:2px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>导入
              </button>
              <button id="ds-mini-add-skill" title="新建技能" style="padding:2px 6px;font-size:10px;border:none;border-radius:5px;background:var(--accent);color:#fff;cursor:pointer;">+ 新建</button>
            </div>
          </div>
          <div id="ds-mini-skill-list" style="max-height:200px;overflow-y:auto;scrollbar-width:none;margin-top:4px;"></div>
        </div>

        <!-- 导出 -->
        <div style="padding:8px 16px;border-bottom:1px solid var(--panel-border);">
          <div style="font-size:11px;font-weight:600;color:var(--panel-text-secondary);margin-bottom:4px;">导出会话</div>
          <div style="display:flex;gap:6px;">
            <button id="ds-mini-export-md" style="flex:1;padding:5px 10px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:11px;font-weight:500;transition:border-color 0.15s,color 0.15s;">Markdown</button>
            <button id="ds-mini-export-html" style="flex:1;padding:5px 10px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:11px;font-weight:500;transition:border-color 0.15s,color 0.15s;">HTML</button>
          </div>
        </div>
      </div>

      <!-- ========== SCROLLABLE AREA ========== -->
      <div class="ds-panel-scroll">
        <!-- 增强功能 -->
        <div class="ds-settings-card">
          <div class="ds-card-header"><span class="ds-card-icon">${boltSVG}</span>增强功能</div>
          <div class="ds-card-body">
            ${enhToggle('ds-enh-wide','宽屏模式')}
            <div class="ds-switch-row"><span>背景主题</span><div style="display:flex;align-items:center;gap:4px;"><button id="ds-enh-theme-prev" style="padding:1px 5px;border:1px solid var(--panel-border);border-radius:4px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:11px;line-height:1;transition:background 0.15s;">‹</button><span id="ds-enh-theme-name" style="font-size:11px;color:var(--panel-text);min-width:40px;text-align:center;">默认</span><button id="ds-enh-theme-next" style="padding:1px 5px;border:1px solid var(--panel-border);border-radius:4px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:11px;line-height:1;transition:background 0.15s;">›</button></div></div>
            ${enhToggle('ds-enh-scrollbar','隐藏滚动条')}
            ${enhToggle('ds-enh-autohide','隐藏输入框')}
            ${enhToggle('ds-enh-voice','语音输入')}
            ${enhToggle('ds-enh-tokenspeed','Token 速度')}
          </div>
        </div>

        <!-- 面板设置 -->
        <div class="ds-settings-card">
          <div class="ds-card-header"><span class="ds-card-icon">${paletteSVG}</span>面板设置</div>
          <div class="ds-card-body">
            <div class="ds-switch-row"><span>面板透明度</span><div style="display:flex;align-items:center;gap:6px;"><input id="ds-enh-opacity" type="range" min="10" max="100" value="100" step="5" style="width:100px;height:4px;cursor:pointer;accent-color:var(--accent);"><span id="ds-enh-opacity-val" style="font-size:11px;min-width:30px;text-align:right;color:var(--panel-text-secondary);">100%</span></div></div>
          </div>
        </div>

        <!-- API 设置 -->
        <div class="ds-settings-card">
          <div class="ds-card-header"><span class="ds-card-icon">${keySVG}</span>API 设置</div>
          <div class="ds-card-body">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:11px;font-weight:500;color:var(--panel-text);">Tavily API Key</span>
              <span id="ds-mini-apikey-status" style="font-size:10px;"></span>
            </div>
            <div style="display:flex;gap:4px;">
              <input id="ds-mini-apikey" type="password" placeholder="tvly-xxxxxxxx" style="flex:1;padding:5px 8px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);color:var(--panel-text);font-size:11px;">
              <button id="ds-mini-apikey-save" style="padding:5px 10px;border:none;border-radius:6px;background:var(--accent);color:#fff;cursor:pointer;font-size:10px;white-space:nowrap;font-weight:500;">保存</button>
              <button id="ds-mini-apikey-test" style="padding:5px 10px;border:1px solid var(--panel-border);border-radius:6px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:10px;">测试</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑/新建弹窗容器 -->
    <div id="ds-mini-modal" style="display:none;position:fixed;inset:0;z-index:999998;"></div>
  `;
}
// ============================================================
function bindPanelEvents(state: AppState) {
  if (!panelEl) return;

  panelEl.querySelector('#ds-mini-panel-close')?.addEventListener('click', () => closePanel());
  panelEl.querySelector('#ds-mini-add-skill')?.addEventListener('click', () => showModalEditor(state));
  panelEl.querySelector('#ds-mini-import-local')?.addEventListener('click', () => handleLocalImport(state));

  // 导出
  panelEl.querySelector('#ds-mini-export-md')?.addEventListener('click', () => exportChat('markdown'));
  panelEl.querySelector('#ds-mini-export-html')?.addEventListener('click', () => exportChat('html'));
  // 导出按钮 hover（边框高亮 + 背景微变）
  panelEl.querySelectorAll('#ds-mini-export-md, #ds-mini-export-html').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      (btn as HTMLElement).style.borderColor = 'var(--accent)';
      (btn as HTMLElement).style.color = 'var(--accent)';
    });
    btn.addEventListener('mouseleave', () => {
      (btn as HTMLElement).style.borderColor = 'var(--panel-border)';
      (btn as HTMLElement).style.color = 'var(--panel-text)';
    });
  });

  // API Key
  loadAPIKey();
  panelEl.querySelector('#ds-mini-apikey-save')?.addEventListener('click', saveAPIKey);
  panelEl.querySelector('#ds-mini-apikey-test')?.addEventListener('click', testTavilyConnection);

  // Agent 模式
  loadAgentMode();
  panelEl.querySelector('#ds-mini-agent-toggle')?.addEventListener('click', toggleAgentMode);

  // 增强器功能
  loadEnhancerPanel();

  // 可折叠卡片
  panelEl.querySelectorAll('[data-card-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const cardId = el.getAttribute('data-card-toggle');
      const card = panelEl?.querySelector('[data-card="' + cardId + '"]');
      if (!card) return;
      const body = card.querySelector('.ds-card-body');
      const arrow = el.querySelector('.ds-card-arrow');
      if (body) body.classList.toggle('ds-collapsed');
      if (arrow) arrow.classList.toggle('open');
    });
  });

  // 增强功能 toggle
  panelEl.querySelectorAll('.ds-enh-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const funcMap: Record<string, () => void> = {
        'ds-enh-wide': async () => {
          enhState.wideScreen = !enhState.wideScreen;
          await toggleWideScreen(enhState.wideScreen);
          updateEnhButton('ds-enh-wide', enhState.wideScreen);
          showToast(enhState.wideScreen ? '宽屏已开启' : '宽屏已关闭');
        },
        'ds-enh-scrollbar': async () => {
          enhState.hideScrollbar = !enhState.hideScrollbar;
          await toggleScrollbar(enhState.hideScrollbar);
          updateEnhButton('ds-enh-scrollbar', enhState.hideScrollbar);
          showToast(enhState.hideScrollbar ? '滚动条已隐藏' : '滚动条已显示');
        },
        'ds-enh-autohide': async () => {
          enhState.autoHideInput = !enhState.autoHideInput;
          await toggleAutoHideInput(enhState.autoHideInput);
          updateEnhButton('ds-enh-autohide', enhState.autoHideInput);
          showToast(enhState.autoHideInput ? '输入框自动隐藏已开启' : '输入框自动隐藏已关闭');
        },
        'ds-enh-voice': async () => {
          enhState.voiceInput = !enhState.voiceInput;
          await toggleVoiceInput(enhState.voiceInput);
          updateEnhButton('ds-enh-voice', enhState.voiceInput);
          showToast(enhState.voiceInput ? '语音输入已开启（Ctrl+M）' : '语音输入已关闭');
        },
        'ds-enh-tokenspeed': async () => {
          enhState.tokenSpeed = !enhState.tokenSpeed;
          const cfg = await getConfig();
          cfg.tokenSpeed = enhState.tokenSpeed;
          await chrome.storage.local.set({ 'ds_mini_enhancer': cfg });
          updateEnhButton('ds-enh-tokenspeed', enhState.tokenSpeed);
          window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'DS_MINI_TOKEN_SPEED_TOGGLE', enabled: enhState.tokenSpeed }, '*');
          showToast(enhState.tokenSpeed ? 'Token 速度已开启' : 'Token 速度已关闭');
        },
      };
      funcMap[id]?.();
    });
  });

  // 透明度滑杆
  const opacitySlider = panelEl.querySelector('#ds-enh-opacity') as HTMLInputElement | null;
  const opacityVal = panelEl.querySelector('#ds-enh-opacity-val');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value);
      if (opacityVal) opacityVal.textContent = val + '%';
      applyOpacity(val);
      // 保存
      const isDark = document.body.classList.contains('dark');
      chrome.storage.local.set({ [isDark ? 'ds_panel_opacity_dark' : 'ds_panel_opacity_light']: val });
    });
  }

  // Tools 开关
  const TOOLS_KEY = 'ds_mini_tools_state';
  function updateToolToggle(el: Element, on: boolean) {
    el.classList.toggle('ds-tool-on', on);
    (el as HTMLElement).style.background = on ? 'var(--toggle-on)' : 'var(--toggle-off)';
    const knob = el.querySelector('span') as HTMLElement | null;
    if (knob) knob.style.right = on ? '2px' : '14px';
    const row = el.closest('.ds-tool-row') as HTMLElement | null;
    if (row) row.style.opacity = on ? '1' : '0.4';
  }
  function postToolsState() {
    chrome.storage.local.get(TOOLS_KEY).then(r => {
      const tools = r[TOOLS_KEY] || {};
      // ponytail: 直接写 window 变量 + localStorage，给 inject-context / MAIN world 读取
      (window as any).__DS_TOOLS_STATE__ = tools;
      try { localStorage.setItem('ds_mini_tools_state', JSON.stringify(tools)); } catch {}
      window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'SET_TOOLS_STATE', tools }, '*');
      setTimeout(() => {
        window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'SET_TOOLS_STATE', tools }, '*');
      }, 500);
    });
  }
  // 加载初始状态
  chrome.storage.local.get(TOOLS_KEY).then(r => {
    const tools = r[TOOLS_KEY] || {};
    (window as any).__DS_TOOLS_STATE__ = tools;
    try { localStorage.setItem('ds_mini_tools_state', JSON.stringify(tools)); } catch {}
    panelEl?.querySelectorAll('.ds-tool-toggle').forEach(el => {
      const tool = el.getAttribute('data-tool') || '';
      updateToolToggle(el, tools[tool] !== false);
    });
  });
  // 绑定点击
  panelEl?.querySelectorAll('.ds-tool-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const tool = el.getAttribute('data-tool') || '';
      const isOn = el.classList.contains('ds-tool-on');
      const newOn = !isOn;
      updateToolToggle(el, newOn);
      // 立即更新 window 变量，不等 storage 回调
      const storedTools = (window as any).__DS_TOOLS_STATE__ || {};
      storedTools[tool] = newOn;
      (window as any).__DS_TOOLS_STATE__ = storedTools;
      // 同步写入 localStorage（MAIN 世界可直接读取）
      try { localStorage.setItem('ds_mini_tools_state', JSON.stringify(storedTools)); } catch {}
      // 异步保存 + postMessage
      chrome.storage.local.get(TOOLS_KEY).then(r => {
        const tools = r[TOOLS_KEY] || {};
        tools[tool] = newOn;
        chrome.storage.local.set({ [TOOLS_KEY]: tools });
        postToolsState();
      });
    });
  });

  // 主题切换
  panelEl.querySelector('#ds-enh-theme-prev')?.addEventListener('click', () => {
    enhState.themeIdx = (enhState.themeIdx - 1 + getThemeCount()) % getThemeCount();
    applyTheme(enhState.themeIdx);
    updateThemeName();
  });
  panelEl.querySelector('#ds-enh-theme-next')?.addEventListener('click', () => {
    enhState.themeIdx = (enhState.themeIdx + 1) % getThemeCount();
    applyTheme(enhState.themeIdx);
    updateThemeName();
  });

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
  statusEl.textContent = hasKey ? '已配置' : '未配置';
  (statusEl as HTMLElement).style.color = hasKey ? 'var(--accent)' : 'var(--panel-text-secondary)';
}

function saveAPIKey() {
  const input = panelEl?.querySelector('#ds-mini-apikey') as HTMLInputElement | null;
  if (!input) return;

  const key = input.value.trim();
  chrome.storage.local.set({ ds_mini_tavily_key: key }).then(() => {
    chrome.runtime.sendMessage({ type: 'SET_API_KEY', key });
    updateAPIKeyStatus(!!key);
    showToast(key ? 'API Key 已保存' : 'API Key 已清除');
  }).catch(() => {
    showToast('保存失败');
  });
}

async function testTavilyConnection() {
  const testBtn = panelEl?.querySelector('#ds-mini-apikey-test') as HTMLButtonElement | null;
  if (!testBtn) return;

  testBtn.disabled = true;
  testBtn.textContent = '测试中...';

  try {
    chrome.runtime.sendMessage({ type: 'TEST_TAVILY' }, (resp) => {
      testBtn.disabled = false;
      testBtn.textContent = '测试';
      if (resp?.ok) {
        showToast('Tavily 连接正常');
      } else {
        showToast(`Tavily 测试失败: ${resp?.message || '未知错误'}`);
      }
    });
  } catch (err) {
    testBtn.disabled = false;
    testBtn.textContent = '测试';
    showToast(`测试请求失败: ${err}`);
  }
}

// ============================================================
// Agent 模式管理
// ============================================================
const AGENT_MODE_KEY = 'ds_mini_agent_mode';

function updateAgentSlider(enabled: boolean) {
  const slider = panelEl?.querySelector('#ds-mini-agent-slider') as HTMLElement | null;
  const knob = panelEl?.querySelector('#ds-mini-agent-knob') as HTMLElement | null;
  if (slider) slider.style.background = enabled ? 'var(--toggle-on)' : 'var(--toggle-off)';
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
  showToast(enabled ? 'Agent 模式已开启' : 'Agent 模式已关闭');
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
let enhState: any = { wideScreen: false, themeIdx: 0, hideScrollbar: false, autoHideInput: false, voiceInput: false, tokenSpeed: false };

async function loadEnhancerPanel() {
  enhState = await getConfig();
  updateEnhButton('ds-enh-wide', enhState.wideScreen);
  updateEnhButton('ds-enh-scrollbar', enhState.hideScrollbar);
  updateEnhButton('ds-enh-autohide', enhState.autoHideInput);
  updateEnhButton('ds-enh-voice', enhState.voiceInput);
  updateEnhButton('ds-enh-tokenspeed', enhState.tokenSpeed);
  updateThemeName();
  // 加载透明度
  const isDark = document.body.classList.contains('dark');
  chrome.storage.local.get([isDark ? 'ds_panel_opacity_dark' : 'ds_panel_opacity_light']).then(r => {
    const val = r[isDark ? 'ds_panel_opacity_dark' : 'ds_panel_opacity_light'];
    if (val) {
      const slider = panelEl?.querySelector('#ds-enh-opacity') as HTMLInputElement | null;
      const label = panelEl?.querySelector('#ds-enh-opacity-val');
      if (slider) { slider.value = String(val); }
      if (label) label.textContent = val + '%';
      applyOpacity(val);
    }
  });
}

function applyOpacity(pct: number) {
  const lightBase = '255,255,255';
  const darkBase = '0,0,0';
  const isDark = document.body.classList.contains('dark');
  const rgb = isDark ? darkBase : lightBase;
  const alpha = (pct / 100).toFixed(2);
  document.documentElement.style.setProperty('--panel-bg', `rgba(${rgb},${alpha})`);
  // 也更新弹窗遮罩透明度
  const modalBg = panelEl?.querySelector('#ds-mini-modal-overlay');
  if (modalBg) {
    (modalBg as HTMLElement).style.setProperty('--overlay-bg', `rgba(0,0,0,${(pct / 200 + 0.25).toFixed(2)})`);
  }
}

function updateEnhButton(id: string, on: boolean) {
  const toggle = panelEl?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
  if (!toggle) return;
  toggle.style.background = on ? 'var(--toggle-on)' : 'var(--toggle-off)';
  const knob = toggle.querySelector('.ds-enh-knob') as HTMLElement | null;
  if (knob) knob.style.left = on ? '18px' : '2px';
}

function updateThemeName() {
  const names = ['默认', 'Claude', 'Catppuccin', 'Dracula', 'OneHalf'];
  const el = panelEl?.querySelector('#ds-enh-theme-name');
  if (el) el.textContent = names[enhState.themeIdx % names.length];
}

function showToast(msg: string) {
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
  panelEl.style.transform = 'translateX(calc(100% + 20px))';
  // 关闭时移除任何弹窗
  document.getElementById('ds-mini-modal-overlay')?.remove();
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
      if (skill) showModalEditor(state, skill);
    });
    card.querySelector('.ds-mini-delete')?.addEventListener('click', async () => {
      const skill = state.skills.find(s => s.id === id);
      if (skill) showDeleteConfirm(state, id, skill.name);
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
      border:1px solid var(--card-border);border-radius:10px;padding:10px;margin-bottom:6px;
      background:var(--card-bg);
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:600;font-size:13px;">/${esc(skill.name)}</span>
          <span style="font-size:11px;color:var(--panel-text-secondary);margin-left:6px;">${esc(sourceLabel)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <label style="position:relative;display:inline-block;width:36px;height:20px;cursor:pointer;flex-shrink:0;">
            <input type="checkbox" style="opacity:0;width:0;height:0;" ${skill.enabled ? 'checked' : ''}>
            <span class="ds-mini-toggle" style="position:absolute;inset:0;background:${skill.enabled ? 'var(--toggle-on)' : 'var(--toggle-off)'};border-radius:20px;transition:background 0.2s;cursor:pointer;">
              <span style="position:absolute;top:2px;left:${skill.enabled ? '18px' : '2px'};width:16px;height:16px;background:var(--toggle-knob);border-radius:50%;transition:left 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.15);"></span>
            </span>
          </label>
          ${skill.source !== 'builtin' ? `
            <button class="ds-mini-edit" style="background:none;border:none;cursor:pointer;color:var(--panel-text-secondary);padding:2px 4px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
            <button class="ds-mini-delete" style="background:none;border:none;cursor:pointer;color:var(--panel-text-secondary);padding:2px 4px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          ` : ''}
        </div>
      </div>
      <div style="font-size:12px;color:var(--panel-text-secondary);margin-top:4px;">${esc(skill.description)}</div>
    </div>
  `;
}

// ============================================================
// Modal 弹窗系统
// ============================================================
function showModalEditor(state: AppState, skill?: Skill) {
  const existing = document.getElementById('ds-mini-modal-overlay');
  if (existing) existing.remove();
  if (document.getElementById('ds-mini-modal-editor')) return;

  const isEdit = !!skill;

  // 遮罩层
  const overlay = document.createElement('div');
  overlay.id = 'ds-mini-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:999997;
    background:var(--overlay-bg, rgba(0,0,0,0.3));
    backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;
    transition:opacity 0.2s;
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // 弹窗
  const modal = document.createElement('div');
  modal.id = 'ds-mini-modal-editor';
  modal.style.cssText = `
    width:680px; max-width:90vw; max-height:85vh;
    background:var(--panel-bg, #fff);
    backdrop-filter:var(--panel-blur, blur(20px));
    -webkit-backdrop-filter:var(--panel-blur, blur(20px));
    border:1px solid var(--panel-border, rgba(0,0,0,0.08));
    border-radius:16px;
    box-shadow:0 16px 48px rgba(0,0,0,0.2);
    display:flex; flex-direction:column;
    color:var(--panel-text, #1f2937);
    font-family:'DM Sans', -apple-system, sans-serif;
    overflow:hidden;
  `;

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--panel-border);flex-shrink:0;">
      <span style="font-weight:600;font-size:15px;">${isEdit ? `编辑 /${esc(skill!.name)}` : '新建 Skill'}</span>
      <button id="ds-modal-close" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--panel-text-secondary);padding:2px 6px;border-radius:6px;">✕</button>
    </div>
    <div style="padding:16px 20px;flex:1;overflow-y:auto;">
      <label style="font-size:12px;font-weight:500;color:var(--panel-text-secondary);display:block;margin-bottom:4px;">名称（如 my-skill）</label>
      <input id="ds-modal-name" value="${esc(skill?.name || '')}" placeholder="my-skill"
        style="width:100%;padding:8px 10px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--panel-text);font-size:13px;margin-bottom:12px;box-sizing:border-box;"
        ${isEdit ? 'disabled' : ''}>

      <label style="font-size:12px;font-weight:500;color:var(--panel-text-secondary);display:block;margin-bottom:4px;">描述</label>
      <input id="ds-modal-desc" value="${esc(skill?.description || '')}" placeholder="一句话描述"
        style="width:100%;padding:8px 10px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--panel-text);font-size:13px;margin-bottom:12px;box-sizing:border-box;">

      <label style="font-size:12px;font-weight:500;color:var(--panel-text-secondary);display:block;margin-bottom:4px;">指令内容 (Markdown)</label>
      <textarea id="ds-modal-instructions" placeholder="系统指令..."
        style="width:100%;min-height:280px;padding:10px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--panel-text);font-size:13px;font-family:monospace;resize:none;box-sizing:border-box;"
      >${skill?.instructions || ''}</textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--panel-border);flex-shrink:0;">
      <button id="ds-modal-cancel" style="padding:7px 18px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:12px;">取消</button>
      <button id="ds-modal-save" style="padding:7px 18px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font-size:12px;font-weight:500;">保存</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 拖拽移动（标题栏）
  let isDragging = false, dragOffX = 0, dragOffY = 0;
  const titleBar = modal.firstElementChild as HTMLElement | null;
  if (titleBar) {
    titleBar.style.cursor = 'grab';
    titleBar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      isDragging = true;
      const rect = modal.getBoundingClientRect();
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      modal.style.position = 'fixed';
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      modal.style.margin = '0';
      modal.style.transform = 'none';
      e.preventDefault();
    });
  }
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    modal.style.left = Math.max(0, Math.min(e.clientX - dragOffX, window.innerWidth - 480)) + 'px';
    modal.style.top = Math.max(0, Math.min(e.clientY - dragOffY, window.innerHeight - 360)) + 'px';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  // 拉伸（右下角）
  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = `position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:10;background:linear-gradient(135deg,transparent 50%,var(--panel-text-secondary) 50%);border-radius:0 0 16px;`;
  modal.style.position = 'relative';
  modal.appendChild(resizeHandle);
  let isResizing = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    const startW = modal.offsetWidth, startH = modal.offsetHeight;
    const startX = e.clientX, startY = e.clientY;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!isResizing) return;
      modal.style.width = Math.max(480, Math.min(startW + ev.clientX - startX, window.innerWidth * 0.9)) + 'px';
      modal.style.height = Math.max(360, Math.min(startH + ev.clientY - startY, window.innerHeight * 0.9)) + 'px';
    };
    const onUp = () => { isResizing = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // 事件绑定（原 code 继续）
  modal.querySelector('#ds-modal-close')?.addEventListener('click', () => overlay.remove());
  modal.querySelector('#ds-modal-cancel')?.addEventListener('click', () => overlay.remove());

  const saveBtn = modal.querySelector('#ds-modal-save') as HTMLElement;
  saveBtn?.addEventListener('click', async () => {
    const name = (modal.querySelector('#ds-modal-name') as HTMLInputElement).value.trim();
    const desc = (modal.querySelector('#ds-modal-desc') as HTMLInputElement).value.trim();
    const instructions = (modal.querySelector('#ds-modal-instructions') as HTMLTextAreaElement).value.trim();

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
    overlay.remove();
    await refreshSkillList(state);
  });

  // Ctrl+Enter 保存
  modal.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveBtn?.click();
  });

  // 聚焦到名称或内容
  setTimeout(() => {
    const nameInput = modal.querySelector('#ds-modal-name') as HTMLInputElement;
    if (nameInput && !skill) nameInput.focus();
    else (modal.querySelector('#ds-modal-instructions') as HTMLTextAreaElement)?.focus();
  }, 100);
}

function showDeleteConfirm(state: AppState, skillId: string, skillName: string) {
  const existing = document.getElementById('ds-mini-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ds-mini-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:999997;
    background:var(--overlay-bg, rgba(0,0,0,0.3));
    backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const modal = document.createElement('div');
  modal.style.cssText = `
    width:360px; padding:20px;
    background:var(--panel-bg); backdrop-filter:var(--panel-blur);
    border:1px solid var(--panel-border); border-radius:14px;
    box-shadow:0 8px 32px rgba(0,0,0,0.15);
    color:var(--panel-text);
    font-family:'DM Sans', -apple-system, sans-serif;
  `;
  modal.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:8px;">确认删除</div>
    <div style="font-size:13px;color:var(--panel-text-secondary);margin-bottom:16px;">确定删除 "${esc(skillName)}"？此操作不可撤销。</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="ds-del-cancel" style="padding:7px 16px;border:1px solid var(--panel-border);border-radius:8px;background:var(--card-bg);color:var(--panel-text);cursor:pointer;font-size:12px;">取消</button>
      <button id="ds-del-confirm" style="padding:7px 16px;border:none;border-radius:8px;background:var(--danger);color:#fff;cursor:pointer;font-size:12px;font-weight:500;">删除</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('#ds-del-cancel')?.addEventListener('click', () => overlay.remove());
  modal.querySelector('#ds-del-confirm')?.addEventListener('click', async () => {
    await deleteSkill(skillId);
    overlay.remove();
    await refreshSkillList(state);
  });
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
