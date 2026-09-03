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
    },
  },
});

// ============================================================
// 动态导入（mock 必须在 import 之前设置）
// ============================================================
const panelConfig = await import('../panel-config');
const agentMode = await import('../agent-mode');
const tavilyKey = await import('../tavily-key');
const dataBackup = await import('../data-backup');

// ============================================================
// Tests
// ============================================================
describe('panel-config', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('缺省返回 100（深浅色）', async () => {
    await expect(panelConfig.getPanelOpacity(true)).resolves.toBe(100);
    await expect(panelConfig.getPanelOpacity(false)).resolves.toBe(100);
  });

  it('set → get 往返（深浅色独立）', async () => {
    await panelConfig.setPanelOpacity(true, 60);
    await panelConfig.setPanelOpacity(false, 40);
    await expect(panelConfig.getPanelOpacity(true)).resolves.toBe(60);
    await expect(panelConfig.getPanelOpacity(false)).resolves.toBe(40);
  });

  it('backupDefaults 内容正确', () => {
    expect(panelConfig.panelBackupDefaults).toEqual({
      ds_panel_opacity_light: 100,
      ds_panel_opacity_dark: 100,
    });
  });
});

describe('agent-mode', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('缺省返回 false', async () => {
    await expect(agentMode.getAgentMode()).resolves.toBe(false);
  });

  it('set → get 往返', async () => {
    await agentMode.setAgentMode(true);
    await expect(agentMode.getAgentMode()).resolves.toBe(true);
    await agentMode.setAgentMode(false);
    await expect(agentMode.getAgentMode()).resolves.toBe(false);
  });

  it('backupDefaults 内容正确', () => {
    expect(agentMode.agentModeBackupDefaults).toEqual({ ds_mini_agent_mode: false });
  });
});

describe('tavily-key', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('缺省返回空串', async () => {
    await expect(tavilyKey.getTavilyKey()).resolves.toBe('');
  });

  it('set → get 往返', async () => {
    await tavilyKey.setTavilyKey('tvly-testkey');
    await expect(tavilyKey.getTavilyKey()).resolves.toBe('tvly-testkey');
  });

  it('backupDefaults 内容正确', () => {
    expect(tavilyKey.tavilyKeyBackupDefaults).toEqual({ ds_mini_tavily_key: '' });
  });
});

// ============================================================
// data-backup 聚合验收：9 个 key、默认值逐字一致
// ============================================================
describe('data-backup BACKUP_KEYS 聚合', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('聚合后 key 集合与默认值与原清单完全一致', async () => {
    const result = await dataBackup.exportAllData();

    expect(Object.keys(result.data).sort()).toEqual(
      [
        'ds_mini_skills',
        'ds_mini_categories',
        'ds_mini_hidden_sessions',
        'ds_mini_session_titles',
        'ds_mini_enhancer',
        'ds_mini_tavily_key',
        'ds_mini_agent_mode',
        'ds_panel_opacity_light',
        'ds_panel_opacity_dark',
      ].sort(),
    );

    expect(result.data).toEqual({
      ds_mini_skills: [],
      ds_mini_categories: { order: [], items: {}, sessionCategory: {} },
      ds_mini_hidden_sessions: [],
      ds_mini_session_titles: {},
      ds_mini_enhancer: {},
      ds_mini_tavily_key: '',
      ds_mini_agent_mode: false,
      ds_panel_opacity_light: 100,
      ds_panel_opacity_dark: 100,
    });
  });
});
