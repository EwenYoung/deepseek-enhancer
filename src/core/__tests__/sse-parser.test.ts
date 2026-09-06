import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSSEChunk,
  extractToolCalls,
  stripToolCalls,
  stripTaskComplete,
  accumulateText,
  resetAccumulator,
  createAccumulateState,
  type AccumulateState,
} from '../sse-parser';

describe('parseSSEChunk', () => {
  it('parses [DONE] marker as finished message', () => {
    const result = parseSSEChunk('data: [DONE]');
    expect(result).toEqual({ text: '', toolCalls: [], finished: true });
  });

  it('extracts delta content from OpenAI-compatible format', () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
    const result = parseSSEChunk(chunk);
    expect(result?.text).toBe('你好');
    expect(result?.finished).toBe(false);
  });

  it('detects finish_reason: stop', () => {
    const chunk = 'data: {"choices":[{"finish_reason":"stop","delta":{}}]}';
    const result = parseSSEChunk(chunk);
    expect(result?.finished).toBe(true);
  });

  it('detects finish_reason: length', () => {
    const chunk = 'data: {"choices":[{"finish_reason":"length","delta":{}}]}';
    const result = parseSSEChunk(chunk);
    expect(result?.finished).toBe(true);
  });

  it('handles multiple data lines in one chunk', () => {
    const chunk =
      'data: {"choices":[{"delta":{"content":"A"}}]}\ndata: {"choices":[{"delta":{"content":"B"}}]}';
    const result = parseSSEChunk(chunk);
    // Second data line wins (last value for each key in JSON merge)
    // Actually the lines are joined with \n, so JSON.parse fails
    // Multiline join produces invalid JSON, so it returns null
    expect(result).toBeNull();
  });

  it('handles DeepSeek patch format with APPEND op', () => {
    const chunk = 'data: {"response":{"fragments":[{"o":"APPEND","path":"content","v":"hello"}]}}';
    const result = parseSSEChunk(chunk);
    expect(result?.text).toBe('hello');
  });

  it('handles DeepSeek patch format with append (lowercase) op', () => {
    const chunk = 'data: {"response":{"fragments":[{"o":"append","path":"content","v":"world"}]}}';
    const result = parseSSEChunk(chunk);
    expect(result?.text).toBe('world');
  });

  it('handles new array-fragment format (opening < of tool tag)', () => {
    // DeepSeek 新格式：开标签 `<` 以数组形式到达（{"p":"response/fragments","o":"APPEND","v":[{type:"RESPONSE",content:"<"}]}）
    const chunk =
      'data: {"p":"response/fragments","o":"APPEND","v":[{"id":3,"type":"RESPONSE","content":"<","references":[],"stage_id":1}]}';
    const result = parseSSEChunk(chunk);
    expect(result?.text).toBe('<');
  });

  it('handles new array-fragment format with THINK type (skipped)', () => {
    const chunk =
      'data: {"p":"response/fragments","o":"APPEND","v":[{"id":2,"type":"THINK","content":"思考内容","stage_id":1}]}';
    const result = parseSSEChunk(chunk);
    expect(result?.text).toBe('');
  });

  it('detects new format FINISHED via response/status SET', () => {
    const chunk = 'data: {"p":"response/status","o":"SET","v":"FINISHED"}';
    const result = parseSSEChunk(chunk);
    expect(result?.finished).toBe(true);
    // 回归保护：SET 状态行不得当作文本进 buffer（M1 ponytail 漂移防线）
    expect(result?.text).toBe('');
  });

  it('extracts tool calls from mixed new-format stream (array fragment + string v)', () => {
    // 复现本次 bug：开标签 `<` 走数组行，其余字符走裸 string v 行
    // 旧实现跳过数组行 → 文本缺 `<` → 工具检出失败
    const line1 =
      'data: {"p":"response/fragments","o":"APPEND","v":[{"type":"RESPONSE","content":"<"}]}';
    const line2 =
      'data: {"v":"doc_generate>{\\"title\\":\\"t\\",\\"content\\":\\"# hi\\"}</doc_generate>"}';
    const t1 = parseSSEChunk(line1);
    const t2 = parseSSEChunk(line2);
    const assembled = (t1?.text || '') + (t2?.text || '');
    expect(assembled).toBe('<doc_generate>{"title":"t","content":"# hi"}</doc_generate>');
    const calls = extractToolCalls(assembled);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('doc_generate');
    expect(calls[0].payload).toEqual({ title: 't', content: '# hi' });
  });

  it('handles DeepSeek patch format FINISHED status', () => {
    const chunk = 'data: {"response":{"status":"FINISHED","fragments":[]}}';
    const result = parseSSEChunk(chunk);
    expect(result?.finished).toBe(true);
  });

  it('ignores non-content paths in patch format', () => {
    const chunk = 'data: {"response":{"fragments":[{"o":"APPEND","path":"title","v":"ignored"}]}}';
    const result = parseSSEChunk(chunk);
    expect(result?.text).toBe('');
  });

  it('extracts token usage', () => {
    const chunk =
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}';
    const result = parseSSEChunk(chunk);
    expect(result?.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('returns null for non-JSON data', () => {
    const result = parseSSEChunk('data: just some text');
    expect(result).toBeNull();
  });

  it('returns null for empty chunk', () => {
    const result = parseSSEChunk('');
    expect(result).toBeNull();
  });

  it('returns null for chunk with no data lines', () => {
    const result = parseSSEChunk('event: message\nid: 1');
    expect(result).toBeNull();
  });
});

describe('extractToolCalls', () => {
  it('extracts web_search with JSON payload', () => {
    const text = 'Let me search for this <web_search>{"query":"latest AI news"}</web_search>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('web_search');
    expect(calls[0].payload).toEqual({ query: 'latest AI news' });
  });

  it('extracts web_fetch with URL payload', () => {
    const text = '<web_fetch>{"url":"https://example.com"}</web_fetch>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('web_fetch');
    expect(calls[0].payload).toEqual({ url: 'https://example.com' });
  });

  it('handles missing closing tag (DeepSeek quirk)', () => {
    const text = '<web_search>{"query":"test"}';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('web_search');
    expect(calls[0].payload).toEqual({ query: 'test' });
  });

  it('extracts multiple tool calls', () => {
    const text =
      '<web_search>{"query":"A"}</web_search> some text <web_fetch>{"url":"B"}</web_fetch>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe('web_search');
    expect(calls[1].name).toBe('web_fetch');
  });

  it('returns empty array for text with no tool calls', () => {
    const calls = extractToolCalls('just some regular text');
    expect(calls).toEqual([]);
  });

  it('handles malformed JSON payload gracefully', () => {
    const text = '<web_search>{not valid json}</web_search>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({});
  });

  it('ignores array JSON payload (regex only matches {})', () => {
    const text = '<web_search>[1,2,3]</web_search>';
    const calls = extractToolCalls(text);
    expect(calls).toEqual([]);
  });

  it('generates unique IDs for each call', () => {
    const text = '<web_search>{"q":"a"}</web_search><web_search>{"q":"b"}</web_search>';
    const calls = extractToolCalls(text);
    expect(calls[0].id).not.toBe(calls[1].id);
  });

  it('extracts doc_generate with content payload', () => {
    const text = '<doc_generate>{"title":"report","content":"# Hello"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('doc_generate');
    expect(calls[0].payload).toEqual({ title: 'report', content: '# Hello' });
  });

  it('handles nested braces in JSON string values (LaTeX content)', () => {
    // 模型输出的 JSON 里反斜杠是转义的（\\int），JS 源码需写 \\\\ 才表示两个反斜杠字符
    const text =
      '<doc_generate>{"title":"math","content":"\\\\int_{0}^{\\\\infty} e^{-x^2} dx = \\\\frac{\\\\sqrt{\\\\pi}}{2}"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('doc_generate');
    expect(calls[0].payload).toEqual({
      title: 'math',
      content: '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
    });
  });

  it('handles braces in both title and content', () => {
    const text = '<web_fetch>{"url":"https://example.com/a{b}c","headers":{"x":"}"}}</web_fetch>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('web_fetch');
    expect(calls[0].payload).toEqual({
      url: 'https://example.com/a{b}c',
      headers: { x: '}' },
    });
  });

  it('handles escaped quotes inside JSON string values', () => {
    const text = '<doc_generate>{"title":"t","content":"say \\"hi\\" {braces}"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({ title: 't', content: 'say "hi" {braces}' });
  });
});

describe('extractToolCalls 宽松解析兜底（doc_generate 下载链路）', () => {
  it('content 含未转义真实换行 → 宽松解析成功', () => {
    const text = '<doc_generate>{"title":"t","content":"# 标题\n\n正文"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('doc_generate');
    expect(calls[0].payload).toEqual({ title: 't', content: '# 标题\n\n正文' });
  });

  it('content 含 Tab → 宽松解析成功', () => {
    const text = '<doc_generate>{"title":"t","content":"a\tb"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls[0].payload).toEqual({ title: 't', content: 'a\tb' });
  });

  it('尾逗号 → 宽松解析成功', () => {
    const text = '<doc_generate>{"title":"t","content":"x",}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls[0].payload).toEqual({ title: 't', content: 'x' });
  });

  it('正文含假 <doc_generate> 字样（无 JSON）→ 跳过并找到真标签', () => {
    const text =
      '参考 <doc_generate> 标签说明，实际调用：<doc_generate>{"title":"t","content":"x"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({ title: 't', content: 'x' });
  });

  it('content 内含 </doc_generate> 字样 → 不影响闭合匹配', () => {
    const text =
      '<doc_generate>{"title":"t","content":"用法：</doc_generate> 是闭合标签"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({ title: 't', content: '用法：</doc_generate> 是闭合标签' });
  });

  it('content 含转义引号与嵌套对象 → 完整保留', () => {
    const text =
      '<doc_generate>{"title":"t","content":"say \\"hi\\" {braces}","meta":{"k":"v"}}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls[0].payload).toEqual({
      title: 't',
      content: 'say "hi" {braces}',
      meta: { k: 'v' },
    });
  });

  it('content 含 emoji / CJK / 反引号 → 完整保留', () => {
    const text = '<doc_generate>{"title":"报告","content":"`code` 🚀 中文测试"}</doc_generate>';
    const calls = extractToolCalls(text);
    expect(calls[0].payload).toEqual({ title: '报告', content: '`code` 🚀 中文测试' });
  });
});

