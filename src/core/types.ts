// ============================================================
// deepseek-enhancer — 共享类型定义
// ============================================================

// --- 工具相关 ---

/** 工具描述 — 定义可用工具及其参数 schema */
export interface ToolDescriptor {
  /** 工具名（用于 XML 标签） */
  name: string;
  /** 显示名 */
  label: string;
  /** 工具描述（写入模型上下文） */
  description: string;
  /** JSON Schema 参数定义 */
  parameters: Record<string, ToolParameter>;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  default?: unknown;
}

/** 从模型回复中解析出的工具调用 */
export interface ToolCall {
  /** 工具名 */
  name: string;
  /** 调用参数 */
  payload: Record<string, unknown>;
  /** 原始 XML 文本 */
  raw: string;
  /** 唯一 ID */
  id: string;
}

/** 工具执行结果 */
export interface ToolResult {
  callId: string;
  toolName: string;
  success: boolean;
  /** 成功时的结果文本 */
  result?: string;
  /** 失败时的错误信息 */
  error?: string;
  /** 耗时 ms */
  duration: number;
}

// --- Skill 相关 ---

export type SkillSource = 'builtin' | 'github' | 'local' | 'custom';

export interface Skill {
  id: string;
  name: string;           // kebab-case, 唯一
  description: string;    // 一行描述
  instructions: string;   // 系统指令内容
  source: SkillSource;
  /** GitHub URL（source === 'github' 时） */
  githubUrl?: string;
  /** 本地文件路径标记 */
  localPath?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否自动注入记忆上下文 */
  memoryEnabled: boolean;
  metadata?: {
    author?: string;
    version?: string;
    updatedAt?: number;
  };
}

// --- 上下文注入 ---

export interface InjectionContext {
  /** 工具定义 XML */
  toolDefinitions: string;
  /** 激活的 skill instructions */
  skillInstructions: string;
}

// --- SSE / 流式解析 ---

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

export interface ParsedStreamChunk {
  type: 'text' | 'tool_call' | 'unknown';
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// --- 请求拦截 ---

export interface DeepSeekRequest {
  model?: string;
  messages: DeepSeekMessage[];
  stream?: boolean;
  [key: string]: unknown;
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// --- 全局状态 ---

export interface AppState {
  activeSkill: Skill | null;
  skills: Skill[];
}
