// ============================================================
// deepseek-enhancer — 内容折叠（Collapse）
// ============================================================
// 助手消息里的大段内容（原始工具调用 XML、超长代码块）默认收成一行标签：
// 只给块级元素加 data-ds-fold 系列属性，标签行由 CSS ::before 渲染；不插入自建
// 节点、不改写文本节点，原文始终留在 DOM 里（复制、搜索、导出都能读到）。
// 官方重渲染会抹掉属性，MutationObserver 重扫后幂等补打。
// 这里刻意不打任何控制台日志：观察器跟着 #root 的每个文本变化跑，流式输出期间
// 每秒触发上百次，日志会刷爆控制台（该路径无排查需求）。
// DOM 部分依赖真实页面结构（虚拟列表、流式渲染、伪元素点击目标），不做单测；
// 当前 vitest 环境是 node，无 jsdom。纯逻辑部分见 __tests__/ui-collapse.test.ts。

import { applyGuardedCSS } from './enhancer-features';
import { extractBalancedJson } from './sse-parser';
import { toolNames } from './tool-descriptors';

// 折叠契约：属性存在即已折叠（幂等标记），data-ds-fold-open 存在即展开
const FOLD_ATTR = 'data-ds-fold';
const FOLD_LABEL_ATTR = 'data-ds-fold-label';
const FOLD_OPEN_ATTR = 'data-ds-fold-open';

type FoldKind = 'tool' | 'code';

// 代码块达到该行数才折叠
const CODE_COLLAPSE_MIN_LINES = 15;
// 标签行高度（px），与官方「已思考」折叠块一致
const FOLD_LABEL_HEIGHT_PX = 34;
// 变化入队后的合并处理间隔（ms）
const SCAN_THROTTLE_MS = 250;
// 折叠扫描跳过的子树：思考过程、扩展自渲染的工具结果块、已折叠块
const SKIP_SUBTREE_SELECTOR = '.ds-think-content, .ds-mini-tool-block, [data-ds-fold]';
// 折叠候选：助手正文的直接子块，或代码块容器（折容器才能连顶栏一起藏）
const FOLD_CANDIDATE_SELECTOR =
  '.ds-assistant-message-main-content > *, .ds-assistant-message-main-content .md-code-block';

// ============================================================
// 纯逻辑（测试覆盖）
// ============================================================
export interface ToolCallSpan {
  name: string;
  /** 含 `<tag>` */
  start: number;
  /** 闭合标签之后；模型省略闭合标签时为 JSON 之后 */
  end: number;
}

interface OpenTag {
  name: string;
  start: number;
  end: number;
}

/** 找出文本中所有工具调用区间；闭合标签可选（模型有时省略） */
export function findToolCallSpans(text: string, tags: string[] = toolNames): ToolCallSpan[] {
  const spans: ToolCallSpan[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = findEarliestOpenTag(text, cursor, tags);
    if (!open) break;
    const jsonStart = skipWhitespace(text, open.end);
    if (text[jsonStart] !== '{') {
      // 标签后压根没有 JSON 起点（模型误写或正文引用标签词）：不是调用，跳过
      cursor = open.end;
      continue;
    }
    const body = extractBalancedJson(text, jsonStart);
    if (!body) {
      // JSON 已开始但未闭合＝流式输出进行中。必须在标签出现的这一刻就折叠，否则长
      // 文档会在输出全程铺满正文（折叠的意义就是挡住这段）。区间先延到文本末尾，
      // 下一轮扫描拿到完整 JSON 后再重算终点
      spans.push({ name: open.name, start: open.start, end: text.length });
      break;
    }
    let end = jsonStart + body.length;
    const close = matchClosingTag(text, end, open.name);
    if (close) end += close.length;
    spans.push({ name: open.name, start: open.start, end });
    cursor = end;
  }
  return spans;
}

export interface FoldDecision {
  foldable: boolean;
  /** 去重，保持出现顺序 */
  toolNames: string[];
}

/** 折叠判定：块内除工具调用外还有正文时不折叠 */
export function classifyFoldableBlock(text: string, spans: ToolCallSpan[]): FoldDecision {
  const names = [...new Set(spans.map((span) => span.name))];
  return { foldable: spans.length > 0 && !hasTextOutsideSpans(text, spans), toolNames: names };
}

