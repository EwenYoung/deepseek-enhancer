import { describe, it, expect } from 'vitest';
import { parseSkillMD, hashStr } from '../skill-importer';
import type { Skill } from '../types';

describe('parseSkillMD', () => {
  it('parses frontmatter name and description', () => {
    const md = `---
name: my-skill
description: A test skill
---
Here are the instructions.`;
    const result = parseSkillMD(md);
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('A test skill');
    expect(result.instructions).toBe('Here are the instructions.');
    expect(result.source).toBe('custom');
    expect(result.enabled).toBe(true);
  });

  it('falls back to first heading as name when no frontmatter name', () => {
    const md = `# My Awesome Skill

Do this, then that.`;
    const result = parseSkillMD(md);
    expect(result.name).toBe('my-awesome-skill');
  });

  it('derives name from first line (not heading) when no frontmatter', () => {
    const md = `Just some instructions here.
More instructions follow.`;
    const result = parseSkillMD(md);
    expect(result.name).toBe('just-some-instructions-here');
  });

  it('falls back to "imported-skill" name when content is empty', () => {
    const result = parseSkillMD('');
    expect(result.name).toBe('imported-skill');
  });

  it('uses instructions as content when no frontmatter', () => {
    const md = `These are the skill instructions.`;
    const result = parseSkillMD(md);
    expect(result.instructions).toBe('These are the skill instructions.');
  });

  it('splits frontmatter and instructions correctly', () => {
    const md = `---
name: test
---


Instructions with blank lines above.`;
    const result = parseSkillMD(md);
    expect(result.name).toBe('test');
    expect(result.instructions).toContain('Instructions with blank lines above.');
  });

  it('handles multiline instructions', () => {
    const md = `---
name: multiline
description: Test
---

Line 1
Line 2
Line 3`;
    const result = parseSkillMD(md);
    expect(result.instructions).toBe('Line 1\nLine 2\nLine 3');
  });

  it('defaults description to name when no description in frontmatter', () => {
    const md = `---
name: only-name
---
Instructions`;
    const result = parseSkillMD(md);
    expect(result.description).toBe('only-name');
  });

  it('strips Chinese characters correctly in slug generation', () => {
    const md = `# 我的技能助手`;
    const result = parseSkillMD(md);
    // Chinese chars preserved, spaces/symbols replaced with hyphens
    expect(result.name).toContain('我的技能助手');
  });
});

describe('hashStr', () => {
  it('returns a non-empty string', () => {
    const result = hashStr('hello');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('produces consistent output for same input', () => {
    expect(hashStr('test')).toBe(hashStr('test'));
  });

  it('produces different output for different input', () => {
    expect(hashStr('hello')).not.toBe(hashStr('world'));
  });

  it('handles empty string', () => {
    const result = hashStr('');
    expect(result).toBe('0');
  });

  it('returns base36 string', () => {
    const result = hashStr('some-long-string-here');
    expect(result).toMatch(/^[0-9a-z]+$/);
  });
});
