import { describe, it, expect } from 'vitest';
import {
  TOOL_DESCRIPTORS,
  getToolByName,
  toolNames,
  BACKGROUND_TOOLS,
  buildToolDefsJson,
  escapeInjectedJson,
} from '../tool-descriptors';

describe('tool-descriptors 唯一事实源', () => {
  it('工具名唯一且非空', () => {
    const names = TOOL_DESCRIPTORS.map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n.trim().length).toBeGreaterThan(0);
  });

  it('toolNames 与描述符一一对应', () => {
    expect(toolNames).toEqual(TOOL_DESCRIPTORS.map((t) => t.name));
  });

  it('每个描述符都有合法 execution 字段', () => {
    for (const t of TOOL_DESCRIPTORS) {
      expect(['background', 'local']).toContain(t.execution);
    }
  });

  it('background 工具 = 除 doc_generate 外的全部，local = doc_generate', () => {
    expect(BACKGROUND_TOOLS.map((t) => t.name).sort()).toEqual(
      TOOL_DESCRIPTORS.filter((t) => t.name !== 'doc_generate')
        .map((t) => t.name)
        .sort(),
    );
    const doc = getToolByName('doc_generate');
    expect(doc?.execution).toBe('local');
  });

  it('getToolByName 命中返回描述符，未命中返回 undefined', () => {
    const web = getToolByName('web_search');
    expect(web).toBeDefined();
    expect(web?.label).toBe('联网搜索');
    expect(getToolByName('not_a_tool')).toBeUndefined();
  });

  it('getToolByName 与 BACKGROUND_TOOLS 引用同一批对象', () => {
    for (const t of BACKGROUND_TOOLS) {
      expect(getToolByName(t.name)).toBe(t);
    }
  });
});

describe('buildToolDefsJson（IIFE 注入用精简定义）', () => {
  it('可 JSON.parse，数组长度与事实源一致且顺序一致', () => {
    const parsed = JSON.parse(buildToolDefsJson()) as Array<Record<string, unknown>>;
    expect(parsed.length).toBe(TOOL_DESCRIPTORS.length);
    expect(parsed.map((d) => d.name)).toEqual(TOOL_DESCRIPTORS.map((t) => t.name));
  });

  it('每条 name/label 与事实源一致', () => {
    const parsed = JSON.parse(buildToolDefsJson()) as Array<{
      name: string;
      label: string;
    }>;
    for (let i = 0; i < parsed.length; i++) {
      expect(parsed[i].name).toBe(TOOL_DESCRIPTORS[i].name);
      expect(parsed[i].label).toBe(TOOL_DESCRIPTORS[i].label);
    }
  });

  it('params 键与事实源 parameters 键一致，desc 与 description 一致', () => {
    const parsed = JSON.parse(buildToolDefsJson()) as Array<{
      params: Record<string, { desc: string }>;
    }>;
    for (let i = 0; i < parsed.length; i++) {
      const source = TOOL_DESCRIPTORS[i];
      expect(Object.keys(parsed[i].params)).toEqual(Object.keys(source.parameters));
      for (const [k, v] of Object.entries(source.parameters)) {
        expect(parsed[i].params[k].desc).toBe(v.description);
      }
    }
  });

  it('输出不含 execution/description 字段', () => {
    const out = buildToolDefsJson();
    expect(out).not.toContain('execution');
    expect(out).not.toContain('description');
  });

  it('输出不含裸 <（防 </script> 提前闭合脚本）', () => {
    expect(buildToolDefsJson()).not.toMatch(/</);
  });

  it('escapeInjectedJson：含特殊字符的输入经两层解析后无损还原（fixture 覆盖转义路径）', () => {
    // 真实 TOOL_DESCRIPTORS 全是中文，不会触发 `'`/`<`/`\` 转义——用构造输入打穿这层偶然性
    const fixture = [
      {
        name: 'web_fetch',
        label: "抓'取\\页</script><script>alert(1)</script>",
        params: { u: { desc: 'a\\b' + "'c'" } },
      },
    ];
    const escaped = escapeInjectedJson(JSON.stringify(fixture));
    // HTML 层：无裸 <（防 </script> 提前闭合脚本）
    expect(escaped).not.toMatch(/</);
    // 字面量层：模拟 main-world.content.ts 的注入（单引号包裹后经 JS 字面量解析）
    const rehydrated = JSON.parse(eval(`'${escaped}'`)) as typeof fixture;
    expect(rehydrated).toEqual(fixture);
  });

  it("输出可安全内插到单引号 JS 字面量（防 ' 与 \\ 破坏两层解析）", () => {
    const out = buildToolDefsJson();
    // 注入路径：`JSON.parse('__DS_TOOL_DEFS__')` 的单引号字面量。
    // 模拟 main-world.content.ts 的 replace 行为：
    // 先经 JS 字面量层解析（eval 一个单引号包裹的字符串，字面量转义在此层生效），
    // 再 JSON.parse——两层都要成功且还原出原始结构。
    const rehydrated = JSON.parse(eval(`'${out}'`)) as Array<{
      name: string;
      label: string;
    }>;
    expect(rehydrated.length).toBe(TOOL_DESCRIPTORS.length);
    expect(rehydrated.map((d) => d.name)).toEqual(TOOL_DESCRIPTORS.map((t) => t.name));
  });

  it('完整注入链路：main-xhr-inject 替换两个占位符后语法可编译且占位符清零', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = fs.readFileSync(path.resolve(__dirname, '../main-xhr-inject.ts'), 'utf8');
    // 替换前先断言占位符在源文件里各只出现一次（防止注释里再次出现字面量——
    // replaceAll 会连注释一起替换导致断言失明，这里在替换前就卡住）
    expect(raw.match(/__DS_TOOL_DEFS__/g)?.length).toBe(1);
    expect(raw.match(/__DS_TOOL_NAMES_REGEX__/g)?.length).toBe(1);
    const injected = raw
      .replaceAll(
        '__DS_TOOL_NAMES_REGEX__',
        () => `/<(${TOOL_DESCRIPTORS.map((t) => t.name).join('|')})>/g`,
      )
      .replaceAll('__DS_TOOL_DEFS__', () => buildToolDefsJson());
    // IIFE 不参与类型系统，注入后语法错误只能在运行时暴露——编译即验证
    expect(() => new Function(injected)).not.toThrow();
    // 占位符必须全部清零：残留任何一个都会在运行时 JSON.parse 抛错、IIFE 中断
    expect(injected).not.toContain('__DS_TOOL_DEFS__');
    expect(injected).not.toContain('__DS_TOOL_NAMES_REGEX__');
  });
});
