// ============================================================
// deepseek-enhancer — 上下文构建
// ============================================================
// 构建增强到用户消息前的上下文前缀（工具定义 + skill 指令）
import type { Skill, InjectionContext, ToolDescriptor } from './types';
import { TOOL_DESCRIPTORS } from './tool-descriptors';

function buildToolDefinitionsXML(tools: ToolDescriptor[]): string {
  return tools.map(t => {
    const params = t.parameters ? Object.entries(t.parameters).map(([k, v]) => `      ${k}: ${v.description}`).join('\n') : '';
    return `<${t.name}>\n${params ? `  params:\n${params}` : ''}</${t.name}>`;
  }).join('\n');
}

// 用户禁用的工具缓存（由 content.ts 更新）
let disabledToolsState: Record<string, boolean> = {};

export function setDisabledTools(tools: Record<string, boolean>) {
  disabledToolsState = tools;
}

/**
 * 构建增强上下文
 * - toolDefinitions: 工具定义的 XML 文本，告诉模型哪些工具可用
 * - skillInstructions: 激活的 skill 指令
 */
export function buildContext(
  tools: ToolDescriptor[],
  skill: Skill | null,
): InjectionContext {
  // ponytail: 从全局变量读取工具状态（ui-panel.ts 直接设置，避免 postMessage 延迟）
  // @ts-expect-error - window custom property set by ui-panel.ts
  if (window.__DS_TOOLS_STATE__) disabledToolsState = window.__DS_TOOLS_STATE__;
  const baseTools = tools.length > 0 ? tools : TOOL_DESCRIPTORS;
  // 过滤被禁用的工具
  const enabledTools = baseTools.filter(t => disabledToolsState[t.name] !== false);
  const toolDefinitions = buildToolDefinitionsXML(enabledTools);

  let skillInstructions = '';
  if (skill && skill.enabled) {
    skillInstructions = skill.instructions;
  }

  return { toolDefinitions, skillInstructions };
}

/**
 * 将上下文拼接为增强到用户消息前面的文本前缀
 */
export function buildContextPrefix(ctx: InjectionContext): string {
  const parts: string[] = [];

  if (ctx.toolDefinitions) {
    parts.push(ctx.toolDefinitions);
  }

  if (ctx.skillInstructions) {
    parts.push(ctx.skillInstructions);
  }

  if (parts.length === 0) return '';

  parts.push('---');
  parts.push('');
  return parts.join('\n');
}

/**
 * 检测用户输入是否包含 /skill 命令
 * @returns { skillName, args } 或 null
 */
export function parseSkillCommand(
  text: string,
): { skillName: string; args: string } | null {
  const match = text.match(/^\/([\w-]+)\s*(.*)/s);
  if (!match) return null;
  return { skillName: match[1], args: match[2].trim() };
}
