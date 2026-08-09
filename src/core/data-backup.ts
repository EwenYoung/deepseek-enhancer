// ============================================================
// deepseek-enhancer — 数据导入导出（配置备份）
// ============================================================
// 导出/导入全部 chrome.storage.local 配置数据

export const BACKUP_VERSION = 1;

/** 备份文件结构 */
export interface BackupPayload {
  version: number;
  exportedAt: string;
  data: BackupData;
}

/** 全部需要备份的 storage key 及其默认值 */
const BACKUP_KEYS: Record<string, unknown> = {
  ds_mini_skills: [],
  ds_mini_categories: { order: [], items: {}, sessionCategory: {} },
  ds_mini_hidden_sessions: [],
  ds_mini_session_titles: {},
  ds_mini_enhancer: {},
  ds_mini_tavily_key: '',
  ds_mini_agent_mode: false,
  ds_panel_opacity_light: 100,
  ds_panel_opacity_dark: 100,
};

export type BackupData = typeof BACKUP_KEYS;

// ============================================================
// 导出
// ============================================================
export async function exportAllData(): Promise<BackupPayload> {
  const keys = Object.keys(BACKUP_KEYS);
  const result = await chrome.storage.local.get(keys);

  const data: Record<string, unknown> = {};
  for (const key of keys) {
    data[key] = result[key] ?? BACKUP_KEYS[key];
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: data as BackupData,
  };
}

// ============================================================
// 导入
// ============================================================
export async function importAllData(jsonString: string): Promise<void> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('文件解析失败：不是有效的 JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('备份文件格式无效：根节点必须是对象');
  }

  const payload = parsed as Partial<BackupPayload>;

  if (typeof payload.version !== 'number') {
    throw new Error('备份文件格式无效：缺少 version 字段');
  }

  if (payload.version > BACKUP_VERSION) {
    throw new Error('备份版本过高，请升级扩展后重试');
  }

  if (!payload.data || typeof payload.data !== 'object') {
    throw new Error('备份文件格式无效：缺少 data 字段');
  }

  // 白名单过滤：只写入已知 key，防止恶意备份污染 storage
  const data = payload.data as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(BACKUP_KEYS)) {
    if (key in data) sanitized[key] = data[key];
  }

  // 全量替换：先清空再写入
  await chrome.storage.local.clear();
  await chrome.storage.local.set(sanitized);
}

// ============================================================
// UI 辅助（供 ui-panel.ts 调用）
// ============================================================
export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function downloadBackup(json: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deepseek-enhancer-backup-${dateStamp()}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