/** 标签行文案：'▸ 工具调用 doc_generate、news_hub' */
export function buildFoldLabel(toolNames: string[], expanded: boolean): string {
  const names = toolNames.join('、');
  return names ? `${foldMarker(expanded)} 工具调用 ${names}` : `${foldMarker(expanded)} 工具调用`;
}

/** 代码块标签行文案：'▸ 代码块（20 行）' */
export function buildCodeFoldLabel(lines: number, expanded: boolean): string {
  return `${foldMarker(expanded)} 代码块（${lines} 行）`;
}

/** 区间外文本（去空白后）是否为空 */
export function hasTextOutsideSpans(text: string, spans: ToolCallSpan[]): boolean {
  let outside = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) outside += text.slice(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < text.length) outside += text.slice(cursor);
  return outside.trim().length > 0;
}

function foldMarker(expanded: boolean): string {
  return expanded ? '▾' : '▸';
}

function findEarliestOpenTag(text: string, from: number, tags: string[]): OpenTag | null {
  let earliest: OpenTag | null = null;
  for (const name of tags) {
    const token = '<' + name + '>';
    const start = text.indexOf(token, from);
    if (start === -1) continue;
    if (!earliest || start < earliest.start) {
      earliest = { name, start, end: start + token.length };
    }
  }
  return earliest;
}

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/** 闭合标签允许前置空白；命中时连同空白一起返回，区间覆盖整段调用 */
function matchClosingTag(text: string, from: number, name: string): string | null {
  const token = '</' + name + '>';
  const closeStart = skipWhitespace(text, from);
  return text.startsWith(token, closeStart) ? text.slice(from, closeStart + token.length) : null;
}

// ============================================================
// DOM 层：观察器 → 入队 → 节流批量打标
// ============================================================
interface FoldPlan {
  kind: FoldKind;
  label: string;
}

