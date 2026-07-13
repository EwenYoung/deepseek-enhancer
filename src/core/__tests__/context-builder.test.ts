import { describe, it, expect } from 'vitest';
import { parseSkillCommand, buildContextPrefix } from '../context-builder';
import type { InjectionContext } from '../types';

describe('parseSkillCommand', () => {
  it('parses /skillname from text', () => {
    const result = parseSkillCommand('/code-review explain this code');
    expect(result).toEqual({
      skillName: 'code-review',
      args: 'explain this code',
    });
  });

  it('parses single skill name without args', () => {
    const result = parseSkillCommand('/writer');
    expect(result).toEqual({
      skillName: 'writer',
      args: '',
    });
  });

  it('parses skill name with trailing space', () => {
    const result = parseSkillCommand('/researcher ');
    expect(result).toEqual({
      skillName: 'researcher',
      args: '',
    });
  });

  it('returns null for text without slash prefix', () => {
    expect(parseSkillCommand('hello world')).toBeNull();
  });

  it('returns null for text with slash not at start', () => {
    expect(parseSkillCommand('hello /code-review')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSkillCommand('')).toBeNull();
  });

  it('handles kebab-case skill names', () => {
    const result = parseSkillCommand('/ultra-think deeply about life');
    expect(result).toEqual({
      skillName: 'ultra-think',
      args: 'deeply about life',
    });
  });

  it('handles multiline args', () => {
    const result = parseSkillCommand('/writer line1\nline2\nline3');
    expect(result).toEqual({
      skillName: 'writer',
      args: 'line1\nline2\nline3',
    });
  });

  it('stops skill name at non-word, non-hyphen char', () => {
    const result = parseSkillCommand('/code@review test');
    expect(result).toEqual({
      skillName: 'code',
      args: '@review test',
    });
  });
});

describe('buildContextPrefix', () => {
  it('joins tool definitions and skill instructions with separator', () => {
    const ctx: InjectionContext = {
      toolDefinitions: '<web_search>\n  params:\n    query: search query</web_search>',
      skillInstructions: 'You are a helpful assistant.',
    };
    const result = buildContextPrefix(ctx);
    expect(result).toContain('<web_search>');
    expect(result).toContain('You are a helpful assistant.');
    expect(result).toContain('---');
  });

  it('returns only tool definitions when no skill instructions', () => {
    const ctx: InjectionContext = {
      toolDefinitions: '<web_search>...</web_search>',
      skillInstructions: '',
    };
    const result = buildContextPrefix(ctx);
    expect(result).toContain('<web_search>');
    expect(result).toContain('---');
    expect(result).not.toContain('You are');
  });

  it('returns only skill instructions when no tool definitions', () => {
    const ctx: InjectionContext = {
      toolDefinitions: '',
      skillInstructions: 'Be concise.',
    };
    const result = buildContextPrefix(ctx);
    expect(result).toContain('Be concise.');
    expect(result).toContain('---');
  });

  it('returns empty string when both are empty', () => {
    const ctx: InjectionContext = {
      toolDefinitions: '',
      skillInstructions: '',
    };
    expect(buildContextPrefix(ctx)).toBe('');
  });
});
