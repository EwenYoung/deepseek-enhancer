import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// Mock chrome.storage.local（须在 import 被测模块前就位）
// ============================================================
const storage = new Map<string, unknown>();
let getShouldFail = false;

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string) => {
        if (getShouldFail) throw new Error('storage broken');
        const value = storage.get(keys);
        return value === undefined ? {} : { [keys]: value };
      }),
    },
  },
});

const { getConfig, iconColorOnBrand } = await import('../enhancer-features');

const FULL_DEFAULTS = {
  wideScreen: false,
  themeIdx: 0,
  hideScrollbar: false,
  autoHideInput: false,
  voiceInput: false,
  tokenSpeed: false,
  chatFont: '',
  chatMonoFont: '',
  chatFontSize: 0,
};

// ============================================================
// Tests
// ============================================================
describe('getConfig', () => {
  beforeEach(() => {
    storage.clear();
    getShouldFail = false;
    vi.clearAllMocks();
  });

  it('键缺失 → 返回完整默认值', async () => {
    await expect(getConfig()).resolves.toEqual(FULL_DEFAULTS);
  });

  it('存储空对象 → 返回完整默认值，而非全 undefined 字段', async () => {
    storage.set('ds_mini_enhancer', {});

    await expect(getConfig()).resolves.toEqual(FULL_DEFAULTS);
  });

  it('存储部分字段 → 与默认值合并，缺省字段补全', async () => {
    storage.set('ds_mini_enhancer', { themeIdx: 3, tokenSpeed: true });

    await expect(getConfig()).resolves.toEqual({ ...FULL_DEFAULTS, themeIdx: 3, tokenSpeed: true });
  });

  it('存储完整配置 → 原样返回', async () => {
    const full = { ...FULL_DEFAULTS, wideScreen: true, chatFontSize: 18 };
    storage.set('ds_mini_enhancer', full);

    await expect(getConfig()).resolves.toEqual(full);
  });

  it('storage 读取失败 → 返回默认值且不抛错', async () => {
    getShouldFail = true;

    await expect(getConfig()).resolves.toEqual(FULL_DEFAULTS);
  });
});

describe('iconColorOnBrand', () => {
  it('深品牌色 → 白图标（含原生 deepseek 蓝）', () => {
    expect(iconColorOnBrand('#3964fe')).toBe('#ffffff');
    expect(iconColorOnBrand('#179299')).toBe('#ffffff'); // Catppuccin浅
    expect(iconColorOnBrand('#E07850')).toBe('#ffffff'); // Claude深
  });

  it('浅粉彩品牌色 → 深灰图标（白图标对比不足）', () => {
    expect(iconColorOnBrand('#89b4fa')).toBe('#18181b'); // Catppuccin深
    expect(iconColorOnBrand('#bd93f9')).toBe('#18181b'); // Dracula
    expect(iconColorOnBrand('#61afef')).toBe('#18181b'); // OneHalf
    expect(iconColorOnBrand('#D98A6A')).toBe('#18181b'); // Claude浅
  });

  it('无效输入不抛错（按黑底处理 → 白图标）', () => {
    expect(iconColorOnBrand('')).toBe('#ffffff');
    expect(iconColorOnBrand('#zz')).toBe('#ffffff');
  });
});
