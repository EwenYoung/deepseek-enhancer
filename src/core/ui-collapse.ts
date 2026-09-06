// ============================================================
// deepseek-enhancer — 内容折叠（Collapse）
// ============================================================
// 助手消息里的大段内容默认收起为可展开横条：
//   1. 原始工具调用文本（<doc_generate>{...}</doc_generate> 等）——
//      SSE 主路径检出并执行调用后，官方气泡仍会渲染原始 XML，长文档（HTML/Markdown
//      文件内容）会铺满正文；
//   2. 超过行数阈值的代码块（pre>code）。
// 折叠只做非破坏性操作（截断/清空文本节点、display:none、插入横条），不移动 React
// 管理的节点；官方重渲染（虚拟列表滚动、会话切换）会还原原文，轮询扫描到后重新折叠。
// DOM 重依赖，单元测试只覆盖纯函数 findToolCallRegion。

import { toolNames } from './tool-descriptors';

// 需要从正文收起的 XML 标签：五个工具
const COLLAPSE_TAGS = toolNames;
// 代码块达到该行数才折叠
const CODE_COLLAPSE_MIN_LINES = 15;
// 折叠态代码块保留的可见高度（px）
const CODE_COLLAPSED_HEIGHT = 240;
// 展开后原文预览的最大高度（px）
const RAW_VIEW_MAX_HEIGHT = 320;
// 扫描轮询间隔（ms）；配合文本稳定门避开流式输出中段
const RESCAN_INTERVAL_MS = 1200;
// 折叠扫描跳过的子树：思考过程、扩展自渲染的工具结果块、已有折叠条
const SKIP_SUBTREE_SELECTOR = '.ds-think-content, .ds-mini-tool-block, [data-ds-collapse]';

const BTN_STYLE =
  'cursor:pointer;font-size:12px;color:var(--ds-text-secondary,#86909c);' +
  'background:var(--ds-bg-subtle, rgba(0,0,0,0.03));' +
  'border:1px solid var(--ds-border, rgba(0,0,0,0.08));border-radius:6px;padding:3px 10px;';

export interface ToolCallRegion {
  name: string;
  start: number;
  /** 关闭标签之后的排他下标 */
  end: number;
}

/** 纯函数（测试覆盖）：找出文本中第一段完整的 <tag>...</tag> 区间，多个标签取起点最靠前的 */
export function findToolCallRegion(
  text: string,
  tags: string[] = COLLAPSE_TAGS,
): ToolCallRegion | null {
  let best: ToolCallRegion | null = null;
  for (const name of tags) {
    const open = '<' + name + '>';
    const start = text.indexOf(open);
    if (start === -1) continue;
    const close = '</' + name + '>';
    const closeIdx = text.indexOf(close, start + open.length);
    if (closeIdx === -1) continue;
    const end = closeIdx + close.length;
    if (!best || start < best.start) best = { name, start, end };
  }
  return best;
}

// ============================================================
// 初始化：固定间隔轮询扫描气泡
// ============================================================
export function initCollapse() {
  // 实测 DeepSeek 页面持续存在 mutation（虚拟列表回收、动画、埋点 SDK），
  // “等安静再扫”的防抖可能永远等不到安静期，因此用固定间隔轮询全量扫描。
  // 文本稳定门：同一气泡文本连续两轮一致才折叠，避开流式输出中途折叠生长中的内容。
  const lastSeenText = new WeakMap<HTMLElement, string>();

  const scan = () => {
    document.querySelectorAll('.ds-message').forEach((el) => {
      const bubble = el as HTMLElement;
      if (bubble.closest('[data-ds-hidden]')) return;
      // 只折叠助手消息：用户气泡里的注入说明带工具示例标签，折叠会毁掉原文并污染导出
      if (!bubble.querySelector('.ds-assistant-message-main-content')) return;
      const text = bubble.textContent || '';
      if (lastSeenText.get(bubble) !== text) {
        lastSeenText.set(bubble, text);
        return;
      }
      collapseRawToolCall(bubble);
      collapseLongCodeBlocks(bubble);
    });
  };

  setTimeout(scan, RESCAN_INTERVAL_MS);
  setInterval(scan, RESCAN_INTERVAL_MS);
}

// ============================================================
// 原始工具调用文本 → 折叠条
// ============================================================
interface TextSeg {
  node: Node;
  start: number;
  end: number;
  value: string;
}

