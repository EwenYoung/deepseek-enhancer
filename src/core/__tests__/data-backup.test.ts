import { describe, it, expect, beforeEach, vi } from 'vitest';

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
        return Object.fromEntries(storage);
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) storage.set(k, v);
      }),
      clear: vi.fn(async () => {
        storage.clear();
      }),
    },
  },
});

// ============================================================
// 动态导入（mock 必须在 import 之前设置）
// ============================================================
const dataBackup = await import('../data-backup');

// ============================================================
// Helpers
// ============================================================
function seedStorage() {
  storage.set('ds_mini_skills', [
    {
      id: 's1',
      name: 'writer',
      description: 'desc',
      instructions: 'instr',
      source: 'custom',
      enabled: true,
      memoryEnabled: false,
    },
  ]);
  storage.set('ds_mini_categories', {
    order: ['Work'],
    items: { Work: { createdAt: 1, sessions: ['sid1'] } },
    sessionCategory: { sid1: 'Work' },
  });
  storage.set('ds_mini_hidden_sessions', ['sid2', 'sid3']);
  storage.set('ds_mini_session_titles', { sid1: 'My Title' });
  storage.set('ds_mini_enhancer', { wideScreen: true, themeIdx: 2 });
  storage.set('ds_mini_tavily_key', 'tvly-testkey');
  storage.set('ds_mini_agent_mode', true);
  storage.set('ds_panel_opacity_light', 55);
  storage.set('ds_panel_opacity_dark', 70);
}

