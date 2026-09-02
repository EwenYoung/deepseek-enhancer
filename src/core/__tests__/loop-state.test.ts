import { describe, it, expect } from 'vitest';
import { createLoopState } from '../loop-state';

// ============================================================
// loop-state — Agent 循环状态纯模块
// ============================================================
describe('createLoopState', () => {
  it('初始状态：idle / depth=0 / stopRequested=false', () => {
    const loop = createLoopState();
    expect(loop.getState()).toEqual({ depth: 0, phase: 'idle', stopRequested: false });
  });

  it('onNewUserFlow 复位已递增的 depth 与 stopRequested', () => {
    const loop = createLoopState();
    loop.onToolCallsDetected(2);
    loop.onStopRequested();
    expect(loop.getState().depth).toBe(2);
    expect(loop.getState().stopRequested).toBe(true);

    loop.onNewUserFlow();
    expect(loop.getState()).toEqual({ depth: 0, phase: 'idle', stopRequested: false });
  });

  it('连续 onToolCallsDetected 递增不复位', () => {
    const loop = createLoopState();
    expect(loop.onToolCallsDetected(1)).toBe(true);
    expect(loop.onToolCallsDetected(1)).toBe(true);
    expect(loop.onToolCallsDetected(1)).toBe(true);
    expect(loop.getState().depth).toBe(3);
    expect(loop.getState().phase).toBe('running');
  });

  it('达 maxLoop 后下一批拒绝且 depth 不变', () => {
    const loop = createLoopState(3);
    loop.onToolCallsDetected(1);
    loop.onToolCallsDetected(1);
    loop.onToolCallsDetected(1);
    expect(loop.getState().depth).toBe(3);

    // 第 4 批拒绝，depth 保持 3（拒绝不复位为 0）
    expect(loop.onToolCallsDetected(1)).toBe(false);
    expect(loop.getState().depth).toBe(3);
  });

  it('边界：第 maxLoop 批放行、第 maxLoop+1 批拒绝', () => {
    const loop = createLoopState(2);
    expect(loop.onToolCallsDetected(1)).toBe(true); // 第 1 批
    expect(loop.onToolCallsDetected(1)).toBe(true); // 第 2 批（=maxLoop）放行
    expect(loop.getState().depth).toBe(2);
    expect(loop.onToolCallsDetected(1)).toBe(false); // 第 3 批拒绝
    expect(loop.getState().depth).toBe(2);
  });

  it('onStopRequested 后拒绝一切，onNewUserFlow 后恢复', () => {
    const loop = createLoopState();
    loop.onStopRequested();
    expect(loop.getState().phase).toBe('stopped');
    expect(loop.onToolCallsDetected(1)).toBe(false);
    // 拒绝不改 depth
    expect(loop.getState().depth).toBe(0);

    loop.onNewUserFlow();
    expect(loop.onToolCallsDetected(1)).toBe(true);
  });

  it('onStopRequested 幂等', () => {
    const loop = createLoopState();
    loop.onStopRequested();
    loop.onStopRequested();
    expect(loop.getState().stopRequested).toBe(true);
    expect(loop.getState().phase).toBe('stopped');
  });

  it('onLoopComplete 置 phase=complete', () => {
    const loop = createLoopState();
    loop.onToolCallsDetected(1);
    loop.onLoopComplete();
    expect(loop.getState().phase).toBe('complete');
  });

  it('count 批量调用：depth 累加 count，超出则整体拒绝且不改 depth', () => {
    const loop = createLoopState(5);
    expect(loop.onToolCallsDetected(3)).toBe(true);
    expect(loop.getState().depth).toBe(3);
    expect(loop.onToolCallsDetected(3)).toBe(false); // 3+3 > 5
    expect(loop.getState().depth).toBe(3);
  });
});
