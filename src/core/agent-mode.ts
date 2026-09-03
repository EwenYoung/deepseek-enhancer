// ============================================================
// deepseek-enhancer — Agent 模式开关
// ============================================================
// Agent 模式是否启用，key 私有，读写只经本模块

const KEY = 'ds_mini_agent_mode';

export async function getAgentMode(): Promise<boolean> {
  const r = await chrome.storage.local.get(KEY);
  return !!r[KEY];
}

export async function setAgentMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEY]: enabled });
}

/** 备份默认值（供 data-backup 聚合） */
export const agentModeBackupDefaults: Record<string, unknown> = {
  ds_mini_agent_mode: false,
};
