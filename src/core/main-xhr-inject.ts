// ============================================================
// deepseek-enhancer — 主世界 XHR 拦截脚本
// ============================================================
/* eslint-disable no-var, @typescript-eslint/no-unused-vars */
(function () {
  'use strict';

  if (window.__DS_MINI_XHR_HOOKED__) return;
  window.__DS_MINI_XHR_HOOKED__ = true;

  console.log('[DS-Mini:MAIN] XHR hook installed');

  // 立即拦截 fetch 以捕获 auth 请求头（放最前面确保不遗漏）
  const __origFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (typeof url === 'string' && url.indexOf('/api/v0/') !== -1 && opts && opts.headers) {
      const h = opts.headers;
      if (h instanceof Headers) {
        if (h.has('authorization')) window.__DS_DELETE_AUTH__ = h.get('authorization');
        if (h.has('Authorization')) window.__DS_DELETE_AUTH__ = h.get('Authorization');
      } else if (typeof h === 'object') {
        if (h.authorization) window.__DS_DELETE_AUTH__ = h.authorization;
        if (h.Authorization) window.__DS_DELETE_AUTH__ = h.Authorization;
      }
    }
    return __origFetch.call(this, url, opts);
  };

  // ==========================================================
  // 模式检测 — 使用 _31a22b0 定位实际激活的模式
  // ==========================================================
  let currentMode = 'expert'; // 默认专家

  function detectMode() {
    // 查找所有模式 span: 快速/专家/识图
    const spans = document.querySelectorAll('span._321831d');
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      // 激活的模式条目: 它所在的 .aa40b5de 的祖父级有 _31a22b0 类
      const p = s.parentElement;
      if (!p || !p.classList.contains('aa40b5de')) continue;
      const gp = p.parentElement;
      if (!gp || !gp.classList.contains('_31a22b0')) continue;

      const t = s.textContent || '';
      if (t.indexOf('快速') !== -1) return 'fast';
      if (t.indexOf('专家') !== -1) return 'expert';
      if (t.indexOf('识图') !== -1) return 'image';
    }
    return 'expert';
  }

  // 初始化检测
  currentMode = detectMode();

  // 监听模式切换（带去重保护，防止 SPA 反复触发）
  let modeObserverTimer = null;
  const modeObserver = new MutationObserver(function () {
    if (modeObserverTimer) return;
    modeObserverTimer = setTimeout(function () {
      modeObserverTimer = null;
      const prev = currentMode;
      const next = detectMode();
      if (prev !== next) {
        currentMode = next;
        console.log('[DS-Mini:MAIN] Mode:', prev, '→', next);
        // 通知 content script
        window.postMessage({ type: 'DS_MINI_MODE_CHANGED', mode: next }, '*');
      }
    }, 200);
  });
  if (document.body) modeObserver.observe(document.body, { childList: true, subtree: true });

  // ==========================================================
  // 工具定义
  // ==========================================================
  const TOOL_DEFS = [
    { name: 'web_search', label: '联网搜索', params: { query: { desc: '搜索关键词' } } },
    { name: 'web_fetch', label: '网页抓取', params: { url: { desc: '目标网页的完整 URL' } } },
    { name: 'news_hub', label: '新闻聚合', params: { sources: { desc: '搜索源（可选）' } } },
    {
      name: 'github_trending',
      label: 'GitHub热门',
      params: { language: { desc: '语言' }, since: { desc: '周期' } },
    },
    {
      name: 'doc_generate',
      label: '生成文档',
      params: {
        title: { desc: '文件名' },
        format: { desc: '格式: md/html' },
        content: { desc: '文档内容（Markdown）' },
      },
    },
  ];
  let disabledTools = {}; // 用户禁用的工具列表

  // 监听来自 isolated world 的工具状态
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (e.data && e.data.source === 'DS_MINI_ISOLATED' && e.data.type === 'SET_TOOLS_STATE') {
      disabledTools = {};
      for (const k in e.data.tools) {
        if (!e.data.tools[k]) disabledTools[k] = true;
      }
      TOOL_DEFS_CACHE = {}; // 清空缓存
      // 清空旧注入记录，避免导出时混入旧工具定义
      const el = document.getElementById('ds-mini-injected');
      if (el) el.textContent = '';
    }
  });

  function buildToolDefs(mode) {
    try {
      const ls = JSON.parse(localStorage.getItem('ds_mini_tools_state') || '{}');
      for (const k in ls) {
        if (!ls[k]) disabledTools[k] = true;
      }
    } catch (e) {}
    let avail = [];
    for (var i = 0; i < TOOL_DEFS.length; i++) {
      if (!disabledTools[TOOL_DEFS[i].name]) avail.push(TOOL_DEFS[i]);
    }
    if (mode === 'fast')
      avail = avail.filter(function (t) {
        return t.name === 'web_fetch' || t.name === 'doc_generate';
      });
    if (avail.length === 0) return '';

    const lines = [];

    lines.push('【工具调用说明】');
    lines.push('如果需要实时信息（如新闻、天气、网页内容），请按以下格式调用工具：');
    lines.push('');

    for (var i = 0; i < avail.length; i++) {
      const t = avail[i];
      if (t.name === 'web_search') {
        lines.push('搜索网络：<web_search>{"query": "你的搜索关键词"}</web_search>');
        lines.push('例如：<web_search>{"query": "2026年6月24日热点新闻"}</web_search>');
      } else if (t.name === 'web_fetch') {
        lines.push('抓取网页：<web_fetch>{"url": "目标页面完整URL"}</web_fetch>');
        lines.push(
          '例如：<web_fetch>{"url": "https://github.com/bytedance/deer-flow"}</web_fetch>',
        );
      } else if (t.name === 'news_hub') {
        lines.push('聚合新闻：<news_hub>{"sources": "baidu,weibo,zhihu,36kr"}</news_hub>');
        lines.push('8大实时源：百度热搜|微博热搜|GitHub|知乎|36氪|arXiv|HN|Reddit');
        lines.push('例如：<news_hub>{}</news_hub>（全部源）或指定部分源');
      } else if (t.name === 'github_trending') {
        lines.push('GitHub热门：<github_trending>{}</github_trending>');
        lines.push('获取 GitHub 当日最热开源项目');
        lines.push('例如：<github_trending>{"since": "daily"}</github_trending>');
      } else if (t.name === 'doc_generate') {
        lines.push(
          '生成文档：<doc_generate>{"title": "文件名","format": "md","content": "..."}</doc_generate>',
        );
        lines.push('将内容生成为可下载的文件，支持 Markdown 和 HTML');
        lines.push(
          '例如：<doc_generate>{"title": "报告","format": "md","content": "# 报告标题\\n内容"}</doc_generate>',
        );
      }
      lines.push('');
    }

    lines.push('重要规则：');
    lines.push('- 必须替换 query/url 为真实内容，不要使用占位符');
    lines.push('- 一次只输出一个 XML 标签，放到回复末尾');
    lines.push('- 收到工具结果后，如有需要可以再次调用工具，直到完成全部需求后再回复用户');
    return lines.join('\n');
  }

  var TOOL_DEFS_CACHE = {};

  function getToolDefs(mode) {
    return buildToolDefs(mode); // 实时构建，不缓存（Tools 开关动态变化）
  }

  // ==========================================================
  // XHR Hook (prototype 级别)
  // ==========================================================
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  let activeSkill = null;
  let skillInstructions = '';
  let agentModeEnabled = false;
  const lastCtx = { chat_session_id: '', model_type: '' }; // 用于静默循环

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__ds_url = String(url);
    this.__ds_method = method;
    return origOpen.call(this, method, url, ...args);
  };

  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (header, value, ...rest) {
    if (header.toLowerCase() === 'authorization' && value) {
      window.__DS_DELETE_AUTH__ = value;
    }
    return origSetHeader.call(this, header, value, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__ds_url || '';
    const method = this.__ds_method || '';

    if (method.toUpperCase() === 'POST' && url.indexOf('/api/v0/chat/completion') !== -1) {
      // 保存会话上下文
      try {
        const parsedCtx = JSON.parse(body);
        if (parsedCtx.chat_session_id) {
          lastCtx.chat_session_id = parsedCtx.chat_session_id;
          lastCtx.model_type = parsedCtx.model_type || 'default';

          // 检查是否有待归类的新会话
          try {
            const pendingCat = localStorage.getItem('ds_mini_pending_category');
            if (pendingCat && parsedCtx.chat_session_id) {
              localStorage.removeItem('ds_mini_pending_category');
              window.postMessage(
                {
                  source: 'DS_MINI_MAIN',
                  type: 'DS_MINI_NEW_SESSION',
                  sessionId: parsedCtx.chat_session_id,
                  categoryName: pendingCat,
                },
                '*',
              );
            }
          } catch (pendingErr) {}
        }
      } catch (e) {}

      body = augmentPrompt(body);
      this.addEventListener('progress', createProgressHandler());
    }

    return origSend.call(this, body);
  };

  // ==========================================================
  // Prompt 增强
  // ==========================================================
  function augmentPrompt(body) {
    if (typeof body !== 'string') return body;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return body;
    }
    if (!parsed.prompt || typeof parsed.prompt !== 'string') return body;

    const userContent = parsed.prompt;

    // 工具结果回注 → 不注入，直接放行
    if (userContent.indexOf('[工具执行结果]') === 0) {
      return JSON.stringify(parsed);
    }

    // Agent 模式关闭 → 不注入任何内容
    if (!agentModeEnabled) {
      return JSON.stringify(parsed);
    }

    const toolDefs = getToolDefs(currentMode);
    let prefix = '';

    // 检测 /skill 命令
    const skillCmd = parseSkillCommand(userContent);
    if (skillCmd && skillInstructions) {
      const parts = [];
      if (toolDefs) parts.push(toolDefs);
      if (skillInstructions) parts.push(skillInstructions);
      prefix = parts.join('\n') + '\n---\n';
      const userArgs = skillCmd.args || userContent.slice(skillCmd.skillName.length + 1).trim();
      parsed.prompt = prefix + (userArgs || userContent);
    } else if (toolDefs) {
      prefix = toolDefs + '\n---\n';
      parsed.prompt = prefix + userContent;
    }

    if (parsed.prompt !== userContent) {
      console.log(
        '[DS-Mini:MAIN] Mode:',
        currentMode,
        '| Injected context, prompt length:',
        parsed.prompt.length,
      );
      storeInjectionRecord(prefix, userContent);
    }
    return JSON.stringify(parsed);
  }

  function storeInjectionRecord(prefix, userText) {
    let el = document.getElementById('ds-mini-injected');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ds-mini-injected';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    // 每条记录格式:  prefix||SEP||original_user_input||MSG_SEP||
    const record = prefix + '||SEP||' + userText + '||MSG_SEP||';
    el.textContent = (el.textContent || '') + record;
  }

  // 保存助手原始响应文本（带 Markdown），供导出使用
  function saveAssistantResponse(text) {
    if (!text || !text.trim()) return;
    let el = document.getElementById('ds-mini-asst-raw');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ds-mini-asst-raw';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    const existing = el.textContent || '';
    el.textContent = existing ? existing + '||ASST_SEP||' + text : text;
  }

  function parseSkillCommand(text) {
    const match = text.match(/^\/([\w-]+)\s*(.*)/s);
    if (!match) return null;
    return { skillName: match[1], args: match[2].trim() };
  }

  // ==========================================================
  // SSE 解析 & 工具调用检测
  // ==========================================================
  // Buffer 存放在 XHR 实例上，避免并发请求互相污染
  function getBuf(xhr, name) {
    if (!xhr.__ds_buf) xhr.__ds_buf = { text: '', raw: '', pos: 0 };
    if (name === 'text') return xhr.__ds_buf.text;
    if (name === 'raw') return xhr.__ds_buf.raw;
    if (name === 'pos') return xhr.__ds_buf.pos;
  }
  function setBuf(xhr, name, val) {
    if (!xhr.__ds_buf) xhr.__ds_buf = { text: '', raw: '', pos: 0 };
    xhr.__ds_buf[name] = val;
  }

  function createProgressHandler() {
    return function (event) {
      const xhr = event.target;
      if (!xhr || !xhr.responseText) return;

      // Token 速度: 记录首次响应时间
      if (!xhr.__ds_start) {
        xhr.__ds_start = performance.now();
        xhr.__ds_chars = 0;
        xhr.__ds_lastLen = 0;
      }

      var fullText = xhr.responseText;
      const pos = getBuf(xhr, 'pos');
      if (fullText.length <= pos) return;

      const newPart = fullText.slice(pos);
      setBuf(xhr, 'pos', fullText.length);

      const lines = newPart.split('\n');
      let finished = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('data:')) continue;

        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        var data;
        try {
          data = JSON.parse(dataStr);
        } catch (e) {
          continue;
        }

        const text = extractTextFromData(data);
        if (text) setBuf(xhr, 'text', getBuf(xhr, 'text') + text);

        // 方法2: 直接扫描原始 data 行
        setBuf(xhr, 'raw', getBuf(xhr, 'raw') + dataStr);

        if (isStreamFinished(data)) finished = true;
      }

      // 扫描双 buffer
      checkToolCallsBoth(xhr);

      // Token 速度: 每 500ms 更新一次
      if (xhr.__ds_start) {
        xhr.__ds_chars =
          (xhr.__ds_chars || 0) +
          (xhr.__ds_lastLen ? getBuf(xhr, 'text').length - xhr.__ds_lastLen : 0);
        xhr.__ds_lastLen = getBuf(xhr, 'text').length;
        var elapsed = (performance.now() - xhr.__ds_start) / 1000;
        if (elapsed > 0.5) {
          const tokPerSec = ((xhr.__ds_chars || 0) * 0.35) / elapsed;
          window.postMessage(
            { type: 'DS_MINI_TOKEN_SPEED', tokPerSec: tokPerSec, finished: false },
            '*',
          );
        }
      }

      if (finished) {
        if (xhr.__ds_start) {
          var elapsed = (performance.now() - xhr.__ds_start) / 1000;
          const totalChars = xhr.__ds_chars || 0;
          const finalTokPerSec = totalChars > 0 && elapsed > 0 ? (totalChars * 0.35) / elapsed : 0;
          window.postMessage(
            { type: 'DS_MINI_TOKEN_SPEED', tokPerSec: finalTokPerSec, finished: true },
            '*',
          );
        }
        var fullText = getBuf(xhr, 'text');
        if (fullText) saveAssistantResponse(fullText);
        flushBuffers(xhr);
      }
    };
  }

  // ==========================================================
  // 文本提取（支持 DeepSeek SSE 格式）
  // ==========================================================
  // ponytail: duplicates sse-parser.ts extractContent(). Keep in sync.
  function extractTextFromData(data) {
    if (!data || typeof data !== 'object') return '';

    if (typeof data.v === 'string') return data.v;

    if (Array.isArray(data.choices)) {
      var text = '';
      for (var i = 0; i < data.choices.length; i++) {
        const delta = data.choices[i].delta;
        if (delta && typeof delta.content === 'string') text += delta.content;
      }
      return text;
    }

    const v = data.v;
    if (!v || typeof v !== 'object') return '';
    const response = v.response;
    if (!response || typeof response !== 'object') return '';

    const fragments = response.fragments;
    if (!Array.isArray(fragments)) return '';

    var text = '';
    for (var i = 0; i < fragments.length; i++) {
      const frag = fragments[i];
      const op = frag.o || frag.op;
      const val = frag.v;
      if ((op === 'APPEND' || op === 'append') && typeof val === 'string') {
        if (_isTextPath(frag.path)) text += val;
      }
    }
    return text;
  }

  function _isTextPath(path) {
    if (typeof path !== 'string') return false;
    return (
      path.indexOf('content') !== -1 || path.indexOf('text') !== -1 || path.indexOf('delta') !== -1
    );
  }

  function isStreamFinished(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.v && data.v.response && data.v.response.status === 'FINISHED') return true;
    if (Array.isArray(data.choices)) {
      for (let i = 0; i < data.choices.length; i++) {
        if (data.choices[i].finish_reason === 'stop') return true;
      }
    }
    return false;
  }

  // ==========================================================
  // 工具调用检测（双路径）— 使用 XHR 绑定的 buffer
  // ==========================================================
  function checkToolCallsBoth(xhr) {
    let textBuf = getBuf(xhr, 'text');
    let rawBuf = getBuf(xhr, 'raw');

    // 路径A: 从文本 buffer 中检测
    let calls = extractFromText(textBuf);
    if (calls.length === 0) {
      // 路径B: 从原始 data 行中直扫
      calls = extractFromText(rawBuf);
    }
    if (calls.length === 0) return;

    console.log(
      '[DS-Mini:MAIN] Tool calls detected:',
      calls.map(function (c) {
        return c.name;
      }),
    );
    for (let i = 0; i < calls.length; i++) {
      setBuf(xhr, 'text', textBuf.replace(calls[i].raw, ''));
      setBuf(xhr, 'raw', rawBuf.replace(calls[i].raw, ''));
      textBuf = getBuf(xhr, 'text');
      rawBuf = getBuf(xhr, 'raw');
    }
    window.postMessage({ type: 'DS_MINI_TOOL_CALLS', toolCalls: calls }, '*');
  }

  // 每次调用创建新正则，避免 /g 标记的 lastIndex 问题
  // ponytail: regex built from TOOL_DESCRIPTORS, injected at build time by main-world.content.ts
  function extractFromText(text) {
    const regex = __DS_TOOL_NAMES_REGEX__;
    const calls = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1];
      const body = match[2].trim();
      let payload = {};
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
      } catch (e) {}
      calls.push({
        name: name,
        payload: payload,
        raw: match[0],
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      });
    }
    return calls;
  }

  function flushBuffers(xhr) {
    checkToolCallsBoth(xhr);
    if (xhr.__ds_buf) xhr.__ds_buf = { text: '', raw: '', pos: 0 };
  }

  // ==========================================================
  // 接收来自 content script 的消息
  // ==========================================================
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'DS_MINI_ISOLATED') return;

    switch (event.data.type) {
      case 'SET_SKILL':
        console.log('[DS-Mini:MAIN] Skill set:', event.data.skillName);
        activeSkill = event.data.skill;
        skillInstructions = event.data.instructions || '';
        break;
      case 'CLEAR_SKILL':
        activeSkill = null;
        skillInstructions = '';
        break;
      case 'SET_AGENT_MODE':
        agentModeEnabled = event.data.enabled;
        console.log('[DS-Mini:MAIN] Agent mode:', agentModeEnabled ? 'ON' : 'OFF');
        break;
      case 'DS_MINI_SILENT_RESULT':
        handleSilentLoop(event.data.text);
        break;
    }
  });

  // ==========================================================
  // 静默循环 — 直接 XHR 发送工具结果，不经过 DOM
  // ==========================================================
  let silentDepth = 0;
  const MAX_SILENT = 10;

  function handleSilentLoop(resultText) {
    if (!lastCtx.chat_session_id) {
      console.warn('[DS-Mini:MAIN] No chat context for silent loop');
      return;
    }

    silentDepth++;
    if (silentDepth > MAX_SILENT) {
      silentDepth = 0;
      console.warn('[DS-Mini:MAIN] Silent loop limit');
      return;
    }

    console.log('[DS-Mini:MAIN] Silent loop #' + silentDepth);

    // 延迟 1.5s 防 429
    setTimeout(function () {
      const xhr = new XMLHttpRequest();
      origOpen.call(xhr, 'POST', '/api/v0/chat/completion');
      xhr.setRequestHeader('Content-Type', 'application/json');

      // 解析 SSE 响应
      let buf = { text: '', raw: '', pos: 0 };

      xhr.addEventListener('progress', function () {
        if (!xhr.responseText) return;
        const fullText = xhr.responseText;
        if (fullText.length <= buf.pos) return;
        const part = fullText.slice(buf.pos);
        buf.pos = fullText.length;

        const lines = part.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line.startsWith('data:')) continue;
          const ds = line.slice(5).trim();
          if (!ds || ds === '[DONE]') continue;

          buf.raw += ds;
          var data;
          try {
            data = JSON.parse(ds);
          } catch (e) {
            continue;
          }

          const text = extractTextFromData(data);
          if (text) buf.text += text;

          if (isStreamFinished(data)) {
            // 检测新工具调用
            const reg =
              /<(web_search|web_fetch|news_hub|github_trending|doc_generate)>\s*(\{[\s\S]*?\})\s*(?:<\/\1>)?/g;
            const calls = [];
            var m;
            while ((m = reg.exec(buf.raw)) !== null) {
              let p = {};
              try {
                p = JSON.parse(m[2]);
              } catch {}
              calls.push({ name: m[1], payload: p, raw: m[0], id: crypto.randomUUID() });
            }
            if (calls.length > 0) {
              // 有新工具调用 → 继续循环
              window.postMessage({ type: 'DS_MINI_TOOL_CALLS', toolCalls: calls }, '*');
              console.log('[DS-Mini:MAIN] Silent loop continued:', calls.length, 'calls');
            } else if (buf.text.trim()) {
              // 没有新调用 → 最终响应，通知 content script 渲染
              window.postMessage(
                {
                  source: 'DS_MINI_MAIN_FINAL',
                  type: 'DS_MINI_FINAL_RESPONSE',
                  text: buf.text,
                },
                '*',
              );
            }
            buf = { text: '', raw: '', pos: 0 };
          }
        }
      });

      xhr.addEventListener('error', function () {
        // 失败时 fallback 到 DOM 模式
        window.postMessage(
          {
            source: 'DS_MINI_ISOLATED',
            type: 'DS_MINI_DOM_FALLBACK',
            text: resultText,
          },
          '*',
        );
        console.warn('[DS-Mini:MAIN] Silent loop XHR failed, fallback to DOM');
      });

      origSend.call(
        xhr,
        JSON.stringify({
          prompt: resultText,
          chat_session_id: lastCtx.chat_session_id,
          model_type: lastCtx.model_type,
        }),
      );
    }, 1500);
  }

  window.__DS_MINI_MODE = currentMode;
  console.log('[DS-Mini:MAIN] Ready, mode:', currentMode);

  // ==========================================================
  // 分类插件删除请求
  // ==========================================================
  window.addEventListener('message', function (event) {
    if (
      event.data &&
      event.data.source === 'DS_MINI_ISOLATED' &&
      event.data.type === 'DS_MINI_DELETE_SESSION'
    ) {
      const sid = event.data.sessionId;

      // 从 localStorage 读取 token（DeepSeek 的存储方式）
      let token = '';
      try {
        // 常见的 token 存储 key
        const keys = [
          'token',
          'accessToken',
          'access_token',
          'dsToken',
          'ds_access_token',
          'Authorization',
          'userToken',
        ];
        for (var i = 0; i < keys.length; i++) {
          const val = localStorage.getItem(keys[i]);
          if (val) {
            token = val;
            break;
          }
        }
        // 如果 localStorage 没找到，尝试从 cookie 读取
        if (!token) {
          const cookies = document.cookie.split(';');
          for (var i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (
              c.indexOf('token=') === 0 ||
              c.indexOf('access=') === 0 ||
              c.indexOf('auth=') === 0
            ) {
              token = c.substring(c.indexOf('=') + 1);
              break;
            }
          }
        }
      } catch (e) {}

      const headers = { 'Content-Type': 'application/json' };
      // 优先使用捕获到的页面 auth header
      const capturedAuth = window.__DS_DELETE_AUTH__;
      if (capturedAuth) {
        headers['Authorization'] = capturedAuth;
      }

      // 如果还没捕获到，直接去 localStorage 读各种可能 key
      if (!capturedAuth) {
        try {
          for (let lsi = 0; lsi < localStorage.length; lsi++) {
            const lsk = localStorage.key(lsi);
            if (
              lsk &&
              (lsk.indexOf('token') !== -1 ||
                lsk.indexOf('auth') !== -1 ||
                lsk.indexOf('Token') !== -1 ||
                lsk.indexOf('Auth') !== -1)
            ) {
              const lsv = localStorage.getItem(lsk);
              console.log(
                '[DS-Mini:MAIN] localStorage token candidate:',
                lsk,
                '=',
                lsv ? lsv.substring(0, 30) + '...' : 'empty',
              );
            }
          }
        } catch (e) {}

        // 检查 sessionStorage
        try {
          for (let ssi = 0; ssi < sessionStorage.length; ssi++) {
            const ssk = sessionStorage.key(ssi);
            if (ssk && (ssk.indexOf('token') !== -1 || ssk.indexOf('auth') !== -1)) {
              const ssv = sessionStorage.getItem(ssk);
              console.log(
                '[DS-Mini:MAIN] sessionStorage token candidate:',
                ssk,
                '=',
                ssv ? ssv.substring(0, 30) + '...' : 'empty',
              );
            }
          }
        } catch (e) {}

        // 读取 cookies（完整输出用于诊断）
        console.log('[DS-Mini:MAIN] Cookies:', document.cookie);
      }

      console.log(
        '[DS-Mini:MAIN] Delete request for',
        sid,
        'auth:',
        headers['Authorization'] ? headers['Authorization'].substring(0, 30) + '...' : 'NONE',
      );

      fetch('/api/v0/chat_session/delete', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ chat_session_id: sid }),
      })
        .then(function (r) {
          return r.json().catch(function () {
            return { code: r.status, msg: r.statusText };
          });
        })
        .then(function (data) {
          window.postMessage(
            {
              source: 'DS_MINI_MAIN',
              type: 'DS_MINI_DELETE_RESPONSE',
              sessionId: sid,
              success: data.code === 0 || data.code === 200 || !data.code,
              response: data,
            },
            '*',
          );
          if (data.code === 0 || data.code === 200 || !data.code) {
            console.log('[DS-Mini:MAIN] Session deleted:', sid);
          } else {
            console.warn('[DS-Mini:MAIN] Delete failed:', data);
          }
        })
        .catch(function (err) {
          window.postMessage(
            {
              source: 'DS_MINI_MAIN',
              type: 'DS_MINI_DELETE_RESPONSE',
              sessionId: sid,
              success: false,
              error: err.message,
            },
            '*',
          );
        });
    }
  });
})();
