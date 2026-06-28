// ============================================================
// deepseek-enhancer — 上下文构建
// ============================================================
// 构建注入到用户消息前的上下文前缀（工具定义 + skill 指令）
import type { Skill, InjectionContext, ToolDescriptor } from './types';
import { TOOL_DESCRIPTORS, buildToolDefinitionsXML } from './tool-descriptors';

/**
 * 构建注入上下文
 * - toolDefinitions: 工具定义的 XML 文本，告诉模型哪些工具可用
 * - skillInstructions: 激活的 skill 指令
 */
export function buildInjectionContext(
  tools: ToolDescriptor[],
  skill: Skill | null,
): InjectionContext {
  const enabledTools = tools.length > 0 ? tools : TOOL_DESCRIPTORS;
  const toolDefinitions = buildToolDefinitionsXML(enabledTools);

  let skillInstructions = '';
  if (skill && skill.enabled) {
    skillInstructions = skill.instructions;
  }

  return { toolDefinitions, skillInstructions };
}

/**
 * 将上下文拼接为注入到用户消息前面的文本前缀
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
