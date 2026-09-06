// resolveDocPlan：doc_generate 调用 → 落盘计划。重点覆盖真实故障样本：
// 模型输出 format=html 时 content 内层引号不转义（非法 JSON），payload 解析失败
// 后靠 raw 宽松恢复；早期实现用严格正则提取，会在 lang= 后第一个引号处截断。
import { describe, it, expect } from 'vitest';
import { resolveDocPlan, extractContentFromRaw } from '../doc-generate';

// 与线上样本同构：JSON 字符串值里含未转义引号 + 两字符转义 \n
const RAW_HTML_BROKEN_JSON =
  '<doc_generate>{"title": "HTML测试页面", "format": "html", "content": "<!DOCTYPE html>\\n<html lang="zh-CN">\\n<style>body { color: red; }</style>\\n</html>"}</doc_generate>';
const HTML_BODY_EXPECTED =
  '<!DOCTYPE html>\n<html lang="zh-CN">\n<style>body { color: red; }</style>\n</html>';

describe('resolveDocPlan', () => {
  it('合法 md payload：文件名/内容/格式按 payload 走', () => {
    const plan = resolveDocPlan(
      '<doc_generate>{"title": "示例文档", "format": "md", "content": "# 示例\\n正文"}</doc_generate>',
      { title: '示例文档', format: 'md', content: '# 示例\n正文' },
    );
    expect(plan).not.toBeNull();
    expect(plan!.filename).toBe('示例文档.md');
    expect(plan!.format).toBe('md');
    expect(plan!.content).toBe('# 示例\n正文');
    expect(plan!.out).toBe('# 示例\n正文');
  });

  it('payload 解析失败（未转义内层引号）：从 raw 恢复 title/format，content 不截断', () => {
    const plan = resolveDocPlan(RAW_HTML_BROKEN_JSON, {});
    expect(plan).not.toBeNull();
    expect(plan!.format).toBe('html');
    expect(plan!.filename).toBe('HTML测试页面.html');
    expect(plan!.content).toBe(HTML_BODY_EXPECTED);
    expect(plan!.out).toBe(HTML_BODY_EXPECTED);
  });

  it('去重键稳定：payload 路径与 raw 兜底路径、raw 带不带闭合标签，键一致', () => {
    const content = '# 示例\n正文';
    const rawNoClose =
      '<doc_generate>{"title": "示例文档", "format": "md", "content": "# 示例\\n正文"}';
    const rawWithClose = rawNoClose + '</doc_generate>';
    const viaPayload = resolveDocPlan(undefined, {
      title: '示例文档',
      format: 'md',
      content,
    });
    const viaRawNoClose = resolveDocPlan(rawNoClose, {});
    const viaRawWithClose = resolveDocPlan(rawWithClose, {});
    expect(viaPayload!.key).toBe(viaRawNoClose!.key);
    expect(viaRawNoClose!.key).toBe(viaRawWithClose!.key);
  });

  it('format 声明成 md 但内容是完整 HTML：嗅探纠正为 html', () => {
    const plan = resolveDocPlan(undefined, {
      title: '页面',
      format: 'md',
      content: '<!DOCTYPE html>\n<html><body>hi</body></html>',
    });
    expect(plan!.format).toBe('html');
    expect(plan!.filename).toBe('页面.html');
  });

  it('声明 html 但内容是 Markdown：兜底渲染成完整 HTML 文档', () => {
    const plan = resolveDocPlan(undefined, {
      title: '笔记',
      format: 'html',
      content: '# 笔记\n正文',
    });
    expect(plan!.out).toMatch(/^<!DOCTYPE html>/);
    expect(plan!.out).toContain('<h1>笔记</h1>');
  });

  it('title 含非法文件名字符时清洗；content 缺失返回 null', () => {
    const plan = resolveDocPlan(undefined, { title: 'a/b:c', format: 'md', content: 'hi' });
    expect(plan!.filename).toBe('abc.md');
    expect(resolveDocPlan(undefined, { title: 'x' })).toBeNull();
  });
});

describe('extractContentFromRaw', () => {
  it('合法转义 JSON 正常解码', () => {
    expect(extractContentFromRaw('{"content": "a\\nb\\"c"}')).toBe('a\nb"c');
  });

  it('未转义内层引号取到完整值，而非在第一个引号处截断', () => {
    expect(extractContentFromRaw(RAW_HTML_BROKEN_JSON)).toBe(HTML_BODY_EXPECTED);
  });

  it('无 content 字段或非字符串值返回空串', () => {
    expect(extractContentFromRaw('{"title": "x"}')).toBe('');
    expect(extractContentFromRaw('{"content": 42}')).toBe('');
    expect(extractContentFromRaw(undefined)).toBe('');
  });
});
