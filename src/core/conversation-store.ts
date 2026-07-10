// ============================================================
// deepseek-enhancer — 分类存储模块
// ============================================================
// 分类数据 CRUD、会话 ID 提取、数据持久化

const STORAGE_KEY_CATEGORIES = 'ds_mini_categories';
const STORAGE_KEY_HIDDEN = 'ds_mini_hidden_sessions';

// ============================================================
// 数据类型定义
// ============================================================

export interface CategoriesData {
  /** 分类顺序 */
  order: string[];
  /** 分类详情 */
  items: Record<string, CategoryItem>;
  /** 会话 ID → 分类名的反向映射 */
  sessionCategory: Record<string, string>;
}

export type SortMode = 'time-desc' | 'time-asc';

export interface CategoryItem {
  createdAt: number;
  sessions: string[];
  sortBy?: SortMode;
}

export interface CategoryState {
  categories: CategoriesData;
  hiddenSessions: string[];
  /** sid → title 缓存，解决隐藏会话 DOM 取不到标题的问题 */
  sessionTitles: Record<string, string>;
}

// ============================================================
// 默认空数据
// ============================================================

function emptyCategories(): CategoriesData {
  return { order: [], items: {}, sessionCategory: {} };
}

function emptyState(): CategoryState {
  return { categories: emptyCategories(), hiddenSessions: [], sessionTitles: {} };
}

// ============================================================
// 存储操作
// ============================================================

const STORAGE_KEY_TITLES = 'ds_mini_session_titles';

/** 加载分类数据 */
export async function loadCategories(): Promise<CategoryState> {
  try {
    const r = await chrome.storage.local.get([
      STORAGE_KEY_CATEGORIES,
      STORAGE_KEY_HIDDEN,
      STORAGE_KEY_TITLES,
    ]);
    const categories = r[STORAGE_KEY_CATEGORIES] || emptyCategories();
    const hiddenSessions: string[] = r[STORAGE_KEY_HIDDEN] || [];
    const sessionTitles: Record<string, string> = r[STORAGE_KEY_TITLES] || {};
    return { categories, hiddenSessions, sessionTitles };
  } catch {
    return emptyState();
  }
}

/** 保存分类数据 */
export async function saveCategories(state: CategoryState): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_CATEGORIES]: state.categories,
    [STORAGE_KEY_HIDDEN]: state.hiddenSessions,
    [STORAGE_KEY_TITLES]: state.sessionTitles,
  });
}

// ============================================================
// 分类 CRUD
// ============================================================

/** 添加新分类 */
export function addCategory(state: CategoryState, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (state.categories.items[trimmed]) return false;
  state.categories.items[trimmed] = { createdAt: Date.now(), sessions: [] };
  state.categories.order.push(trimmed);
  return true;
}

/** 重命名分类 */
export function renameCategory(state: CategoryState, oldName: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed || oldName === trimmed) return false;
  if (state.categories.items[trimmed]) return false;
  const item = state.categories.items[oldName];
  if (!item) return false;

  // 更新 items
  state.categories.items[trimmed] = item;
  delete state.categories.items[oldName];

  // 更新 order
  const idx = state.categories.order.indexOf(oldName);
  if (idx !== -1) state.categories.order[idx] = trimmed;

  // 更新 sessionCategory 反向映射
  for (const sid of item.sessions) {
    state.categories.sessionCategory[sid] = trimmed;
  }

  return true;
}

/** 删除分类（不清除会话，会话恢复未分类） */
export function deleteCategory(state: CategoryState, name: string): boolean {
  const item = state.categories.items[name];
  if (!item) return false;

  // 清除会话的反向映射
  for (const sid of item.sessions) {
    delete state.categories.sessionCategory[sid];
  }

  delete state.categories.items[name];
  const idx = state.categories.order.indexOf(name);
  if (idx !== -1) state.categories.order.splice(idx, 1);

  return true;
}

// ============================================================
// 归类操作
// ============================================================

/** 将会话归类到某分类 */
export function categorizeSession(
  state: CategoryState,
  sessionId: string,
  categoryName: string,
): boolean {
  if (!state.categories.items[categoryName]) return false;

  // 先移除旧分类
  const oldCat = state.categories.sessionCategory[sessionId];
  if (oldCat && oldCat !== categoryName) {
    const oldItem = state.categories.items[oldCat];
    if (oldItem) {
      const idx = oldItem.sessions.indexOf(sessionId);
      if (idx !== -1) oldItem.sessions.splice(idx, 1);
    }
  }

  // 添加到新分类
  state.categories.sessionCategory[sessionId] = categoryName;
  const item = state.categories.items[categoryName];
  if (!item.sessions.includes(sessionId)) {
    item.sessions.unshift(sessionId); // 新会话在最前（time-desc 默认）
  }

  // 加入隐藏列表
  if (!state.hiddenSessions.includes(sessionId)) {
    state.hiddenSessions.push(sessionId);
  }

  return true;
}

