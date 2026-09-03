import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================
// 最小 DOM 桩（仓库测试环境为 node，未装 jsdom；守卫只用到
// document.querySelector / createElement / head.appendChild / el.remove，
// 桩覆盖这四个操作即可）
// ============================================================
class FakeStyleEl {
  textContent = '';
  attrs = new Map<string, string>();
  parent: FakeHead | null = null;

  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }

  remove() {
    this.parent?.remove(this);
    this.parent = null;
  }
}

class FakeHead {
  children: FakeStyleEl[] = [];

  appendChild(el: FakeStyleEl) {
    // appendChild 语义：已存在的节点先移除再追加（移到末尾）
    const i = this.children.indexOf(el);
    if (i >= 0) this.children.splice(i, 1);
    this.children.push(el);
    el.parent = this;
  }

  remove(el: FakeStyleEl) {
    const i = this.children.indexOf(el);
    if (i >= 0) this.children.splice(i, 1);
  }
}

const head = new FakeHead();

vi.stubGlobal('document', {
  head,
  createElement: (_tag: string) => new FakeStyleEl(),
  querySelector: (sel: string) => {
    const m = /^\[data-rule="(.+)"\]$/.exec(sel);
    if (!m) return null;
    const id = m[1];
    return head.children.find((c) => c.attrs.get('data-rule') === id) ?? null;
  },
});

const { applyGuardedCSS, removeGuardedCSS, reassertStyles } = await import('../enhancer-features');

// 注册表是模块私有，文件内测试共享同一实例 → 每个测试创建过的 id 在结束后注销
const createdIds: string[] = [];

function applyAndTrack(id: string, css: string) {
  applyGuardedCSS(id, css);
  if (!createdIds.includes(id)) createdIds.push(id);
}

// ============================================================
// Tests
// ============================================================
describe('style guard seam', () => {
  beforeEach(() => {
    head.children.length = 0;
  });

  afterEach(() => {
    for (const id of createdIds) removeGuardedCSS(id);
    createdIds.length = 0;
  });

  it('applyGuardedCSS 创建 [data-rule] 标签并注册', () => {
    applyAndTrack('tool-blocks', '.x { color: red; }');

    expect(head.children).toHaveLength(1);
    expect(head.children[0].attrs.get('data-rule')).toBe('tool-blocks');
    expect(head.children[0].textContent).toBe('.x { color: red; }');
  });

  it('重复调用同 id 更新内容但不重复建标签', () => {
    applyAndTrack('cat-panel', 'a { color: red; }');
    applyAndTrack('cat-panel', 'b { color: blue; }');

    expect(head.children).toHaveLength(1);
    expect(head.children[0].textContent).toBe('b { color: blue; }');
  });

  it('removeGuardedCSS 移除标签并注销（再次 apply 会重建新标签）', () => {
    applyAndTrack('hide', 'x {}');
    removeGuardedCSS('hide');

    expect(head.children).toHaveLength(0);

    // 注销后重新 apply → 新建标签（若未注销，只会更新原标签 textContent）
    applyAndTrack('hide', 'y {}');
    expect(head.children).toHaveLength(1);
    expect(head.children[0].textContent).toBe('y {}');
  });

  it('reassert 顺序不变量：theme 标签排到其它规则之前', () => {
    applyAndTrack('panel-vars', 'p {}');
    applyAndTrack('theme', 't {}');
    applyAndTrack('voice-pulse', 'v {}');

    // 模拟页面重排：把 theme 标签物理移到末尾（appendChild 移动语义）
    const themeEl = head.children.find((c) => c.attrs.get('data-rule') === 'theme')!;
    head.appendChild(themeEl);
    expect(head.children.map((c) => c.attrs.get('data-rule'))).toEqual([
      'panel-vars',
      'voice-pulse',
      'theme',
    ]);

    reassertStyles();

    expect(head.children.map((c) => c.attrs.get('data-rule'))).toEqual([
      'theme',
      'panel-vars',
      'voice-pulse',
    ]);
  });

  it('reassert 重建被移除的标签并保持 CSS 内容', () => {
    applyAndTrack('voice-pulse', '@keyframes ds-voice-pulse {}');

    // 模拟页面移除标签
    head.children[0].remove();
    expect(head.children).toHaveLength(0);

    reassertStyles();

    expect(head.children).toHaveLength(1);
    expect(head.children[0].attrs.get('data-rule')).toBe('voice-pulse');
    expect(head.children[0].textContent).toBe('@keyframes ds-voice-pulse {}');
  });
});
