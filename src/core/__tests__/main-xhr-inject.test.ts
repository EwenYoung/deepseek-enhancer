// main-xhr-inject.ts 是 raw 注入的 IIFE（无法 import），测试用 ?raw 读原文、
// 替换构建期占位符后传入最小 DOM/window 桩求值，直接验证生产行为：
// 工具定义只在会话首条消息（parent_message_id 为空）注入、工具结果回注不注入、
// /skill 指令不受影响。实测依据：chat/completion 请求体首条消息 pid=null、
// 第二条起 pid 有值，且页面切换时模式检测会误读（不可作为判定依据）。
import { describe, it, expect } from 'vitest';
import injectSource from '../main-xhr-inject.ts?raw';

const TOOL_DEFS_STUB = JSON.stringify([{ name: 'web_search' }, { name: 'doc_generate' }]);

interface SentRequest {
  url: string;
  body: string;
}

function loadInject() {
  const sent: SentRequest[] = [];
  const xhrs: unknown[] = [];
  const messageHandlers: Array<
    (event: { source?: unknown; data: Record<string, unknown> }) => void
  > = [];
  const elements: Record<string, { id: string; textContent: string }> = {};

  const doc = {
    querySelectorAll: () => [],
    createElement: () => ({ id: '', textContent: '', style: {} as Record<string, string> }),
    getElementById: (id: string) => elements[id] ?? null,
    body: {
      appendChild: (el: { id: string; textContent: string }) => {
        elements[el.id] = el;
      },
    },
  };
  class FakeMutationObserver {
    observe() {}
  }
  class FakeXHR {
    listeners: Record<string, Array<(event: unknown) => void>> = {};
    responseText = '';
    open(_method: string, _url: string) {}
    send(body: unknown) {
      sent.push({ url: (this as unknown as { __ds_url: string }).__ds_url, body: String(body) });
    }
    addEventListener(type: string, handler: (event: unknown) => void) {
      (this.listeners[type] ||= []).push(handler);
    }
  }
  const store: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: () => {},
    removeItem: () => {},
  };
  const fakeWindow = {
    postMessage: () => {},
    addEventListener: (
      _type: string,
      handler: (event: { data: Record<string, unknown> }) => void,
    ) => messageHandlers.push(handler),
  };
  const silentConsole = { log: () => {}, warn: () => {}, error: () => {} };

  const src = injectSource
    .replaceAll("'__DS_TOOL_DEFS__'", JSON.stringify(TOOL_DEFS_STUB))
    // 与 main-world.content.ts buildToolRegex 同形：只匹配标签本身（含尖括号），
    // JSON 主体由 extractFromText 的平衡扫描提取
    .replaceAll('__DS_TOOL_NAMES_REGEX__', '/<(web_search|doc_generate)>/g');
  new Function(
    'window',
    'document',
    'localStorage',
    'XMLHttpRequest',
    'MutationObserver',
    'console',
    'crypto',
    src,
  )(fakeWindow, doc, storage, FakeXHR, FakeMutationObserver, silentConsole, {
    randomUUID: () => 'u',
  });

  const dispatch = (data: Record<string, unknown>) => {
    for (const handler of messageHandlers) handler({ source: fakeWindow, data });
  };

  return {
    sent,
    store,
    xhrs,
    setAgentMode(enabled: boolean) {
      dispatch({ source: 'DS_MINI_ISOLATED', type: 'SET_AGENT_MODE', enabled });
    },
    setSkill(instructions: string) {
      dispatch({
        source: 'DS_MINI_ISOLATED',
        type: 'SET_SKILL',
        skill: { name: 'mycat' },
        instructions,
      });
    },
    post(url: string, body: unknown) {
      const xhr = new FakeXHR() as unknown as {
        __ds_url: string;
        open: (m: string, u: string) => void;
        send: (b: unknown) => void;
      };
      xhr.open('POST', url);
      xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
      xhrs.push(xhr);
      return sent[sent.length - 1];
    },
    fireProgress(xhr: unknown, responseText: string) {
      const x = xhr as {
        responseText: string;
        listeners: Record<string, Array<(e: unknown) => void>>;
      };
      x.responseText = responseText;
      for (const handler of x.listeners['progress'] || []) handler({ target: xhr });
    },
    fireLoad(xhr: unknown, responseText: string) {
      const x = xhr as {
        responseText: string;
        listeners: Record<string, Array<(e: unknown) => void>>;
      };
      x.responseText = responseText;
      for (const handler of x.listeners['load'] || []) handler({ target: xhr });
    },
    injectedRecordEl() {
      return elements['ds-mini-injected'] ?? null;
    },
    asstCacheEl() {
      return elements['ds-mini-asst-raw'] ?? null;
    },
  };
}

const COMPLETION_URL = 'https://chat.deepseek.com/api/v0/chat/completion';

