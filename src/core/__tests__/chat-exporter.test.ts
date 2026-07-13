import { describe, it, expect } from 'vitest';
import { wrapToolResultMD, slugify } from '../chat-exporter';

describe('wrapToolResultMD', () => {
  it('wraps tool result block in code fence', () => {
    const input = 'User message\n[工具执行结果]\nSearch result here\n---';
    const result = wrapToolResultMD(input);
    expect(result).toContain('```');
    expect(result).toContain('[工具执行结果]');
    expect(result).toContain('Search result here');
    expect(result).toContain('---');
  });

  it('wraps tool result without trailing ---', () => {
    const input = '[工具执行结果]\nSome result text';
    const result = wrapToolResultMD(input);
    expect(result).toContain('```\n[工具执行结果]\nSome result text\n```');
  });

  it('returns text unchanged when no tool result present', () => {
    const input = 'Regular user message\nNo tool results here.';
    expect(wrapToolResultMD(input)).toBe(input);
  });

  it('handles multiple tool result blocks', () => {
    const input = 'Msg1\n[工具执行结果]\nResult1\n---\nMsg2\n[工具执行结果]\nResult2\n---';
    const result = wrapToolResultMD(input);
    // Both blocks should be wrapped
    const fenceCount = (result.match(/```/g) || []).length;
    expect(fenceCount).toBe(4); // 2 opening + 2 closing
  });

  it('handles empty string', () => {
    expect(wrapToolResultMD('')).toBe('');
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces special chars with hyphens', () => {
    expect(slugify('hello!@#world')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('deep seek chat')).toBe('deep-seek-chat');
  });

  it('preserves Chinese characters', () => {
    expect(slugify('DeepSeek 聊天助手')).toBe('deepseek-聊天助手');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('truncates to 40 characters', () => {
    const long = 'a-very-long-title-that-goes-on-and-on-and-should-be-cut-off-at-forty';
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});
