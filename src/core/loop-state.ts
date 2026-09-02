// ============================================================
// deepseek-enhancer — Agent 循环状态（纯模块，无 DOM/storage/window 依赖）
// ============================================================
export interface LoopState {
  depth: number;
  phase: 'idle' | 'running' | 'stopped' | 'complete';
  stopRequested: boolean;
}

export interface LoopStateController {
  getState(): LoopState;
  /** 新用户消息触发：复位 depth=0、stopRequested=false、phase='idle' */
  onNewUserFlow(): void;
  /** 检出工具调用：stopRequested 或 depth+count>maxLoop 时拒绝（depth 不变）返回 false；否则 depth+=count、phase='running' 返回 true */
  onToolCallsDetected(count: number): boolean;
  /** 用户请求停止：stopRequested=true、phase='stopped'（幂等） */
  onStopRequested(): void;
  /** 循环自然完成：phase='complete' */
  onLoopComplete(): void;
}

export function createLoopState(maxLoop = 10): LoopStateController {
  let depth = 0;
  let phase: LoopState['phase'] = 'idle';
  let stopRequested = false;

  return {
    getState() {
      return { depth, phase, stopRequested };
    },
    onNewUserFlow() {
      depth = 0;
      stopRequested = false;
      phase = 'idle';
    },
    onToolCallsDetected(count: number) {
      if (stopRequested) return false;
      if (depth + count > maxLoop) return false;
      depth += count;
      phase = 'running';
      return true;
    },
    onStopRequested() {
      stopRequested = true;
      phase = 'stopped';
    },
    onLoopComplete() {
      phase = 'complete';
    },
  };
}
