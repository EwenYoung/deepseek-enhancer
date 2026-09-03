// ============================================================
// deepseek-enhancer — 面板透明度配置
// ============================================================
// 面板透明度分深色/浅色两套取值，key 私有，读写只经本模块

const KEY_LIGHT = 'ds_panel_opacity_light';
const KEY_DARK = 'ds_panel_opacity_dark';

export async function getPanelOpacity(dark: boolean): Promise<number> {
  const key = dark ? KEY_DARK : KEY_LIGHT;
  const r = await chrome.storage.local.get(key);
  return (r[key] as number | undefined) ?? 100;
}

export async function setPanelOpacity(dark: boolean, value: number): Promise<void> {
  const key = dark ? KEY_DARK : KEY_LIGHT;
  await chrome.storage.local.set({ [key]: value });
}

/** 备份默认值（供 data-backup 聚合） */
export const panelBackupDefaults: Record<string, unknown> = {
  ds_panel_opacity_light: 100,
  ds_panel_opacity_dark: 100,
};