function cacheRecords(app: ReturnType<typeof loadInject>): string[] {
  const el = app.asstCacheEl() as { textContent: string } | null;
  if (!el) return [];
  return (el.textContent || '').split('||ASST_SEP||').filter(Boolean);
}

function lastPrompt(req: SentRequest): string {
  return (JSON.parse(req.body) as { prompt: string }).prompt;
}

describe('main-xhr-inject 工具定义注入门槛', () => {
  it('会话首条消息（parent_message_id 为空）注入工具定义，原文包在 <user_message> 内', () => {
    const app = loadInject();
    app.setAgentMode(true);
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const prompt = lastPrompt(req);
    expect(prompt.indexOf('<tool_defs>\n【工具调用说明】')).toBe(0);
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('</tool_defs>');
    expect(prompt.endsWith('<user_message>\n你好\n</user_message>')).toBe(true);
  });

  it('工具定义不含 task_complete 规则，doc_generate 描述精简', () => {
    const app = loadInject();
    app.setAgentMode(true);
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const prompt = lastPrompt(req);
    expect(prompt).not.toContain('task_complete');
    expect(prompt).not.toContain('例如：<doc_generate>');
    expect(prompt).toContain('format=html 时 content 为完整 HTML 文档');
  });

  it('带 parent_message_id 的后续消息不再注入工具定义', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '第一条' });
    const req = app.post(COMPLETION_URL, {
      chat_session_id: 's1',
      parent_message_id: 'm2',
      prompt: '第二条',
    });
    expect(lastPrompt(req)).toBe('第二条');
  });

  it('会话中途才开启 Agent 模式时补注入一次工具定义', () => {
    const app = loadInject();
    // 首条在 Agent 关闭时发出：无注入，会话未记录
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '普通聊天' });
    app.setAgentMode(true);
    const req1 = app.post(COMPLETION_URL, {
      chat_session_id: 's1',
      parent_message_id: 'm2',
      prompt: '第二条',
    });
    expect(lastPrompt(req1)).toContain('【工具调用说明】');
    // 补注入只做一次，后续消息不再带定义
    const req2 = app.post(COMPLETION_URL, {
      chat_session_id: 's1',
      parent_message_id: 'm3',
      prompt: '第三条',
    });
    expect(lastPrompt(req2)).toBe('第三条');
  });

  it('工具结果回注消息不注入（旧中文前缀仍识别，双保险）', () => {
    const app = loadInject();
    app.setAgentMode(true);
    const req = app.post(COMPLETION_URL, {
      chat_session_id: 's1',
      prompt: '以下是工具执行结果。请基于原始任务和这些结果继续推进。',
    });
    expect(lastPrompt(req)).toBe('以下是工具执行结果。请基于原始任务和这些结果继续推进。');
  });

  it('现行 XML 格式的回注消息（<tool_results> 开头）同样不注入', () => {
    const app = loadInject();
    app.setAgentMode(true);
    const echo = '<tool_results>\n[]\n</tool_results>\n以上是工具执行结果。';
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: echo });
    expect(lastPrompt(req)).toBe(echo);
  });

  it('编辑后的首条消息（新分支，parent 仍为空）重新注入', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '原始提问' });
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '编辑后的提问' });
    expect(lastPrompt(req)).toContain('【工具调用说明】');
  });

  it('Agent 模式关闭时不注入', () => {
    const app = loadInject();
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '原文' });
    expect(lastPrompt(req)).toBe('原文');
  });

  it('后续消息的 /skill 仍注入技能指令，但不重复注入工具定义', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.setSkill('技能指令文本');
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '第一条' });
    const req = app.post(COMPLETION_URL, {
      chat_session_id: 's1',
      parent_message_id: 'm2',
      prompt: '/mycat 处理参数',
    });
    expect(lastPrompt(req)).toBe(
      '<skill_instructions>\n技能指令文本\n</skill_instructions>\n\n<user_message>\n处理参数\n</user_message>',
    );
    const el = app.injectedRecordEl();
    expect((el as { textContent: string }).textContent).toContain(
      '<skill_instructions>\n技能指令文本\n</skill_instructions>||SEP||/mycat 处理参数||MSG_SEP||',
    );
  });

  it('首条消息使用 /skill 时工具定义与技能指令一起注入', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.setSkill('技能指令文本');
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '/mycat 处理参数' });
    const prompt = lastPrompt(req);
    expect(prompt.indexOf('<tool_defs>\n【工具调用说明】')).toBe(0);
    expect(prompt).toContain('<skill_instructions>\n技能指令文本\n</skill_instructions>');
    expect(prompt).toContain('</tool_defs>');
    expect(prompt.endsWith('<user_message>\n处理参数\n</user_message>')).toBe(true);
  });

  it('注入记录与注入次数一致（导出对齐依赖）', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '第一条' });
    app.post(COMPLETION_URL, { chat_session_id: 's1', parent_message_id: 'm2', prompt: '第二条' });
    const el = app.injectedRecordEl();
    expect(el).not.toBeNull();
    expect((el as { textContent: string }).textContent.split('||MSG_SEP||').length - 1).toBe(1);
  });

  it('全部工具禁用时首条消息只注入技能指令', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.setSkill('技能指令文本');
    app.store['ds_mini_tools_state'] = JSON.stringify({ web_search: false, doc_generate: false });
    const req = app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '/mycat 处理参数' });
    expect(lastPrompt(req)).toBe(
      '<skill_instructions>\n技能指令文本\n</skill_instructions>\n\n<user_message>\n处理参数\n</user_message>',
    );
  });

  it('非 chat/completion 请求不做任何改写', () => {
    const app = loadInject();
    app.setAgentMode(true);
    const req = app.post('https://chat.deepseek.com/api/v0/other', { prompt: '原文' });
    expect(req.body).toBe(JSON.stringify({ prompt: '原文' }));
  });

  it('助手原始响应缓存按会话 ID 归档（导出侧只认当前会话）', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const sse = 'data: {"v":"收到"}\n\ndata: {"o":"SET","p":"response/status","v":"FINISHED"}\n\n';
    app.fireProgress(app.xhrs[app.xhrs.length - 1], sse);
    const el = app.asstCacheEl();
    expect(el).not.toBeNull();
    expect((el as { textContent: string }).textContent).toBe('s1||ASST_SID||收到');
  });

  it('第二次流式响应追加为新的带会话标记记录', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '一' });
    app.post(COMPLETION_URL, { chat_session_id: 's1', parent_message_id: 'm2', prompt: '二' });
    const sse = (text: string) =>
      'data: {"v":"' + text + '"}\n\ndata: {"o":"SET","p":"response/status","v":"FINISHED"}\n\n';
    app.fireProgress(app.xhrs[0], sse('回复一'));
    app.fireProgress(app.xhrs[1], sse('回复二'));
    expect((app.asstCacheEl() as { textContent: string }).textContent).toBe(
      's1||ASST_SID||回复一||ASST_SEP||s1||ASST_SID||回复二',
    );
  });

  it('思考过程增量不进缓存，记录只含正文', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const sse =
      'data: {"p":"response/thinking_content","o":"APPEND","v":"思考文本"}\n\n' +
      'data: {"v":"正文内容"}\n\n' +
      'data: {"o":"SET","p":"response/status","v":"FINISHED"}\n\n';
    app.fireProgress(app.xhrs[app.xhrs.length - 1], sse);
    expect(cacheRecords(app)).toEqual(['s1||ASST_SID||正文内容']);
  });

  it('流结束后再来的尾块不会把同一条回复存两次', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const sse = 'data: {"v":"正文"}\n\ndata: {"o":"SET","p":"response/status","v":"FINISHED"}\n\n';
    const xhr = app.xhrs[app.xhrs.length - 1];
    app.fireProgress(xhr, sse);
    // 模拟 [DONE] 单独成帧的尾块：位置清零后整段重扫曾导致重复落盘
    app.fireProgress(xhr, sse + 'data: [DONE]\n\n');
    expect(cacheRecords(app)).toEqual(['s1||ASST_SID||正文']);
  });

  it('FINISHED 行只在 load 尾块到达时仍兜底落盘', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const xhr = app.xhrs[app.xhrs.length - 1];
    app.fireProgress(xhr, 'data: {"v":"前半"}\n\n');
    app.fireLoad(
      xhr,
      'data: {"v":"前半"}\n\ndata: {"v":"后半"}\n\ndata: {"o":"SET","p":"response/status","v":"FINISHED"}\n\n',
    );
    expect(cacheRecords(app)).toEqual(['s1||ASST_SID||前半后半']);
  });

  it('进度事件始终未见 FINISHED 时，load 兜底保存已累积正文', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '你好' });
    const xhr = app.xhrs[app.xhrs.length - 1];
    app.fireProgress(xhr, 'data: {"v":"前半"}\n\n');
    app.fireLoad(xhr, 'data: {"v":"前半"}\n\ndata: {"v":"后半"}\n\n');
    expect(cacheRecords(app)).toEqual(['s1||ASST_SID||前半后半']);
  });

  it('纯工具调用轮正文剥空后落占位记录，保持请求↔记录一一对应', () => {
    const app = loadInject();
    app.setAgentMode(true);
    app.post(COMPLETION_URL, { chat_session_id: 's1', prompt: '搜一下' });
    const sse =
      'data: {"v":"<web_search>{\\"query\\": \\"x\\"}</web_search>"}\n\n' +
      'data: {"o":"SET","p":"response/status","v":"FINISHED"}\n\n';
    app.fireProgress(app.xhrs[app.xhrs.length - 1], sse);
    expect(cacheRecords(app)).toEqual(['s1||ASST_SID||（工具调用）']);
  });
});
