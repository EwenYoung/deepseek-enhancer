import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Skill } from '../types';

// ============================================================
// Mock chrome.storage.local
// ============================================================
const storage = new Map<string, unknown>();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
        if (Array.isArray(keys)) {
          const result: Record<string, unknown> = {};
          for (const k of keys) result[k] = storage.get(k) ?? null;
          return result;
        }
        if (typeof keys === 'string') {
          return { [keys]: storage.get(keys) ?? null };
        }
        if (keys && typeof keys === 'object') {
          const result: Record<string, unknown> = {};
          for (const k of Object.keys(keys)) result[k] = storage.get(k) ?? keys[k];
          return result;
        }
        return {};
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) storage.set(k, v);
      }),
    },
  },
});

// ============================================================
// 动态导入（mock 必须在 import 之前设置）
// ============================================================
const skillRegistry = await import('../skill-registry');

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test-1',
    name: 'test-skill',
    description: 'A test skill',
    instructions: 'Do the thing.',
    source: 'custom',
    enabled: true,
    memoryEnabled: false,
    ...overrides,
  };
}

describe('skill-registry', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  describe('loadSkills', () => {
    it('returns builtin skills when storage is empty', async () => {
      const skills = await skillRegistry.loadSkills();
      // 内置技能 + 排序
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.every((s) => s.source === 'builtin')).toBe(true);
      // 按名称排序
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].name.localeCompare(skills[i].name)).toBeLessThanOrEqual(0);
      }
    });

    it('includes custom skills alongside builtin', async () => {
      const custom: Skill = makeSkill({ id: 'custom-1', source: 'custom', name: 'my-custom' });
      await chrome.storage.local.set({ ds_mini_skills: [custom] });
      const skills = await skillRegistry.loadSkills();
      const customFound = skills.find((s) => s.id === 'custom-1');
      expect(customFound).toBeDefined();
    });
  });

  describe('saveSkill', () => {
    it('saves a new skill', async () => {
      const skill = makeSkill({ id: 'new-skill' });
      await skillRegistry.saveSkill(skill);
      const skills = await skillRegistry.loadSkills();
      expect(skills.some((s) => s.id === 'new-skill')).toBe(true);
    });

    it('updates an existing skill', async () => {
      const skill = makeSkill({ id: 'update-me', name: 'original' });
      await skillRegistry.saveSkill(skill);

      const updated = { ...skill, name: 'updated', instructions: 'New instructions.' };
      await skillRegistry.saveSkill(updated);

      const skills = await skillRegistry.loadSkills();
      const found = skills.find((s) => s.id === 'update-me');
      expect(found?.name).toBe('updated');
      expect(found?.instructions).toBe('New instructions.');
    });

    it('adds metadata.updatedAt on save', async () => {
      const skill = makeSkill({ id: 'with-meta' });
      await skillRegistry.saveSkill(skill);
      await skillRegistry.saveSkill({ ...skill, name: 'changed' });

      const skills = await skillRegistry.loadSkills();
      const found = skills.find((s) => s.id === 'with-meta');
      expect(found?.metadata?.updatedAt).toBeDefined();
      expect(typeof found?.metadata?.updatedAt).toBe('number');
    });
  });

  describe('deleteSkill', () => {
    it('removes a custom skill', async () => {
      const skill = makeSkill({ id: 'delete-me', source: 'custom' });
      await skillRegistry.saveSkill(skill);
      await skillRegistry.deleteSkill('delete-me');

      const skills = await skillRegistry.loadSkills();
      expect(skills.some((s) => s.id === 'delete-me')).toBe(false);
    });

    it('does not remove builtin skills', async () => {
      // Try to delete all skills
      for (const s of await skillRegistry.loadSkills()) {
        if (s.source === 'builtin') {
          await skillRegistry.deleteSkill(s.id);
        }
      }
      // Builtins should still be there
      const after = await skillRegistry.loadSkills();
      expect(after.filter((s) => s.source === 'builtin').length).toBeGreaterThan(0);
    });
  });

  describe('getSkillById', () => {
    it('finds skill by id', async () => {
      const skill = makeSkill({ id: 'find-me', name: 'finder' });
      await skillRegistry.saveSkill(skill);
      const found = await skillRegistry.getSkillById('find-me');
      expect(found?.name).toBe('finder');
    });

    it('returns undefined for missing id', async () => {
      const found = await skillRegistry.getSkillById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('getSkillByName', () => {
    it('finds enabled skill by name', async () => {
      const skill = makeSkill({ id: 'by-name', name: 'my-skill', enabled: true });
      await skillRegistry.saveSkill(skill);
      const found = await skillRegistry.getSkillByName('my-skill');
      expect(found?.id).toBe('by-name');
    });

    it('does not return disabled skills', async () => {
      const skill = makeSkill({ id: 'disabled-1', name: 'disabled-skill', enabled: false });
      await skillRegistry.saveSkill(skill);
      const found = await skillRegistry.getSkillByName('disabled-skill');
      expect(found).toBeUndefined();
    });
  });

  describe('matchSkills', () => {
    it('returns all enabled skills when prefix is empty', async () => {
      const result = await skillRegistry.matchSkills('');
      expect(result.every((s) => s.enabled)).toBe(true);
    });

    it('filters by name prefix', async () => {
      const result = await skillRegistry.matchSkills('code');
      // 只有名称以 'code' 开头的启用技能
      expect(result.every((s) => s.name.startsWith('code'))).toBe(true);
    });

    it('filters by description containing prefix', async () => {
      // 保存一个自定义技能以便可预测地测试描述匹配
      const skill = makeSkill({
        id: 'desc-test',
        name: 'zzz-unique',
        description: 'Something about testing',
        enabled: true,
      });
      await skillRegistry.saveSkill(skill);

      const result = await skillRegistry.matchSkills('testing');
      expect(result.some((s) => s.id === 'desc-test')).toBe(true);
    });

    it('is case-insensitive', async () => {
      const lower = await skillRegistry.matchSkills('code');
      const upper = await skillRegistry.matchSkills('CODE');
      expect(lower.length).toBe(upper.length);
    });

    it('excludes disabled skills', async () => {
      const skill = makeSkill({
        id: 'disabled-match',
        name: 'disabled-match-test',
        enabled: false,
      });
      await skillRegistry.saveSkill(skill);
      const result = await skillRegistry.matchSkills('disabled-match');
      expect(result.some((s) => s.id === 'disabled-match')).toBe(false);
    });
  });
});
