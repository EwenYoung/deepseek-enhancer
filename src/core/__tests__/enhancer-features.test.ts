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

const { getConfig, textColorOnBrand, buildMarkdownStyleRules } =
  await import('../enhancer-features');

const FULL_DEFAULTS = {
  wideScreen: false,
  themeIdx: 0,
  hideScrollbar: false,
  autoHideInput: false,
  voiceInput: false,
  chatFont: '',
  chatMonoFont: '',
  chatFontSize: 0,
  mdTypo: false,
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
    storage.set('ds_mini_enhancer', { themeIdx: 3, chatFontSize: 18 });

    await expect(getConfig()).resolves.toEqual({ ...FULL_DEFAULTS, themeIdx: 3, chatFontSize: 18 });
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

describe('textColorOnBrand', () => {
  it('深品牌色 → 白前景（含原生 deepseek 蓝）', () => {
    expect(textColorOnBrand('#3964fe')).toBe('#ffffff');
    expect(textColorOnBrand('#179299')).toBe('#ffffff'); // Catppuccin浅
    expect(textColorOnBrand('#E07850')).toBe('#ffffff'); // Claude深
  });

  it('浅粉彩品牌色 → 深灰前景（白前景对比不足）', () => {
    expect(textColorOnBrand('#89b4fa')).toBe('#18181b'); // Catppuccin深
    expect(textColorOnBrand('#bd93f9')).toBe('#18181b'); // Dracula
    expect(textColorOnBrand('#61afef')).toBe('#18181b'); // OneHalf
    expect(textColorOnBrand('#D98A6A')).toBe('#18181b'); // Claude浅
  });

  it('亮度阈值边界（0.32）→ 灰阶 #999999 白 / #9a9a9a 深灰', () => {
    expect(textColorOnBrand('#999999')).toBe('#ffffff');
    expect(textColorOnBrand('#9a9a9a')).toBe('#18181b');
  });

  it('无效输入不抛错（按黑底处理 → 白前景）', () => {
    expect(textColorOnBrand('')).toBe('#ffffff');
    expect(textColorOnBrand('#zz')).toBe('#ffffff');
  });
});

describe('buildMarkdownStyleRules', () => {
  it('全关 → 空数组', () => {
    expect(buildMarkdownStyleRules(FULL_DEFAULTS)).toEqual([]);
  });

  it('仅开 mdTypo → 只产出 md-typo，含行高/标题梯度/段距关键值', () => {
    const rules = buildMarkdownStyleRules({ ...FULL_DEFAULTS, mdTypo: true });
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('md-typo');
    expect(rules[0].css).toContain('line-height: 1.75');
    expect(rules[0].css).toContain('h1');
    expect(rules[0].css).toContain('h4');
    expect(rules[0].css).toContain('margin: 20px 0');
  });

  it('非默认主题自动产出精修+配色，精修先于配色（横条同特异性竞争配色胜出）', () => {
    const rules = buildMarkdownStyleRules({ ...FULL_DEFAULTS, themeIdx: 1 });
    expect(rules.map((r) => r.id)).toEqual(['md-code-polish', 'md-tint']);
    const polish = rules[0].css;
    expect(polish).toContain('--dsl-code-block-border-radius');
    // 主题态修复：页角色块置透明 + label-primary 混色灰底压过 wash 规则
    expect(polish).toContain('--code-bottom-color: transparent');
    expect(polish).toContain('var(--dsw-alias-label-primary)');
    expect(polish).toContain('[data-ds-chatpanel]');
    expect(polish).toContain('!important');
    // no-bg 链变体：严格压过主题透明毯规则 (1,3,0)，不依赖标签顺序
    expect(polish).toContain('[data-ds-no-bg] .ds-markdown .md-code-block');
    expect(polish).toContain('.md-code-block-banner-wrap');
    const tint = rules[1].css;
    const flat = tint.replace(/\s+/g, ' ');
    expect(tint).toContain('color-mix');
    expect(tint).toContain('var(--dsw-alias-brand-primary)');
    // 深色判定：官方两种暗色标记都要覆盖
    expect(tint).toContain('body[data-ds-dark-theme]');
    expect(tint).toContain('body.dark');
    // 压主题 wash 规则：带 chatpanel 前缀 + !important，且有无主题态的无前缀选择器
    expect(tint).toContain('[data-ds-chatpanel]');
    expect(tint).toContain('!important');
    expect(flat).toContain('#root [data-ds-chatpanel] .ds-markdown :not(pre) > code,');
    expect(flat).toContain('#root .ds-markdown :not(pre) > code {');
    // no-bg 链变体：严格压过主题透明毯规则 (1,3,0)，不依赖标签顺序
    expect(tint).toContain('[data-ds-no-bg] .ds-markdown :not(pre) > code');
    // 覆盖面：行内 code 避开代码块内部、引用块、角标、代码块标题栏
    expect(tint).toContain(':not(pre) > code');
    expect(tint).toContain('blockquote');
    expect(tint).toContain('.ds-markdown-cite');
    expect(tint).toContain('.md-code-block-banner-wrap');
  });

  it('非默认主题 + 开正文排版 → 三条按 [typo, polish, tint] 序产出', () => {
    const rules = buildMarkdownStyleRules({ ...FULL_DEFAULTS, themeIdx: 2, mdTypo: true });
    expect(rules.map((r) => r.id)).toEqual(['md-typo', 'md-code-polish', 'md-tint']);
    for (const rule of rules) expect(rule.css.trim().length).toBeGreaterThan(0);
  });
});
