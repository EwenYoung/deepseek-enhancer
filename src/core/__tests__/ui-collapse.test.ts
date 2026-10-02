// ui-collapse 的 DOM 部分（观察器、打标、点击委托）不做单测：依赖真实页面结构
// （.ds-message / 虚拟列表 / 流式渲染 / ::before 伪元素点击目标），当前 vitest
// 环境是 node，无 jsdom。这里只覆盖纯逻辑。
import { describe, it, expect } from 'vitest';
import {
  findToolCallSpans,
  classifyFoldableBlock,
  buildFoldLabel,
  buildCodeFoldLabel,
  hasTextOutsideSpans,
} from '../ui-collapse';
import { toolNames } from '../tool-descriptors';

describe('findToolCallSpans', () => {
  it('定位完整工具调用区间（含闭合标签）', () => {
    const text = '前言\n<doc_generate>{"title":"a","content":"x"}</doc_generate>';
    expect(findToolCallSpans(text)).toEqual([{ name: 'doc_generate', start: 3, end: text.length }]);
  });

  it('闭合标签缺失时仍能定位区间（JSON 之后即为区间末尾）', () => {
    const text = '<doc_generate>{"title":"a","format":"html","content":"<h1>x</h1>"}';
    expect(findToolCallSpans(text)).toEqual([{ name: 'doc_generate', start: 0, end: text.length }]);
  });

  it('闭合标签前的空白计入区间', () => {
    const text = '<news_hub>{"query":"q"}  \n</news_hub>';
    expect(findToolCallSpans(text)).toEqual([{ name: 'news_hub', start: 0, end: text.length }]);
  });

  it('找出多个工具调用并保持出现顺序', () => {
    const text = '<news_hub>{"query":"q"}</news_hub> <doc_generate>{"title":"t"}</doc_generate>';
    const spans = findToolCallSpans(text);
    expect(spans.map((span) => span.name)).toEqual(['news_hub', 'doc_generate']);
    expect(spans[1].end).toBe(text.length);
  });

  it('JSON 含嵌套花括号、字符串内花括号与转义引号时仍完整切出', () => {
    const text =
      '<doc_generate>{"content":"say \\"hi\\" and \\\\ path","code":"if (a) { b }","nested":{"a":{"b":1}}}</doc_generate>';
    expect(findToolCallSpans(text)).toEqual([{ name: 'doc_generate', start: 0, end: text.length }]);
  });

  it('JSON 未闭合（流式输出中段）时区间延到文本末尾，保证立即折叠', () => {
    const text = '<doc_generate>{"title":"a"';
    expect(findToolCallSpans(text)).toEqual([{ name: 'doc_generate', start: 0, end: text.length }]);
  });

  it('流式未闭合的区间外无正文时判定可折叠（边输出边折）', () => {
    const text = '<doc_generate>{"title":"a","content":"<h1>x';
    expect(classifyFoldableBlock(text, findToolCallSpans(text))).toEqual({
      foldable: true,
      toolNames: ['doc_generate'],
    });
  });

  it('JSON 闭合后区间终点回到实际调用末尾', () => {
    const text = '<doc_generate>{"title":"a"} 后续正文';
    const spans = findToolCallSpans(text);
    expect(spans).toEqual([
      { name: 'doc_generate', start: 0, end: '<doc_generate>{"title":"a"}'.length },
    ]);
  });

  it('标签后没有 JSON 时跳过该标签', () => {
    expect(findToolCallSpans('<news_hub> 没有 JSON')).toEqual([]);
  });

  it('无标签时返回空', () => {
    expect(findToolCallSpans('普通回复文本')).toEqual([]);
  });

  it('默认标签表覆盖全部工具', () => {
    for (const name of toolNames) {
      const text = 'x <' + name + '>{}</' + name + '> y';
      expect(findToolCallSpans(text).map((span) => span.name)).toEqual([name]);
    }
  });
});

describe('classifyFoldableBlock', () => {
  const call = '<doc_generate>{"title":"t"}</doc_generate>';

  it('区间外只有空白时可折叠', () => {
    expect(
      classifyFoldableBlock('  \n' + call + '\n  ', findToolCallSpans('  \n' + call + '\n  ')),
    ).toEqual({ foldable: true, toolNames: ['doc_generate'] });
  });

  it('区间外有正文时不折叠', () => {
    const text = '下面是文档：' + call;
    expect(classifyFoldableBlock(text, findToolCallSpans(text))).toEqual({
      foldable: false,
      toolNames: ['doc_generate'],
    });
  });

  it('无工具区间时不折叠', () => {
    expect(classifyFoldableBlock('纯正文', [])).toEqual({ foldable: false, toolNames: [] });
  });

  it('工具名去重且保持出现顺序', () => {
    const text =
      '<news_hub>{"query":"a"}</news_hub> <doc_generate>{"title":"t"}</doc_generate> <news_hub>{"query":"b"}</news_hub>';
    expect(classifyFoldableBlock(text, findToolCallSpans(text)).toolNames).toEqual([
      'news_hub',
      'doc_generate',
    ]);
  });
});

describe('buildFoldLabel', () => {
  it('折叠态用 ▸ 并列出全部工具名', () => {
    expect(buildFoldLabel(['doc_generate', 'news_hub'], false)).toBe(
      '▸ 工具调用 doc_generate、news_hub',
    );
  });

  it('展开态用 ▾', () => {
    expect(buildFoldLabel(['doc_generate'], true)).toBe('▾ 工具调用 doc_generate');
  });

  it('无工具名时只留前缀', () => {
    expect(buildFoldLabel([], false)).toBe('▸ 工具调用');
  });
});

describe('buildCodeFoldLabel', () => {
  it('带行数与展开箭头', () => {
    expect(buildCodeFoldLabel(20, false)).toBe('▸ 代码块（20 行）');
    expect(buildCodeFoldLabel(20, true)).toBe('▾ 代码块（20 行）');
  });
});

describe('hasTextOutsideSpans', () => {
  it('空串视为无区间外文本', () => {
    expect(hasTextOutsideSpans('', [])).toBe(false);
  });

  it('全空白视为无区间外文本', () => {
    expect(hasTextOutsideSpans('  \n\t ', [])).toBe(false);
  });

  it('无区间但含文本时判定为有文本', () => {
    expect(hasTextOutsideSpans('正文', [])).toBe(true);
  });

  it('区间外的正文不算忽略', () => {
    const text = '前 <news_hub>{"query":"q"}</news_hub> 后';
    expect(hasTextOutsideSpans(text, findToolCallSpans(text))).toBe(true);
  });

  it('区间紧贴文本两端时判定为无区间外文本', () => {
    const text = '<news_hub>{"query":"q"}</news_hub>';
    expect(hasTextOutsideSpans(text, findToolCallSpans(text))).toBe(false);
  });
});