describe('stripTaskComplete（旧数据兜底）', () => {
  it('stripTaskComplete 完整移除含花括号的标记', () => {
    const text = '前置 <task_complete>{"summary":"a {b} c"}</task_complete> 后置';
    expect(stripTaskComplete(text)).toBe('前置  后置');
  });

  it('stripTaskComplete 保留普通文本', () => {
    const text = '纯文本无标记';
    expect(stripTaskComplete(text)).toBe('纯文本无标记');
  });
});

describe('stripToolCalls', () => {
  it('removes all tool call XML tags', () => {
    const text =
      'Before <web_search>{"q":"x"}</web_search> middle <web_fetch>{"url":"y"}</web_fetch> after';
    const result = stripToolCalls(text);
    expect(result).toBe('Before  middle  after');
  });

  it('removes tool calls without closing tags', () => {
    const text = 'text <web_search>{"q":"x"}';
    const result = stripToolCalls(text);
    expect(result).toBe('text');
  });

  it('returns original text unchanged when no tool calls', () => {
    const text = 'just regular text without any tags';
    expect(stripToolCalls(text)).toBe(text);
  });

  it('trims whitespace from result', () => {
    const text = '  <web_search>{"q":"x"}</web_search>  ';
    expect(stripToolCalls(text)).toBe('');
  });
});

