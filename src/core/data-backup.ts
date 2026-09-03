// ============================================================
// deepseek-enhancer — 数据导入导出（配置备份）
// ============================================================
// 导出/导入全部 chrome.storage.local 配置数据
import { skillBackupDefaults } from './skill-registry';
import { conversationBackupDefaults } from './conversation-store';
import { enhancerBackupDefaults } from './enhancer-features';
import { panelBackupDefaults } from './panel-config';
import { agentModeBackupDefaults } from './agent-mode';
import { tavilyKeyBackupDefaults } from './tavily-key';
import { downloadBlob } from './ui-kit';

export const BACKUP_VERSION = 1;

/** 备份文件结构 */
export interface BackupPayload {
  version: number;
  exportedAt: string;
  data: BackupData;
}

/** 全部需要备份的 storage key 及其默认值（聚合自各 key owner） */
const BACKUP_KEYS: Record<string, unknown> = {
  ...skillBackupDefaults,
  ...conversationBackupDefaults,
  ...enhancerBackupDefaults,
  ...tavilyKeyBackupDefaults,
  ...agentModeBackupDefaults,
  ...panelBackupDefaults,
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
    // 旧版本备份缺 key 时回填默认值；否则 clear() 后该设置会被静默清空
    sanitized[key] = Object.hasOwn(data, key) ? data[key] : BACKUP_KEYS[key];
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
  downloadBlob(blob, `deepseek-enhancer-backup-${dateStamp()}.json`);
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