/** 从分类中移出会话 */
export function uncategorizeSession(state: CategoryState, sessionId: string): boolean {
  const catName = state.categories.sessionCategory[sessionId];
  if (!catName) return false;

  const item = state.categories.items[catName];
  if (item) {
    const idx = item.sessions.indexOf(sessionId);
    if (idx !== -1) item.sessions.splice(idx, 1);
  }

  delete state.categories.sessionCategory[sessionId];

  // 从隐藏列表移除
  const hIdx = state.hiddenSessions.indexOf(sessionId);
  if (hIdx !== -1) state.hiddenSessions.splice(hIdx, 1);

  return true;
}

// ============================================================
// 隐藏列表管理
// ============================================================

/** 添加会话到隐藏列表 */
export function addHiddenSession(state: CategoryState, sessionId: string) {
  if (!state.hiddenSessions.includes(sessionId)) {
    state.hiddenSessions.push(sessionId);
  }
}

/** 从隐藏列表移除 */
export function removeHiddenSession(state: CategoryState, sessionId: string) {
  const idx = state.hiddenSessions.indexOf(sessionId);
  if (idx !== -1) state.hiddenSessions.splice(idx, 1);
}

// ============================================================
// 排序功能
// ============================================================

/** 切换排序模式：time-desc ↔ time-asc */
export function toggleSortMode(item: CategoryItem): SortMode {
  const next = item.sortBy === 'time-asc' ? 'time-desc' : 'time-asc';
  item.sortBy = next;
  return next;
}

export function getSortIcon(mode?: SortMode): string {
  return mode === 'time-asc' ? '↑' : '↓';
}

export function getSortLabel(mode?: SortMode): string {
  return mode === 'time-asc' ? '最早优先' : '最新优先';
}

// ============================================================
// 分类拖拽排序
// ============================================================

/** 拖拽后将分类移到新位置 */
export function reorderCategory(state: CategoryState, fromIndex: number, toIndex: number) {
  const order = state.categories.order;
  if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return;
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
}

// ============================================================
// DOM 工具 — 提取 chat_session_id
// ============================================================

/** 从会话链接元素中提取 chat_session_id */
export function extractSessionId(linkEl: HTMLAnchorElement): string | null {
  // 优先从 href 提取 UUID
  const href = linkEl.getAttribute('href') || '';
  // 匹配 /chat/s/{uuid} 或 /a/chat/s/{uuid}
  const m = href.match(/\/chat\/s\/([a-f0-9-]{36})/i) || href.match(/\/([a-f0-9-]{36})$/i);
  if (m) return m[1];

  // 从 data-* 属性提取
  const dataId = linkEl.getAttribute('data-chat-session-id') || linkEl.dataset.chatSessionId;
  if (dataId) return dataId;

  return null;
}

/** 从侧边栏收集所有可见的会话元素 */
export function getConversationLinks(): NodeListOf<HTMLAnchorElement> {
  // DeepSeek 侧边栏的会话列表区域
  const sidebar = document.querySelector('[data-ds-sidebar]');
  if (!sidebar) return document.querySelectorAll('a[href*="/chat/s/"]');

  // 只返回可见（未隐藏）的会话链接
  return sidebar.querySelectorAll('a[href*="/chat/s/"]');
}

/** 从 DOM 获取会话标题 */
export function getConversationTitle(linkEl: HTMLAnchorElement): string {
  // DeepSeek 对话标题通常在 a 标签内或子元素中
  // 尝试多种选择器
  const titleEl = linkEl.querySelector('[class*="title"], [class*="name"], [class*="label"]');
  if (titleEl) return titleEl.textContent?.trim() || '未命名';
  return linkEl.textContent?.trim() || '未命名';
}

/** 获取所有会话 ID → 标题的映射 */
export function getAllConversations(): Map<string, string> {
  const result = new Map<string, string>();
  const links = getConversationLinks();
  for (const link of links) {
    const id = extractSessionId(link);
    if (id) {
      result.set(id, getConversationTitle(link));
    }
  }
  return result;
}
