// ============================================================
// deepseek-enhancer — Skill 注册表
// ============================================================
// 管理所有技能（内置 + GitHub + 本地 + 自定义）的 CRUD 和持久化
import type { Skill } from './types';
import { BUILTIN_SKILLS } from './skill-builtin';

// ============================================================
// Storage Key
// ============================================================
const STORAGE_KEY = 'ds_mini_skills';

// ponytail: Chrome Storage API，不需要单独的持久化层

// ============================================================
// 加载
// ============================================================
export async function loadSkills(): Promise<Skill[]> {
  const userSkills = await loadUserSkills();

  // 将用户保存的状态合并到内置技能上（覆盖 enabled 等）
  const builtin = BUILTIN_SKILLS.map(b => {
    const userCopy = userSkills.find(s => s.id === b.id);
    return userCopy ? { ...b, ...userCopy } : b;
  });

  // 非内置的用户自定义技能
  const custom = userSkills.filter(s => s.source !== 'builtin');

  return [...builtin, ...custom].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadUserSkills(): Promise<Skill[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

async function saveUserSkills(skills: Skill[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: skills });
  } catch (err) {
    console.warn('[DS-Mini] Failed to save skills:', err);
  }
}

// ============================================================
// CRUD
// ============================================================
export async function saveSkill(skill: Skill): Promise<void> {
  const skills = await loadUserSkills();
  const idx = skills.findIndex(s => s.id === skill.id);

  if (idx >= 0) {
    skills[idx] = { ...skill, metadata: { ...skill.metadata, updatedAt: Date.now() } };
  } else {
    skills.push(skill);
  }

  await saveUserSkills(skills);
}

export async function deleteSkill(id: string): Promise<void> {
  const skills = await loadUserSkills();
  // 不能删除内置技能
  const filtered = skills.filter(s => s.id !== id && s.source !== 'builtin');
  await saveUserSkills(filtered);
}

export async function getSkillById(id: string): Promise<Skill | undefined> {
  const all = await loadSkills();
  return all.find(s => s.id === id);
}

export async function getSkillByName(name: string): Promise<Skill | undefined> {
  const all = await loadSkills();
  return all.find(s => s.name === name && s.enabled);
}

// ============================================================
// 开关
// ============================================================
export async function toggleSkill(id: string, enabled: boolean): Promise<void> {
  // 内置技能的状态也保存在用户存储中
  const userSkills = await loadUserSkills();
  const skill = userSkills.find(s => s.id === id);

  if (skill) {
    skill.enabled = enabled;
  } else {
    // 可能是内置技能首次 toggle
    const builtin = BUILTIN_SKILLS.find(s => s.id === id);
    if (builtin) {
      userSkills.push({ ...builtin, enabled });
    }
  }

  await saveUserSkills(userSkills);
}

// ============================================================
// 匹配（用于 /autocomplete）
// ============================================================
export async function matchSkills(prefix: string): Promise<Skill[]> {
  const all = await loadSkills();
  const enabled = all.filter(s => s.enabled);

  if (!prefix) return enabled;

  const lower = prefix.toLowerCase();
  return enabled.filter(s =>
    s.name.toLowerCase().startsWith(lower) ||
    s.description.toLowerCase().includes(lower),
  );
}