export function initCollapse() {
  applyGuardedCSS(
    'collapse',
    `
    [${FOLD_ATTR}] {
      position: relative;
      transition: max-height 0.25s ease;
    }
    [${FOLD_ATTR}]::before {
      content: attr(${FOLD_LABEL_ATTR});
      display: flex;
      align-items: center;
      height: ${FOLD_LABEL_HEIGHT_PX}px;
      cursor: pointer;
      user-select: none;
      font-size: 13px;
      color: var(--dsw-alias-label-secondary, #61666b);
    }
    [${FOLD_ATTR}]:not([${FOLD_OPEN_ATTR}]) {
      max-height: ${FOLD_LABEL_HEIGHT_PX}px;
      overflow: hidden;
      visibility: hidden;
      box-sizing: border-box;
    }
    [${FOLD_ATTR}]:not([${FOLD_OPEN_ATTR}])::before {
      visibility: visible;
    }
    `,
  );

  // 用捕获阶段委托：官方在 #root 内部对气泡点击调用 stopPropagation，冒泡阶段的
  // 监听器（含绑在 document 上的）收不到事件，只有捕获阶段能先于它命中
  document.addEventListener('click', onFoldClick, true);
  scheduleScanAll();
  // #root 是 DeepSeek 的 React 挂载点；缺失时退回 body，保证仍能观察
  const observedRoot = document.querySelector('#root') ?? document.body;
  new MutationObserver(onMutations).observe(observedRoot, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

const pendingBlocks = new Set<HTMLElement>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleScanAll() {
  document.querySelectorAll<HTMLElement>(FOLD_CANDIDATE_SELECTOR).forEach(scheduleScan);
}

function scheduleScan(block: HTMLElement) {
  pendingBlocks.add(block);
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushPending, SCAN_THROTTLE_MS);
}

function flushPending() {
  flushTimer = null;
  const blocks = [...pendingBlocks];
  pendingBlocks.clear();
  for (const block of blocks) foldBlockIfEligible(block);
}

function onMutations(records: MutationRecord[]) {
  for (const record of records) {
    scheduleCandidate(record.target);
    record.addedNodes.forEach(scheduleCandidate);
  }
}

function scheduleCandidate(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return;

  const candidate = findFoldCandidate(element);
  if (candidate) {
    scheduleScan(candidate);
    return;
  }
  // 新增的是整个正文容器（React 重建消息）时向上找不到候选，其子块全部重扫
  element.querySelectorAll<HTMLElement>(FOLD_CANDIDATE_SELECTOR).forEach(scheduleScan);
}

/** 从变化节点向上找最近的折叠候选 */
function findFoldCandidate(element: Element): HTMLElement | null {
  const codeBlock = element.closest<HTMLElement>('.md-code-block');
  if (codeBlock) return codeBlock;

  const content = element.closest('.ds-assistant-message-main-content');
  if (!content || element === content) return null;
  let candidate: Element = element;
  while (candidate.parentElement && candidate.parentElement !== content) {
    candidate = candidate.parentElement;
  }
  return candidate.parentElement === content ? (candidate as HTMLElement) : null;
}

function foldBlockIfEligible(block: HTMLElement) {
  if (!isFoldCandidate(block)) return;
  const plan = planFold(block, block.hasAttribute(FOLD_OPEN_ATTR));
  if (plan) applyFold(block, plan);
  else undoFold(block);
}

/** 只处理助手正文里的可见块：用户气泡的注入说明带工具示例，折叠会污染导出 */
function isFoldCandidate(block: HTMLElement): boolean {
  if (!block.isConnected) return false;
  if (block.closest('[data-ds-hidden]')) return false;
  if (block.parentElement?.closest(SKIP_SUBTREE_SELECTOR)) return false;
  return block.closest('.ds-assistant-message-main-content') !== null;
}

function planFold(block: HTMLElement, expanded: boolean): FoldPlan | null {
  if (block.classList.contains('md-code-block')) {
    const lines = countCodeLines(block);
    return lines >= CODE_COLLAPSE_MIN_LINES
      ? { kind: 'code', label: buildCodeFoldLabel(lines, expanded) }
      : null;
  }
  const text = collectVisibleText(block);
  const decision = classifyFoldableBlock(text, findToolCallSpans(text));
  return decision.foldable
    ? { kind: 'tool', label: buildFoldLabel(decision.toolNames, expanded) }
    : null;
}

function applyFold(block: HTMLElement, plan: FoldPlan) {
  // 幂等：已折叠且文案一致就不重复写属性，避免无谓的 DOM 变更
  if (
    block.getAttribute(FOLD_ATTR) === plan.kind &&
    block.getAttribute(FOLD_LABEL_ATTR) === plan.label
  ) {
    return;
  }
  block.setAttribute(FOLD_ATTR, plan.kind);
  block.setAttribute(FOLD_LABEL_ATTR, plan.label);
}

/** 撤销保险：内容变化后不再符合折叠条件时移除全部折叠属性 */
function undoFold(block: HTMLElement) {
  if (!block.hasAttribute(FOLD_ATTR)) return;
  block.removeAttribute(FOLD_ATTR);
  block.removeAttribute(FOLD_LABEL_ATTR);
  block.removeAttribute(FOLD_OPEN_ATTR);
}

function onFoldClick(event: MouseEvent) {
  const target = event.target;
  const block = target instanceof Element ? target.closest<HTMLElement>(`[${FOLD_ATTR}]`) : null;
  // 标签行是块自身的 ::before 伪元素，点击时 target 就是块；展开态点正文
  // （target 为子元素）不应收起
  if (!block || target !== block) return;
  toggleFold(block);
}

function toggleFold(block: HTMLElement) {
  const expanded = !block.hasAttribute(FOLD_OPEN_ATTR);
  if (expanded) block.setAttribute(FOLD_OPEN_ATTR, '');
  else block.removeAttribute(FOLD_OPEN_ATTR);

  const plan = planFold(block, expanded);
  if (plan) applyFold(block, plan);
  else undoFold(block);
}

function countCodeLines(block: HTMLElement): number {
  const pre = block.querySelector('pre');
  return pre ? (pre.textContent || '').split('\n').length : 0;
}

function collectVisibleText(block: HTMLElement): string {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isSkippedTextNode(node as Text, block) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const parts: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue) parts.push(node.nodeValue);
  }
  return parts.join('');
}

/** 块内嵌套的思考区/工具块/已折叠块不参与文本收集；块自身不算跳过 */
function isSkippedTextNode(node: Text, block: HTMLElement): boolean {
  const skipped = node.parentElement?.closest(SKIP_SUBTREE_SELECTOR);
  return skipped != null && skipped !== block;
}
