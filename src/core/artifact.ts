// ============================================================
// deepseek-enhancer — Artifact 产出物下载
// ============================================================
// 在模型回复的代码块上添加下载按钮

// ============================================================
// 初始化
// ============================================================
export function initArtifacts() {
  // 使用 MutationObserver 监听新消息
  const chatContainer = findChatContainer();
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          processArtifacts(node);
        }
      }
    }
  });

  observer.observe(chatContainer, { childList: true, subtree: true });

  // 初始扫描
  processArtifacts(chatContainer);
}

// ============================================================
// 扫描并处理代码块
// ============================================================
function processArtifacts(container: HTMLElement) {
  const codeBlocks = container.querySelectorAll('pre code:not([data-ds-artifact])');
  for (const block of codeBlocks) {
    if (block instanceof HTMLElement) {
      addDownloadButton(block);
    }
  }
}

function addDownloadButton(codeBlock: HTMLElement) {
  codeBlock.setAttribute('data-ds-artifact', 'processed');

  const pre = codeBlock.closest('pre');
  if (!pre) return;

  const code = codeBlock.textContent || '';
  if (!code.trim()) return;

  // 尝试从代码第一行提取文件名
  // 格式: // filename: xxx 或 # filename: xxx
  const filename = extractFilename(code) || 'code.txt';

  // 创建按钮
  const btn = document.createElement('button');
  btn.className = 'ds-mini-download-btn';
  btn.textContent = `📥 下载 ${filename}`;
  btn.title = `下载为 ${filename}`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadFile(code, filename);
  });

  // 插入到 pre 元素上方
  const wrapper = document.createElement('div');
  wrapper.className = 'ds-mini-artifact-wrapper';
  wrapper.style.cssText = 'position:relative;margin:4px 0;';

  pre.parentNode?.insertBefore(wrapper, pre);
  wrapper.appendChild(btn);
  wrapper.appendChild(pre);
}

// ============================================================
// 下载文件
// ============================================================
function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ============================================================
// 打包下载多个文件
// ============================================================
export function downloadAllFiles(files: Array<{ name: string; content: string }>) {
  // ponytail: 单文件逐个下载，不引入 JSZip 等第三方库
  files.forEach((file, i) => {
    setTimeout(() => downloadFile(file.content, file.name), i * 200);
  });
}

// ============================================================
// 工具函数
// ============================================================
function extractFilename(code: string): string | null {
  const firstLine = code.split('\n')[0].trim();
  // 匹配: // filename: xxx 或 # filename: xxx 或 /* filename: xxx */
  const patterns = [
    /^\/\/\s*filename:\s*(.+)/i,
    /^#\s*filename:\s*(.+)/i,
    /^\/\*\s*filename:\s*(.+?)\s*\*\//i,
  ];
  for (const pattern of patterns) {
    const m = firstLine.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
}

function findChatContainer(): HTMLElement | null {
  // 尝试常见的聊天容器选择器
  const selectors = [
    '[class*="chat"]',
    '[class*="message"]',
    '[class*="conversation"]',
    '#root',
  ];
  // 返回 #root 作为根级容器（最通用）
  return document.getElementById('root') || document.body;
}