describe('accumulateText', () => {
  let state: AccumulateState;

  beforeEach(() => {
    state = createAccumulateState();
  });

  it('accumulates text across multiple calls', () => {
    const r1 = accumulateText('Hello ', state);
    expect(r1.text).toContain('Hello');

    const r2 = accumulateText('World', state);
    expect(r2.text).toContain('Hello');
    expect(r2.text).toContain('World');
  });

  it('detects tool calls in accumulated text', () => {
    const r1 = accumulateText('Before <web_se', state);
    expect(r1.toolCalls).toEqual([]);

    const r2 = accumulateText('arch>{"q":"test"}</web_search>', state);
    expect(r2.toolCalls).toHaveLength(1);
    expect(r2.toolCalls[0].name).toBe('web_search');
  });

  it('strips tool calls from accumulated text', () => {
    accumulateText('text <web_search>{"q":"x"}</web_search>', state);
    const result = accumulateText(' more', state);
    expect(result.text).not.toContain('<web_search>');
    expect(result.text).toContain('text');
    expect(result.text).toContain('more');
  });

  it('resetAccumulator clears accumulated state', () => {
    accumulateText('some text', state);
    resetAccumulator(state);
    const result = accumulateText('fresh', state);
    expect(result.text).toBe('fresh');
  });

  it('does not share state across independent instances', () => {
    const state2 = createAccumulateState();
    accumulateText('A', state);
    accumulateText('B', state2);
    expect(state.accumulatedText).not.toContain('B');
    expect(state2.accumulatedText).not.toContain('A');
  });
});
