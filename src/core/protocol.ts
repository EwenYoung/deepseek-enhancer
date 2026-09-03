// ============================================================
// deepseek-enhancer — 跨层消息协议
// ============================================================
// 三条通道的类型化契约：
//   1. MAIN ↔ Isolated ：window.postMessage，source 标记 DS_MINI_MAIN / DS_MINI_ISOLATED
//   2. Isolated ↔ Background ：chrome.runtime.sendMessage（请求/响应）
// 死消息不写进本协议——只在类型层缺席，并删除对应收发分支。
// 注意：MAIN 层 main-xhr-inject.ts 是 raw 注入的 IIFE，无法 import 本模块，
// 其字符串字面量靠文件头注释与这里的 union 对齐。
import type { Skill, ToolCall } from './types';

// ============================================================
// source 标记
// ============================================================
export const MAIN_SOURCE = 'DS_MINI_MAIN';
export const ISOLATED_SOURCE = 'DS_MINI_ISOLATED';

// ============================================================
// MAIN → Isolated
// ============================================================
export type MainToIsolated =
  | {
      type: 'DS_MINI_TOOL_CALLS';
      toolCalls: ToolCall[];
      isNewUserFlow?: boolean;
    }
  | {
      type: 'DS_MINI_NEW_SESSION';
      sessionId: string;
      categoryName: string;
    };

// ============================================================
// Isolated → MAIN
// ============================================================
export type IsolatedToMain =
  | {
      type: 'SET_SKILL';
      skillName: string;
      skill: Skill;
      instructions: string;
    }
  | {
      type: 'CLEAR_SKILL';
    }
  | {
      type: 'SET_AGENT_MODE';
      enabled: boolean;
    }
  | {
      type: 'DS_MINI_AGENT_STOP';
    };

// ============================================================
// Isolated → Background（请求）与对应响应
// ============================================================
/** 工具执行请求（发给 Background 委托） */
export interface ToolExecRequest {
  name: string;
  payload: Record<string, unknown>;
}

/** 工具执行成功结果 */
export interface ToolExecSuccess {
  success: true;
  result: string;
  duration: number;
  summary: string;
  detail: string;
  output: unknown;
  truncated: boolean;
}

/** 工具执行失败结果 */
export interface ToolExecError {
  success: false;
  error: string;
  duration: number;
}

export type ToolExecResponse = ToolExecSuccess | ToolExecError;

export type IsolatedToBackground =
  | {
      type: 'EXECUTE_TOOL';
      payload: ToolExecRequest;
    }
  | {
      type: 'SET_API_KEY';
      key: string;
    }
  | {
      type: 'GET_API_KEY';
    }
  | {
      type: 'TEST_TAVILY';
    };

/** 各后台消息对应的响应形状 */
export interface BackgroundResponseByType {
  EXECUTE_TOOL: ToolExecResponse;
  SET_API_KEY: { ok: boolean };
  GET_API_KEY: { key: string };
  TEST_TAVILY: { ok: boolean; message: string };
}

/** 后台通道消息判别（无 source 字段，仅按 type 判别） */
export function isIsolatedToBackground(data: unknown): data is IsolatedToBackground {
  if (!data || typeof data !== 'object') return false;
  const type = (data as { type?: unknown }).type;
  return (
    type === 'EXECUTE_TOOL' ||
    type === 'SET_API_KEY' ||
    type === 'GET_API_KEY' ||
    type === 'TEST_TAVILY'
  );
}

// ============================================================
// 类型守卫（供 window message 监听过滤 source + type）
// ============================================================
export function isMainToIsolated(data: unknown): data is MainToIsolated {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { source?: unknown; type?: unknown }).source;
  if (t !== MAIN_SOURCE) return false;
  const type = (data as { type?: unknown }).type;
  return type === 'DS_MINI_TOOL_CALLS' || type === 'DS_MINI_NEW_SESSION';
}

export function isIsolatedToMain(data: unknown): data is IsolatedToMain {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { source?: unknown; type?: unknown }).source;
  if (t !== ISOLATED_SOURCE) return false;
  const type = (data as { type?: unknown }).type;
  return (
    type === 'SET_SKILL' ||
    type === 'CLEAR_SKILL' ||
    type === 'SET_AGENT_MODE' ||
    type === 'DS_MINI_AGENT_STOP'
  );
}

// ============================================================
// 收发 helper
// ============================================================
/** Isolated → MAIN：通过 window.postMessage 发送 */
export function postToMain(msg: IsolatedToMain): void {
  window.postMessage({ source: ISOLATED_SOURCE, ...msg }, '*');
}

/** Isolated → Background：chrome.runtime.sendMessage，返回类型化响应 */
export function sendToBackground<K extends IsolatedToBackground['type']>(
  msg: Extract<IsolatedToBackground, { type: K }>,
): Promise<BackgroundResponseByType[K]> {
  return chrome.runtime.sendMessage(msg);
}
