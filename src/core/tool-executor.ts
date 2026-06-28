// ============================================================
// deepseek-enhancer — 工具执行引擎（Content Script 端）
// ============================================================
// 将工具执行委托给 Background Service Worker 处理（绕过 CORS）
import type { ToolCall, ToolResult } from './types';

// ============================================================
// 工具执行入口 — 通过消息委托给 Background
// ============================================================
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const startTime = performance.now();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_TOOL',
      payload: {
        name: call.name,
        payload: call.payload,
      },
    });

    if (!response || !response.success) {
      return {
        callId: call.id,
        toolName: call.name,
        success: false,
        error: response?.error || 'Unknown error',
        duration: performance.now() - startTime,
      };
    }

    return {
      callId: call.id,
      toolName: call.name,
      success: true,
      result: response.result,
      duration: response.duration || (performance.now() - startTime),
    };
  } catch (err) {
    return {
      callId: call.id,
      toolName: call.name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration: performance.now() - startTime,
    };
  }
}
