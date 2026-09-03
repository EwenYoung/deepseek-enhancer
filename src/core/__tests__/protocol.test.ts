import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAIN_SOURCE,
  ISOLATED_SOURCE,
  isMainToIsolated,
  isIsolatedToMain,
  isIsolatedToBackground,
  postToMain,
  sendToBackground,
} from '../protocol';
import type { Skill, ToolCall } from '../types';

// ============================================================
// protocol — 跨层消息协议：类型守卫与收发 helper
// ============================================================
const skill: Skill = {
  id: 'demo',
  name: 'demo',
  description: 'demo',
  instructions: '...',
  source: 'local',
  enabled: true,
  memoryEnabled: false,
};

const toolCall: ToolCall = {
  name: 'web_search',
  payload: { query: 'x' },
  raw: '<web_search>{"query":"x"}</web_search>',
  id: 't1',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('isMainToIsolated', () => {
  it('识别 DS_MINI_TOOL_CALLS 与 DS_MINI_NEW_SESSION（含 MAIN source）', () => {
    expect(
      isMainToIsolated({ source: MAIN_SOURCE, type: 'DS_MINI_TOOL_CALLS', toolCalls: [toolCall] }),
    ).toBe(true);
    expect(
      isMainToIsolated({
        source: MAIN_SOURCE,
        type: 'DS_MINI_NEW_SESSION',
        sessionId: 's',
        categoryName: 'c',
      }),
    ).toBe(true);
  });

  it('拒绝错误的 source / 未知 type / 非对象', () => {
    expect(
      isMainToIsolated({ source: ISOLATED_SOURCE, type: 'DS_MINI_TOOL_CALLS', toolCalls: [] }),
    ).toBe(false);
    expect(isMainToIsolated({ source: MAIN_SOURCE, type: 'UNKNOWN' })).toBe(false);
    expect(isMainToIsolated(null)).toBe(false);
    expect(isMainToIsolated('x')).toBe(false);
  });
});

describe('isIsolatedToMain', () => {
  it('识别 SET_SKILL / CLEAR_SKILL / SET_AGENT_MODE / DS_MINI_AGENT_STOP（含 ISOLATED source）', () => {
    expect(
      isIsolatedToMain({
        source: ISOLATED_SOURCE,
        type: 'SET_SKILL',
        skillName: 'demo',
        skill,
        instructions: '...',
      }),
    ).toBe(true);
    expect(isIsolatedToMain({ source: ISOLATED_SOURCE, type: 'CLEAR_SKILL' })).toBe(true);
    expect(
      isIsolatedToMain({ source: ISOLATED_SOURCE, type: 'SET_AGENT_MODE', enabled: true }),
    ).toBe(true);
    expect(isIsolatedToMain({ source: ISOLATED_SOURCE, type: 'DS_MINI_AGENT_STOP' })).toBe(true);
  });

  it('拒绝 MAIN 方向消息与未知 type', () => {
    expect(isIsolatedToMain({ source: MAIN_SOURCE, type: 'CLEAR_SKILL' })).toBe(false);
    expect(isIsolatedToMain({ source: ISOLATED_SOURCE, type: 'UNKNOWN' })).toBe(false);
  });
});

describe('isIsolatedToBackground', () => {
  it('识别四个后台消息类型（无 source 字段）', () => {
    expect(
      isIsolatedToBackground({
        type: 'EXECUTE_TOOL',
        payload: { name: 'web_search', payload: {} },
      }),
    ).toBe(true);
    expect(isIsolatedToBackground({ type: 'SET_API_KEY', key: 'k' })).toBe(true);
    expect(isIsolatedToBackground({ type: 'GET_API_KEY' })).toBe(true);
    expect(isIsolatedToBackground({ type: 'TEST_TAVILY' })).toBe(true);
  });

  it('拒绝未知 type 与非对象', () => {
    expect(isIsolatedToBackground({ type: 'NOPE' })).toBe(false);
    expect(isIsolatedToBackground(undefined)).toBe(false);
  });
});

describe('postToMain', () => {
  it('以 DS_MINI_ISOLATED source 通过 window.postMessage 发送，target 为 *', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    postToMain({ type: 'CLEAR_SKILL' });
    expect(postMessage).toHaveBeenCalledWith({ source: ISOLATED_SOURCE, type: 'CLEAR_SKILL' }, '*');

    postToMain({ type: 'SET_AGENT_MODE', enabled: true });
    expect(postMessage).toHaveBeenLastCalledWith(
      { source: ISOLATED_SOURCE, type: 'SET_AGENT_MODE', enabled: true },
      '*',
    );
  });
});

describe('sendToBackground', () => {
  it('委托 chrome.runtime.sendMessage 并返回类型化响应', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ key: 'abc' });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const resp = await sendToBackground({ type: 'GET_API_KEY' });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_API_KEY' });
    expect(resp).toEqual({ key: 'abc' });

    sendMessage.mockResolvedValueOnce({
      success: true,
      result: 'r',
      duration: 1,
      summary: 's',
      detail: 'd',
      output: null,
      truncated: false,
    });
    const toolResp = await sendToBackground({
      type: 'EXECUTE_TOOL',
      payload: { name: 'web_search', payload: { query: 'q' } },
    });
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'EXECUTE_TOOL',
      payload: { name: 'web_search', payload: { query: 'q' } },
    });
    expect(toolResp.success).toBe(true);
  });
});
