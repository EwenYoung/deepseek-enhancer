import type { AppState, Skill } from './types';
import { matchSkills, getSkillByName } from './skill-registry';

let dropdownEl: HTMLElement | null = null;
let selectedIndex = 0;
let currentMatches: Skill[] = [];
let boundInput: HTMLElement | null = null;
let ignoreNextInput = false;
let currentSkillId = ''; // 当前激活的 skill ID（用于去重）

// ============================================================
// 向主世界发送 skill 指令
// ============================================================
async function applySkillFromText(text: string) {
  // 解析 /skillname 命令
  if (!text || !text.startsWith('/')) {
    if (currentSkillId) {
      currentSkillId = '';
      window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'CLEAR_SKILL' }, '*');
      console.log('[DS-Mini:UI] Skill cleared (no slash command)');
    }
    return;
  }

  const afterSlash = text.slice(1).split(/\s/)[0]; // 取第一个词作为 skill name
  if (!afterSlash) {
    if (currentSkillId) {
      currentSkillId = '';
      window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'CLEAR_SKILL' }, '*');
    }
    return;
  }

  const skill = await getSkillByName(afterSlash);
  if (!skill || !skill.enabled) {
    if (currentSkillId) {
      currentSkillId = '';
      window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'CLEAR_SKILL' }, '*');
    }
    return;
  }

  // skill 没变就不重复发
  if (currentSkillId === skill.id) return;

  currentSkillId = skill.id;
  window.postMessage({
    source: 'DS_MINI_ISOLATED',
    type: 'SET_SKILL',
    skillName: skill.name,
    skill: skill,
    instructions: skill.instructions,
  }, '*');
  console.log('[DS-Mini:UI] Skill set:', skill.name);
}

// ============================================================
// 初始化
// ============================================================
export function initAutocomplete(_state: AppState) {
  const inputEl = findInputArea();
  if (!inputEl) return;

  if (boundInput && boundInput !== inputEl) {
    boundInput.removeEventListener('input', onInput);
    boundInput = null;
  }
  if (boundInput === inputEl) return;

  inputEl.addEventListener('input', onInput);
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousedown', onDocClick, true);
  boundInput = inputEl;
}

// ============================================================
// 输入处理 — 管理下拉 + skill 注入
// ============================================================
async function onInput(e: Event) {
  if (ignoreNextInput) { ignoreNextInput = false; return; }

  const target = e.target as HTMLElement;
  const text = getInputText(target);
  const hasSlash = !!(text && text.startsWith('/'));

  // --- 下拉逻辑 ---
  if (hasSlash) {
    const afterSlash = text!.slice(1);
    if (!afterSlash.includes(' ')) {
      currentMatches = await matchSkills(afterSlash);
      if (currentMatches.length > 0) {
        selectedIndex = 0;
        showDropdown(target);
      } else {
        if (dropdownEl) dropdownEl.style.display = 'none';
      }
    } else {
      if (dropdownEl) dropdownEl.style.display = 'none';
    }
  } else {
    if (dropdownEl) {
      dropdownEl.style.display = 'none';
      currentMatches = [];
      selectedIndex = 0;
    }
  }

  // --- skill 注入逻辑（每次输入都检测）---
  await applySkillFromText(text);
}

// ============================================================
// 键盘处理
// ============================================================
function onKeyDown(e: KeyboardEvent) {
  if (e.target !== boundInput) return;

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      if (!dropdownEl) break;
      ignoreNextInput = true;
      if (e.key === 'ArrowDown') {
        selectedIndex = Math.min(selectedIndex + 1, currentMatches.length - 1);
      } else {
        selectedIndex = Math.max(selectedIndex - 1, 0);
      }
      updateSelection();
      e.preventDefault();
      e.stopPropagation();
      break;
    case 'Enter':
      if (dropdownEl && currentMatches[selectedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        selectSkill(currentMatches[selectedIndex]);
      }
      break;
    case 'Escape':
      if (dropdownEl) closeDropdown();
      e.stopPropagation();
      break;
  }
}

function onDocClick(e: MouseEvent) {
  if (!dropdownEl) return;
  if (e.target instanceof Node && dropdownEl.contains(e.target)) return;
  if (e.target === boundInput) return;
  closeDropdown();
}

function selectSkill(skill: Skill) {
  const inputEl = findInputArea();
  if (!inputEl) return;
  const newText = getInputText(inputEl).replace(/^\/\S*/, `/${skill.name} `);
  setInputText(inputEl, newText);
  closeDropdown();
  inputEl.focus();
  // skill 注入由 onInput 触发
}

// ============================================================
// 下拉 UI
// ============================================================
function showDropdown(anchorEl: HTMLElement) {
  if (dropdownEl && document.body.contains(dropdownEl)) {
    dropdownEl.style.display = '';
    dropdownEl.style.left = anchorEl.getBoundingClientRect().left + 'px';
    dropdownEl.style.bottom = (window.innerHeight - anchorEl.getBoundingClientRect().top + 8) + 'px';
    updateSelection();
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ds-mini-ac-shadow';
  wrap.style.cssText = `
    position: fixed; z-index: 999999; pointer-events: auto;
    left: ${anchorEl.getBoundingClientRect().left}px;
    bottom: ${window.innerHeight - anchorEl.getBoundingClientRect().top + 8}px;
    min-width: 280px; max-width: 400px; max-height: 300px; overflow-y: auto;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    font-family: -apple-system, sans-serif; font-size: 14px; color: #1f2937;
  `;
  currentMatches.forEach((skill, i) => {
    const item = document.createElement('div');
    item.className = 'ds-mini-ac-shadow-item';
    item.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f3f4f6;';
    if (i === selectedIndex) item.style.background = '#f3f4f6';
    item.innerHTML = `<span style="color:#6b7280;font-weight:600;min-width:20px;">/</span>
      <div style="flex:1;min-width:0;"><div style="font-weight:600;color:#1f2937;">${esc(skill.name)}</div>
      <div style="font-size:12px;color:#9ca3af;">${esc(skill.description)}</div></div>
      <span style="margin-left:auto;font-size:12px;color:#d1d5db;">${skill.source}</span>`;
    item.addEventListener('click', () => selectSkill(skill));
    item.addEventListener('mouseenter', () => { selectedIndex = i; updateSelection(); });
    wrap.appendChild(item);
  });
  dropdownEl = wrap;
  document.body.appendChild(wrap);
}

function updateSelection() {
  if (!dropdownEl) return;
  dropdownEl.querySelectorAll('.ds-mini-ac-shadow-item').forEach((item, i) => {
    (item as HTMLElement).style.background = i === selectedIndex ? '#f3f4f6' : 'transparent';
  });
}

function closeDropdown() {
  if (dropdownEl) dropdownEl.style.display = 'none';
  currentMatches = [];
  selectedIndex = 0;
}

function findInputArea(): HTMLElement | null {
  const ta = document.querySelector('textarea');
  if (ta) return ta;
  const ed = document.querySelector('[contenteditable="true"]');
  return ed instanceof HTMLElement ? ed : null;
}

function getInputText(el: HTMLElement): string {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    ? el.value : el.textContent || '';
}

function setInputText(el: HTMLElement, text: string) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s; return d.innerHTML;
}
