import { describe, it, expect } from 'vitest';
import { isCompleteHtmlDocument, markdownToHtmlDoc, renderMarkdownToHTML } from '../markdown';

describe('isCompleteHtmlDocument', () => {
  it('recognizes doctype prefix', () => {
    expect(isCompleteHtmlDocument('<!DOCTYPE html>\n<html>...</html>')).toBe(true);
  });

  it('is case-insensitive and allows leading whitespace', () => {
    expect(isCompleteHtmlDocument('\n  <!doctype html>')).toBe(true);
  });

  it('recognizes bare <html> tag', () => {
    expect(isCompleteHtmlDocument('<html lang="zh-CN">')).toBe(true);
  });

  it('rejects markdown and empty content', () => {
    expect(isCompleteHtmlDocument('# 标题\n正文')).toBe(false);
    expect(isCompleteHtmlDocument('')).toBe(false);
  });
});

describe('markdownToHtmlDoc', () => {
  it('wraps markdown into a complete styled document', () => {
    const doc = markdownToHtmlDoc('测试报告', '# 报告\n**正文**');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('<title>测试报告</title>');
    expect(doc).toContain('<style>');
    expect(doc).toContain('<h1>报告</h1>');
    expect(doc).toContain('<strong>正文</strong>');
  });

  it('escapes html-sensitive characters in title', () => {
    const doc = markdownToHtmlDoc('<script>alert(1)</script>', '# ok');
    expect(doc).not.toContain('<script>alert(1)</script>');
    expect(doc).toContain('&lt;script&gt;');
  });

  it('escapes code block content', () => {
    const doc = markdownToHtmlDoc('t', '```\n<div>x</div>\n```');
    expect(doc).toContain('&lt;div&gt;x&lt;/div&gt;');
  });
});

describe('renderMarkdownToHTML', () => {
  it('renders headings, bold and links', () => {
    const html = renderMarkdownToHTML('# 标题\n**粗体** [链接](https://example.com)');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<strong>粗体</strong>');
    expect(html).toContain('<a href="https://example.com"');
  });

  it('renders blockquote and table', () => {
    const html = renderMarkdownToHTML('> 引用\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<table><thead><tr><th>a</th><th>b</th></tr>');
  });

  it('rejects javascript: links', () => {
    const html = renderMarkdownToHTML('[x](javascript:alert(1))');
    expect(html).not.toContain('<a href="javascript:');
  });
});
