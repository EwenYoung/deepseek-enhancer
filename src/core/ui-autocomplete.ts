import type { AppState, Skill } from './types';
import { matchSkills, getSkillByName } from './skill-registry';

let dropdownEl: HTMLElement | null = null;
let selectedIndex = 0;
let currentMatches: Skill[] = [];
let boundInput: HTMLElement | null = null;
let ignoreInputUntil = 0;
let currentSkillId = '';

async function applySkillFromText(text: string) {
  if (!text || !text.startsWith('/')) {
    if (currentSkillId) {
      currentSkillId = '';
      window.postMessage({ source: 'DS_MINI_ISOLATED', type: 'CLEAR_SKILL' }, '*');
    }
    return;
  }
  const afterSlash = text.slice(1).split(/\s/)[0];
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
  if (currentSkillId === skill.id) return;
  currentSkillId = skill.id;
  window.postMessage(
    {
      source: 'DS_MINI_ISOLATED',
      type: 'SET_SKILL',
      skillName: skill.name,
      skill,
      instructions: skill.instructions,
    },
    '*',
  );
}

export function initAutocomplete(_state: AppState) {
  const inputEl = findInputArea();
  if (!inputEl) return;
  if (boundInput && boundInput !== inputEl) {
    boundInput.removeEventListener('input', onInput);
    boundInput = null;
  }
  if (boundInput === inputEl) return;
  inputEl.addEventListener('input', onInput);
  if (!window.__ds_ac_keydown_bound) {
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onDocClick, true);
    window.__ds_ac_keydown_bound = true;
  }
  boundInput = inputEl;
}

async function onInput(e: Event) {
  if (Date.now() < ignoreInputUntil) return;
  const target = e.target as HTMLElement;
  const text = getInputText(target);
  const hasSlash = !!(text && text.startsWith('/'));

  if (hasSlash) {
    const agentMode = await chrome.storage.local.get('ds_mini_agent_mode');
    if (!agentMode.ds_mini_agent_mode) {
      showToast('请先开启 Agent 模式');
      return;
    }
    const afterSlash = text!.slice(1);
    if (!afterSlash.includes(' ')) {
      currentMatches = await matchSkills(afterSlash);
      if (currentMatches.length > 0) {
        selectedIndex = Math.min(selectedIndex, currentMatches.length - 1);
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
  await applySkillFromText(text);
}

function onKeyDown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      if (!dropdownEl) break;
      ignoreInputUntil = Date.now() + 200;
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
}

function showDropdown(anchorEl: HTMLElement) {
  if (dropdownEl && document.body.contains(dropdownEl)) {
    dropdownEl.innerHTML = '';
    dropdownEl.style.cssText = cssDropdownText(anchorEl) + 'display: block;';
    buildDropdownItems();
    updateSelection();
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ds-mini-ac-shadow';
  wrap.style.cssText = cssDropdownText(anchorEl);
  dropdownEl = wrap;
  buildDropdownItems();
  document.body.appendChild(wrap);
}

function cssDropdownText(anchorEl: HTMLElement): string {
  const r = anchorEl.getBoundingClientRect();
  return `
    position: fixed; z-index: 999999; pointer-events: auto;
    left: ${r.left}px;
    bottom: ${window.innerHeight - r.top + 8}px;
    min-width: 280px; max-width: 400px; max-height: 300px; overflow-y: auto;
    background: var(--panel-bg, rgba(255,255,255,0.92));
    backdrop-filter: var(--panel-blur, blur(20px));
    -webkit-backdrop-filter: var(--panel-blur, blur(20px));
    border: 1px solid var(--panel-border, rgba(0,0,0,0.08));
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    font-family: 'DM Sans', -apple-system, sans-serif;
    font-size: 14px;
    color: var(--panel-text, #1f2937);
    padding: 6px;
  `;
}

function buildDropdownItems() {
  const dd = dropdownEl;
  if (!dd) return;
  currentMatches.forEach((skill, i) => {
    const item = document.createElement('div');
    item.className = 'ds-mini-ac-shadow-item';
    item.style.cssText = `
      padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;
      border-radius: 8px;
      background: ${i === selectedIndex ? 'var(--accent-bg, rgba(24,24,27,0.08))' : 'transparent'};
    `;
    item.innerHTML = `
      <span style="color:var(--accent,#18181b);font-weight:600;min-width:20px;">/</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;color:var(--panel-text,#1f2937);">${esc(skill.name)}</div>
        <div style="font-size:12px;color:var(--panel-text-secondary,#6b7280);">${esc(skill.description)}</div>
      </div>
      <span style="margin-left:auto;font-size:12px;color:var(--panel-text-secondary,#9ca3af);">${skill.source}</span>`;
    item.addEventListener('click', () => selectSkill(skill));
    item.addEventListener('mouseenter', () => {
      selectedIndex = i;
      updateSelection();
    });
    dd.appendChild(item);
  });
}

function updateSelection() {
  if (!dropdownEl) return;
  dropdownEl.querySelectorAll('.ds-mini-ac-shadow-item').forEach((item, i) => {
    (item as HTMLElement).style.background =
      i === selectedIndex ? 'var(--accent-bg, rgba(24,24,27,0.08))' : 'transparent';
    if (i === selectedIndex) (item as HTMLElement).scrollIntoView({ block: 'nearest' });
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
    ? el.value
    : el.textContent || '';
}

function setInputText(el: HTMLElement, text: string) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showToast(msg: string) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    z-index:9999999;background:var(--panel-bg, #1f2937);color:var(--panel-text, #fff);
    border:1px solid var(--panel-border);
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