// ============================================================
// Tests
// ============================================================
describe('data-backup', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  describe('exportAllData', () => {
    it('返回包含 version、exportedAt、data 的对象', async () => {
      seedStorage();
      const result = await dataBackup.exportAllData();

      expect(result.version).toBe(1);
      expect(typeof result.exportedAt).toBe('string');
      expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
      expect(result.data).toBeDefined();
    });

    it('读取全部 9 个 key', async () => {
      seedStorage();
      const result = await dataBackup.exportAllData();

      expect(result.data.ds_mini_skills).toHaveLength(1);
      expect(result.data.ds_mini_categories).toHaveProperty('order');
      expect(result.data.ds_mini_hidden_sessions).toEqual(['sid2', 'sid3']);
      expect(result.data.ds_mini_session_titles).toEqual({ sid1: 'My Title' });
      expect(result.data.ds_mini_enhancer).toEqual({ wideScreen: true, themeIdx: 2 });
      expect(result.data.ds_mini_tavily_key).toBe('tvly-testkey');
      expect(result.data.ds_mini_agent_mode).toBe(true);
      expect(result.data.ds_panel_opacity_light).toBe(55);
      expect(result.data.ds_panel_opacity_dark).toBe(70);
    });

    it('存储为空时各 key 为默认空值', async () => {
      const result = await dataBackup.exportAllData();

      expect(result.data.ds_mini_skills).toEqual([]);
      expect(result.data.ds_mini_categories).toEqual({ order: [], items: {}, sessionCategory: {} });
      expect(result.data.ds_mini_hidden_sessions).toEqual([]);
      expect(result.data.ds_mini_session_titles).toEqual({});
      expect(result.data.ds_mini_tavily_key).toBe('');
      expect(result.data.ds_mini_agent_mode).toBe(false);
      expect(result.data.ds_panel_opacity_light).toBe(100);
      expect(result.data.ds_panel_opacity_dark).toBe(100);
    });
  });

  describe('importAllData', () => {
    it('合法 JSON → 正确写入 storage', async () => {
      seedStorage();
      const exported = await dataBackup.exportAllData();
      const json = JSON.stringify(exported);

      await dataBackup.importAllData(json);

      expect(storage.get('ds_mini_skills')).toHaveLength(1);
      expect(storage.get('ds_mini_tavily_key')).toBe('tvly-testkey');
      expect(storage.get('ds_mini_agent_mode')).toBe(true);
      expect(storage.get('ds_panel_opacity_light')).toBe(55);
      expect(storage.get('ds_panel_opacity_dark')).toBe(70);
    });

    it('旧格式备份缺 key → 回填默认值，而非被 clear 清空', async () => {
      seedStorage();
      // 旧版本（opacity 键加入白名单前）导出的备份只有 7 个 key
      const legacyBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          ds_mini_skills: [],
          ds_mini_categories: { order: [], items: {}, sessionCategory: {} },
          ds_mini_hidden_sessions: [],
          ds_mini_session_titles: {},
          ds_mini_enhancer: { wideScreen: false, themeIdx: 0 },
          ds_mini_tavily_key: '',
          ds_mini_agent_mode: false,
        },
      };

      await dataBackup.importAllData(JSON.stringify(legacyBackup));

      expect(storage.get('ds_panel_opacity_light')).toBe(100);
      expect(storage.get('ds_panel_opacity_dark')).toBe(100);
    });

    it('全量替换：旧数据被清除', async () => {
      seedStorage();
      // 导入一个精简备份
      const minimal = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          ds_mini_skills: [],
          ds_mini_categories: { order: [], items: {}, sessionCategory: {} },
          ds_mini_hidden_sessions: [],
          ds_mini_session_titles: {},
          ds_mini_enhancer: { wideScreen: false, themeIdx: 0 },
          ds_mini_tavily_key: '',
          ds_mini_agent_mode: false,
        },
      };

      await dataBackup.importAllData(JSON.stringify(minimal));

      expect(storage.get('ds_mini_skills')).toEqual([]);
      expect(storage.get('ds_mini_tavily_key')).toBe('');
      expect(storage.get('ds_mini_hidden_sessions')).toEqual([]);
    });

    it('缺少 version 字段 → 抛错', async () => {
      const bad = { exportedAt: new Date().toISOString(), data: {} };
      await expect(dataBackup.importAllData(JSON.stringify(bad))).rejects.toThrow();
    });

    it('version > 1 → 抛错提示升级', async () => {
      const bad = { version: 999, exportedAt: new Date().toISOString(), data: {} };
      await expect(dataBackup.importAllData(JSON.stringify(bad))).rejects.toThrow(
        /版本过高|upgrade/i,
      );
    });

    it('非法 JSON → 抛错', async () => {
      await expect(dataBackup.importAllData('not json {{{')).rejects.toThrow();
    });

    it('缺少 data 字段 → 抛错', async () => {
      const bad = { version: 1, exportedAt: new Date().toISOString() };
      await expect(dataBackup.importAllData(JSON.stringify(bad))).rejects.toThrow();
    });
  });

  describe('round-trip', () => {
    it('export → import 数据完全一致', async () => {
      seedStorage();
      const exported = await dataBackup.exportAllData();

      // 清空后恢复
      storage.clear();
      await dataBackup.importAllData(JSON.stringify(exported));

      expect(storage.get('ds_mini_skills')).toEqual(exported.data.ds_mini_skills);
      expect(storage.get('ds_mini_categories')).toEqual(exported.data.ds_mini_categories);
      expect(storage.get('ds_mini_hidden_sessions')).toEqual(exported.data.ds_mini_hidden_sessions);
      expect(storage.get('ds_mini_session_titles')).toEqual(exported.data.ds_mini_session_titles);
      expect(storage.get('ds_mini_enhancer')).toEqual(exported.data.ds_mini_enhancer);
      expect(storage.get('ds_mini_tavily_key')).toBe(exported.data.ds_mini_tavily_key);
      expect(storage.get('ds_mini_agent_mode')).toBe(exported.data.ds_mini_agent_mode);
      expect(storage.get('ds_panel_opacity_light')).toBe(55);
      expect(storage.get('ds_panel_opacity_dark')).toBe(70);
    });
  });
});
