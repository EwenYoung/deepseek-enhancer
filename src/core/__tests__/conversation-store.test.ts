import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CategoryState, CategoriesData, CategoryItem } from '../conversation-store';

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
        return {};
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) storage.set(k, v);
      }),
    },
  },
});

const store = await import('../conversation-store');

// ============================================================
// Helpers
// ============================================================
function makeState(overrides?: Partial<CategoryState>): CategoryState {
  return {
    categories: {
      order: [],
      items: {},
      sessionCategory: {},
    },
    hiddenSessions: [],
    sessionTitles: {},
    ...overrides,
  };
}

function makeStateWithCategory(name: string, sessions: string[] = []): CategoryState {
  return {
    categories: {
      order: [name],
      items: {
        [name]: { createdAt: Date.now(), sessions: [...sessions] },
      },
      sessionCategory: {},
    },
    hiddenSessions: [],
    sessionTitles: {},
  };
}

// ============================================================
// Tests
// ============================================================

describe('conversation-store CRUD', () => {
  describe('addCategory', () => {
    it('adds a category to state', () => {
      const state = makeState();
      const result = store.addCategory(state, 'Work');
      expect(result).toBe(true);
      expect(state.categories.order).toContain('Work');
      expect(state.categories.items['Work']).toBeDefined();
      expect(state.categories.items['Work'].sessions).toEqual([]);
    });

    it('trims whitespace from name', () => {
      const state = makeState();
      store.addCategory(state, '  Trimmed  ');
      expect(state.categories.items['Trimmed']).toBeDefined();
    });

    it('rejects empty name', () => {
      const state = makeState();
      expect(store.addCategory(state, '')).toBe(false);
      expect(store.addCategory(state, '   ')).toBe(false);
    });

    it('rejects duplicate name', () => {
      const state = makeStateWithCategory('Work');
      expect(store.addCategory(state, 'Work')).toBe(false);
    });
  });

  describe('renameCategory', () => {
    it('renames a category and updates order', () => {
      const state = makeStateWithCategory('Old');
      const result = store.renameCategory(state, 'Old', 'New');
      expect(result).toBe(true);
      expect(state.categories.items['Old']).toBeUndefined();
      expect(state.categories.items['New']).toBeDefined();
      expect(state.categories.order).toEqual(['New']);
    });

    it('updates session reverse mappings on rename', () => {
      const state = makeStateWithCategory('Old', ['sid-1', 'sid-2']);
      store.categorizeSession(state, 'sid-1', 'Old');
      store.categorizeSession(state, 'sid-2', 'Old');
      store.renameCategory(state, 'Old', 'New');

      expect(state.categories.sessionCategory['sid-1']).toBe('New');
      expect(state.categories.sessionCategory['sid-2']).toBe('New');
    });

    it('rejects empty new name', () => {
      const state = makeStateWithCategory('Old');
      expect(store.renameCategory(state, 'Old', '')).toBe(false);
    });

    it('rejects name unchanged', () => {
      const state = makeStateWithCategory('Same');
      expect(store.renameCategory(state, 'Same', 'Same')).toBe(false);
    });

    it('rejects duplicate target name', () => {
      const state = makeState();
      store.addCategory(state, 'A');
      store.addCategory(state, 'B');
      expect(store.renameCategory(state, 'A', 'B')).toBe(false);
    });

    it('rejects non-existent old name', () => {
      const state = makeState();
      expect(store.renameCategory(state, 'Ghost', 'New')).toBe(false);
    });
  });

  describe('deleteCategory', () => {
    it('removes category and clears session mappings', () => {
      const state = makeStateWithCategory('Delete', ['sid-1']);
      store.categorizeSession(state, 'sid-1', 'Delete');

      const result = store.deleteCategory(state, 'Delete');
      expect(result).toBe(true);
      expect(state.categories.items['Delete']).toBeUndefined();
      expect(state.categories.order).not.toContain('Delete');
      expect(state.categories.sessionCategory['sid-1']).toBeUndefined();
    });

    it('returns false for non-existent category', () => {
      const state = makeState();
      expect(store.deleteCategory(state, 'Ghost')).toBe(false);
    });
  });

  describe('categorizeSession', () => {
    it('adds session to category', () => {
      const state = makeStateWithCategory('Work');
      const result = store.categorizeSession(state, 'sid-1', 'Work');
      expect(result).toBe(true);
      expect(state.categories.items['Work'].sessions).toContain('sid-1');
      expect(state.categories.sessionCategory['sid-1']).toBe('Work');
    });

    it('adds session to hidden list', () => {
      const state = makeStateWithCategory('Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      expect(state.hiddenSessions).toContain('sid-1');
    });

    it('does not duplicate session in hidden list', () => {
      const state = makeStateWithCategory('Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      expect(state.hiddenSessions.filter((s) => s === 'sid-1')).toHaveLength(1);
    });

    it('moves session from old category to new', () => {
      const state = makeState();
      store.addCategory(state, 'A');
      store.addCategory(state, 'B');
      store.categorizeSession(state, 'sid-1', 'A');
      store.categorizeSession(state, 'sid-1', 'B');

      // 已从 A 移除
      expect(state.categories.items['A'].sessions).not.toContain('sid-1');
      // 已加入 B
      expect(state.categories.items['B'].sessions).toContain('sid-1');
      expect(state.categories.sessionCategory['sid-1']).toBe('B');
    });

    it('new sessions are prepended (unshift)', () => {
      const state = makeStateWithCategory('Work', ['sid-old']);
      store.categorizeSession(state, 'sid-new', 'Work');
      expect(state.categories.items['Work'].sessions[0]).toBe('sid-new');
    });

    it('does not duplicate session in same category', () => {
      const state = makeStateWithCategory('Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      expect(state.categories.items['Work'].sessions.filter((s) => s === 'sid-1')).toHaveLength(1);
    });

    it('returns false for non-existent category', () => {
      const state = makeState();
      expect(store.categorizeSession(state, 'sid-1', 'Ghost')).toBe(false);
    });
  });

  describe('uncategorizeSession', () => {
    it('removes session from category', () => {
      const state = makeStateWithCategory('Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      const result = store.uncategorizeSession(state, 'sid-1');
      expect(result).toBe(true);
      expect(state.categories.items['Work'].sessions).not.toContain('sid-1');
      expect(state.categories.sessionCategory['sid-1']).toBeUndefined();
    });

    it('removes session from hidden list', () => {
      const state = makeStateWithCategory('Work');
      store.categorizeSession(state, 'sid-1', 'Work');
      store.uncategorizeSession(state, 'sid-1');
      expect(state.hiddenSessions).not.toContain('sid-1');
    });

    it('returns false if session not categorized', () => {
      const state = makeState();
      expect(store.uncategorizeSession(state, 'sid-ghost')).toBe(false);
    });
  });

  describe('hidden sessions', () => {
    it('addHiddenSession adds to list', () => {
      const state = makeState();
      store.addHiddenSession(state, 'sid-1');
      expect(state.hiddenSessions).toContain('sid-1');
    });

    it('addHiddenSession does not duplicate', () => {
      const state = makeState();
      store.addHiddenSession(state, 'sid-1');
      store.addHiddenSession(state, 'sid-1');
      expect(state.hiddenSessions).toHaveLength(1);
    });

    it('removeHiddenSession removes from list', () => {
      const state = makeState({ hiddenSessions: ['sid-1', 'sid-2'] });
      store.removeHiddenSession(state, 'sid-1');
      expect(state.hiddenSessions).toEqual(['sid-2']);
    });

    it('removeHiddenSession is safe for non-existent', () => {
      const state = makeState();
      store.removeHiddenSession(state, 'sid-ghost');
      expect(state.hiddenSessions).toEqual([]);
    });
  });

  describe('sort', () => {
    it('toggleSortMode toggles between time-desc and time-asc', () => {
      const item: CategoryItem = { createdAt: 0, sessions: [] };
      expect(store.toggleSortMode(item)).toBe('time-asc');
      expect(store.toggleSortMode(item)).toBe('time-desc');
    });

    it('getSortIcon returns arrow symbols', () => {
      expect(store.getSortIcon('time-asc')).toBe('↑');
      expect(store.getSortIcon('time-desc')).toBe('↓');
      expect(store.getSortIcon()).toBe('↓'); // default
    });

    it('getSortLabel returns Chinese labels', () => {
      expect(store.getSortLabel('time-asc')).toBe('最早优先');
      expect(store.getSortLabel('time-desc')).toBe('最新优先');
    });
  });

  describe('reorderCategory', () => {
    it('moves category to new index', () => {
      const state = makeState();
      store.addCategory(state, 'A');
      store.addCategory(state, 'B');
      store.addCategory(state, 'C');
      expect(state.categories.order).toEqual(['A', 'B', 'C']);

      store.reorderCategory(state, 0, 2);
      expect(state.categories.order).toEqual(['B', 'C', 'A']);
    });

    it('ignores out-of-bounds indices', () => {
      const state = makeState();
      store.addCategory(state, 'A');
      store.addCategory(state, 'B');

      store.reorderCategory(state, -1, 0);
      expect(state.categories.order).toEqual(['A', 'B']);

      store.reorderCategory(state, 0, 99);
      expect(state.categories.order).toEqual(['A', 'B']);
    });
  });

  describe('loadCategories / saveCategories', () => {
    it('loadCategories returns empty state when storage is empty', async () => {
      const state = await store.loadCategories();
      expect(state.categories.order).toEqual([]);
      expect(state.categories.items).toEqual({});
      expect(state.hiddenSessions).toEqual([]);
      expect(state.sessionTitles).toEqual({});
    });

    it('saveCategories and loadCategories roundtrip', async () => {
      const state = makeState();
      store.addCategory(state, 'Test');
      store.addHiddenSession(state, 'sid-1');
      state.sessionTitles = { 'sid-1': 'Test Chat' };

      await store.saveCategories(state);
      const loaded = await store.loadCategories();

      expect(loaded.categories.order).toEqual(['Test']);
      expect(loaded.categories.items['Test']).toBeDefined();
      expect(loaded.hiddenSessions).toEqual(['sid-1']);
      expect(loaded.sessionTitles).toEqual({ 'sid-1': 'Test Chat' });
    });
  });
});
