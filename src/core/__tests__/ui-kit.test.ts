import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { esc, escapeHTML, escAttr, showToast, downloadBlob, overlayStyle } from '../ui-kit';

// ============================================================
// ui-kit — UI 层共享助手
// ============================================================

/**
 * node 测试环境无 DOM：stub document。
 * createElement('div') 返回模拟 div——innerHTML 对 textContent 做
 * 与浏览器一致的实体转义（& < > "，单引号不转）。
 * createElement('a') 返回带 click spy 的模拟 a 标签。
 */
function stubDocument() {
  const body = { appendChild: vi.fn(), removeChild: vi.fn() };
  const createElement = vi.fn((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', style: {}, click: vi.fn() };
    }
    const el: { textContent: string; style: Record<string, string>; remove: () => void } = {
      textContent: '',
      style: {},
      remove: vi.fn(),
    };
    Object.defineProperty(el, 'innerHTML', {
      get() {
        return String(el.textContent)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      },
    });
    return el;
  });
  vi.stubGlobal('document', { createElement, body });
  return { body, createElement };
}

// ============================================================
// esc — DOM 法 HTML 转义
// ============================================================
describe('esc', () => {
  beforeEach(() => stubDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('经 textContent→innerHTML 转义 HTML 特殊字符', () => {
    expect(esc('<b>a</b>')).toBe('&lt;b&gt;a&lt;/b&gt;');
    expect(esc('a & "b"')).toBe('a &amp; &quot;b&quot;');
  });

  it('空串原样返回', () => {
    expect(esc('')).toBe('');
  });

  it('单引号不转义（浏览器 innerHTML 行为）', () => {
    expect(esc("it's")).toBe("it's");
  });
});

// ============================================================
// escapeHTML — 字符串替换法 HTML 转义
// ============================================================
describe('escapeHTML', () => {
  it('转义 & < > " 五项', () => {
    expect(escapeHTML('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('含标签文本整体转义', () => {
    expect(escapeHTML('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('空串原样返回', () => {
    expect(escapeHTML('')).toBe('');
  });

  it('无特殊字符时原样返回', () => {
    expect(escapeHTML('plain text')).toBe('plain text');
  });
});

// ============================================================
// escAttr — 属性值专用转义
// ============================================================
describe('escAttr', () => {
  it('只转 " \' < >，不转 &', () => {
    expect(escAttr('a&b"c\'d<e>f')).toBe('a&b&quot;c&#39;d&lt;e&gt;f');
  });

  it('空串原样返回', () => {
    expect(escAttr('')).toBe('');
  });
});

// ============================================================
// showToast — 底部轻提示
// ============================================================
describe('showToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('挂载 toast 并写入消息与样式', () => {
    const { body, createElement } = stubDocument();
    showToast('你好');
    expect(createElement).toHaveBeenCalledWith('div');
    const toast = createElement.mock.results[0].value;
    expect(toast.textContent).toBe('你好');
    expect(toast.style.cssText).toContain('position:fixed');
    expect(body.appendChild).toHaveBeenCalledWith(toast);
  });

  it('2000ms 后淡出、2500ms 后移除', () => {
    const { createElement } = stubDocument();
    showToast('你好');
    const toast = createElement.mock.results[0].value;
    vi.advanceTimersByTime(2000);
    expect(toast.style.opacity).toBe('0');
    vi.advanceTimersByTime(500);
    expect(toast.remove).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// downloadBlob — 触发浏览器下载
// ============================================================
describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('设置 a 标签属性并触发点击', () => {
    const createURL = vi.fn(() => 'blob:mock');
    const revokeURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createURL, revokeObjectURL: revokeURL });
    const { body, createElement } = stubDocument();

    downloadBlob(new Blob(['x'], { type: 'text/plain' }), 'f.txt');

    expect(createURL).toHaveBeenCalledTimes(1);
    const a = createElement.mock.results[0].value;
    expect(a.href).toBe('blob:mock');
    expect(a.download).toBe('f.txt');
    expect(a.style.display).toBe('none');
    expect(body.appendChild).toHaveBeenCalledWith(a);
    expect(a.click).toHaveBeenCalledTimes(1);
  });

  it('100ms 后移除 a 标签并 revoke URL', () => {
    const createURL = vi.fn(() => 'blob:mock');
    const revokeURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createURL, revokeObjectURL: revokeURL });
    const { body, createElement } = stubDocument();

    downloadBlob(new Blob(['x'], { type: 'text/plain' }), 'f.txt');
    const a = createElement.mock.results[0].value;

    vi.advanceTimersByTime(100);
    expect(body.removeChild).toHaveBeenCalledWith(a);
    expect(revokeURL).toHaveBeenCalledWith('blob:mock');
  });
});

// ============================================================
// overlayStyle — 弹窗遮罩公共样式
// ============================================================
describe('overlayStyle', () => {
  it('返回公共遮罩样式（定位、层级、背景、居中）', () => {
    const s = overlayStyle();
    expect(s).toContain('position:fixed;inset:0;z-index:999997');
    expect(s).toContain('background:var(--overlay-bg, rgba(0,0,0,0.3))');
    expect(s).toContain('display:flex;align-items:center;justify-content:center');
  });

  it('差异属性经 extra 追加在背景与居中之间', () => {
    const s = overlayStyle('backdrop-filter:blur(4px);transition:opacity 0.2s;');
    expect(s).toContain('background:var(--overlay-bg, rgba(0,0,0,0.3));backdrop-filter:blur(4px);');
    expect(s).toContain('transition:opacity 0.2s;display:flex');
  });
});
