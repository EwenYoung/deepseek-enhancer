// ui-collapse 的 DOM 部分依赖真实页面结构（.ds-message / 流式渲染），只测纯函数：
// findToolCallRegion 的区间定位是折叠功能正确性的核心。
import { describe, it, expect } from 'vitest';
import { findToolCallRegion } from '../ui-collapse';
import { toolNames } from '../tool-descriptors';

describe('findToolCallRegion', () => {
  it('定位单个完整工具调用区间（含关闭标签）', () => {
    const text = '前言\n<doc_generate>{"title":"a","content":"x"}</doc_generate>';
    const region = findToolCallRegion(text);
    expect(region).toEqual({ name: 'doc_generate', start: 3, end: text.length });
    expect(text.slice(region!.start, region!.end)).toBe(
      '<doc_generate>{"title":"a","content":"x"}</doc_generate>',
    );
  });

  it('多个标签时取起点最靠前的完整区间', () => {
    const text = '<web_search>{"query":"q"}</web_search> 中间 <doc_generate>{}</doc_generate>';
    const region = findToolCallRegion(text);
    expect(region?.name).toBe('web_search');
    expect(region?.start).toBe(0);
  });

  it('只有开标签（流式未完成）时返回 null', () => {
    expect(findToolCallRegion('正文 <doc_generate>{"title":"a"')).toBeNull();
  });

  it('只有闭标签时返回 null', () => {
    expect(findToolCallRegion('正文 </doc_generate> 结束')).toBeNull();
  });

  it('闭标签在开标签之前时返回 null', () => {
    expect(findToolCallRegion('</doc_generate> 前缀 <doc_generate>')).toBeNull();
  });

  it('识别 task_complete 标记', () => {
    const text = '结论 <task_complete>{"summary":"完成"}</task_complete>';
    const region = findToolCallRegion(text);
    expect(region?.name).toBe('task_complete');
    expect(region?.start).toBe(3);
  });

  it('无任何标签时返回 null', () => {
    expect(findToolCallRegion('普通回复文本')).toBeNull();
  });

  it('默认标签表覆盖全部工具与 task_complete', () => {
    // 通过行为验证：每个工具名都能被检出
    for (const name of toolNames) {
      const text = 'x <' + name + '>{}</' + name + '> y';
      expect(findToolCallRegion(text)?.name).toBe(name);
    }
  });
});
