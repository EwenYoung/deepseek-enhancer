// ============================================================
// deepseek-enhancer — Tavily API Key
// ============================================================
// Tavily API Key 的存储，key 私有，读写只经本模块

const KEY = 'ds_mini_tavily_key';

export async function getTavilyKey(): Promise<string> {
  const r = await chrome.storage.local.get(KEY);
  return (r[KEY] as string | undefined) || '';
}

export async function setTavilyKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: key });
}

/** 备份默认值（供 data-backup 聚合） */
export const tavilyKeyBackupDefaults: Record<string, unknown> = {
  ds_mini_tavily_key: '',
};