function collapseRawToolCall(bubble: HTMLElement) {
  // 先收集跳过子树之外的文本段，再在拼接文本上找调用区间
  const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const el = n.parentElement;
      return el && el.closest(SKIP_SUBTREE_SELECTOR)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const segs: TextSeg[] = [];
  let cursor = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || '';
    if (!value) continue;
    segs.push({ node, start: cursor, end: cursor + value.length, value });
    cursor += value.length;
  }
  if (!segs.length) return;

  const text = segs.map((s) => s.value).join('');
  const region = findToolCallRegion(text);
  if (!region) return;
  const raw = text.slice(region.start, region.end);

  // 区间起点所在段：截掉区间部分保留原文前后缀；完全落在区间内的段：清空并隐藏空壳祖先。
  // 锚点取第一个与区间相交的段——调用文本常自成段落（起点恰为段首），此时也必须折叠。
  let anchorNode: Node | null = null;
  let anchorAfter = false;
  const emptied: Node[] = [];
  for (const seg of segs) {
    if (seg.end <= region.start || seg.start >= region.end) continue;
    if (seg.start < region.start && seg.end > region.start) {
      const head = seg.value.slice(0, region.start - seg.start);
      const tail = seg.value.slice(Math.max(region.end - seg.start, 0));
      seg.node.nodeValue = head + tail;
      anchorNode = seg.node;
      anchorAfter = true;
    } else if (seg.start >= region.start && seg.end <= region.end) {
      seg.node.nodeValue = '';
      emptied.push(seg.node);
      if (!anchorNode) {
        anchorNode = seg.node;
        anchorAfter = false;
      }
    } else if (seg.start < region.end) {
      seg.node.nodeValue = seg.value.slice(region.end - seg.start);
      if (!anchorNode) {
        anchorNode = seg.node;
        anchorAfter = false;
      }
    }
  }
  if (!anchorNode) return;

  const bar = buildToolCallBar(region.name, raw);
  const parent = anchorNode.parentElement;
  if (!parent) return;
  parent.insertBefore(bar, anchorAfter ? anchorNode.nextSibling : anchorNode);
  for (const n of emptied) hideEmptyAncestors(n, bubble);
}

function hideEmptyAncestors(node: Node, root: HTMLElement) {
  let el = node.parentElement;
  while (el && el !== root && root.contains(el)) {
    // 折叠条使容器非空时自然停下，不会隐藏承载横条的块
    if ((el.textContent || '').trim() !== '') break;
    const parent = el.parentElement;
    (el as HTMLElement).style.display = 'none';
    el = parent;
  }
}

function toolCallLabel(name: string): string {
  return '🛠 工具调用 ' + name;
}

function buildToolCallBar(name: string, raw: string): HTMLElement {
  const bar = document.createElement('div');
  bar.setAttribute('data-ds-collapse', 'tool');
  bar.style.cssText = 'margin:4px 0;';

  const btn = document.createElement('button');
  const label = (expanded: boolean) =>
    expanded
      ? '▾ 收起' + toolCallLabel(name) + '原文'
      : '▸ ' + toolCallLabel(name) + '（点击展开原文）';
  btn.textContent = label(false);
  btn.style.cssText = BTN_STYLE;

  const pre = document.createElement('pre');
  pre.style.cssText =
    'display:none;max-height:' +
    RAW_VIEW_MAX_HEIGHT +
    'px;overflow:auto;' +
    'white-space:pre-wrap;word-break:break-all;font-size:12px;line-height:1.6;' +
    'background:var(--ds-bg-subtle, rgba(0,0,0,0.03));color:var(--ds-text,#1d2129);' +
    'border-radius:8px;padding:10px;margin:6px 0 0;';
  pre.textContent = raw;

  btn.addEventListener('click', () => {
    const show = pre.style.display === 'none';
    pre.style.display = show ? 'block' : 'none';
    btn.textContent = label(show);
  });

  bar.appendChild(btn);
  bar.appendChild(pre);
  return bar;
}

// ============================================================
// 超长代码块 → 折叠条
// ============================================================
function collapseLongCodeBlocks(bubble: HTMLElement) {
  const pres = bubble.querySelectorAll('pre');
  for (const pre of pres) {
    if (pre.hasAttribute('data-ds-collapse-code')) continue;
    if (pre.closest(SKIP_SUBTREE_SELECTOR)) continue;
    const lines = (pre.textContent || '').split('\n').length;
    if (lines < CODE_COLLAPSE_MIN_LINES) continue;

    pre.setAttribute('data-ds-collapse-code', 'collapsed');
    pre.style.maxHeight = CODE_COLLAPSED_HEIGHT + 'px';
    pre.style.overflow = 'hidden';

    const bar = document.createElement('div');
    bar.setAttribute('data-ds-collapse', 'code');
    bar.style.cssText = 'margin:4px 0;';
    const btn = document.createElement('button');
    const label = (expanded: boolean) =>
      expanded ? '▾ 收起代码块（' + lines + ' 行）' : '▸ 展开代码块（' + lines + ' 行）';
    btn.textContent = label(false);
    btn.style.cssText = BTN_STYLE;
    btn.addEventListener('click', () => {
      const expanded = pre.style.maxHeight === '';
      pre.style.maxHeight = expanded ? CODE_COLLAPSED_HEIGHT + 'px' : '';
      pre.style.overflow = expanded ? 'hidden' : '';
      btn.textContent = label(!expanded);
    });
    bar.appendChild(btn);

    pre.parentNode?.insertBefore(bar, pre);
  }
}
