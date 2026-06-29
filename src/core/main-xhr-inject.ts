// ============================================================
// deepseek-enhancer — 主世界 XHR 拦截脚本
// ============================================================
(function () {
  'use strict';

  if (window.__DS_MINI_XHR_HOOKED__) return;
  window.__DS_MINI_XHR_HOOKED__ = true;

  console.log('[DS-Mini:MAIN] XHR hook installed');

  // ==========================================================
  // 模式检测 — 使用 _31a22b0 定位实际激活的模式
  // ==========================================================
  var currentMode = 'expert';  // 默认专家

  function detectMode() {
    // 查找所有模式 span: 快速/专家/识图
    var spans = document.querySelectorAll('span._321831d');
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      // 激活的模式条目: 它所在的 .aa40b5de 的祖父级有 _31a22b0 类
      var p = s.parentElement;
      if (!p || !p.classList.contains('aa40b5de')) continue;
      var gp = p.parentElement;
      if (!gp || !gp.classList.contains('_31a22b0')) continue;

      var t = s.textContent || '';
      if (t.indexOf('快速') !== -1) return 'fast';
      if (t.indexOf('专家') !== -1) return 'expert';
      if (t.indexOf('识图') !== -1) return 'image';
    }
    return 'expert';
  }

  // 初始化检测
  currentMode = detectMode();

  // 监听模式切换（带去重保护，防止 SPA 反复触发）
  var modeObserverTimer = null;
  var modeObserver = new MutationObserver(function () {
    if (modeObserverTimer) return;
    modeObserverTimer = setTimeout(function () {
      modeObserverTimer = null;
      var prev = currentMode;
      var next = detectMode();
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
  var TOOL_DEFS = [
    { name: 'web_search',    label: '联网搜索',   params: { query: { desc: '搜索关键词' } } },
    { name: 'web_fetch',     label: '网页抓取',   params: { url: { desc: '目标网页的完整 URL' } } },
    { name: 'news_hub',      label: '新闻聚合',   params: { sources: { desc: '搜索源（可选）' } } },
    { name: 'github_trending', label: 'GitHub热门', params: { language: { desc: '语言' }, since: { desc: '周期' } } },
    { name: 'doc_generate',  label: '生成文档',   params: { title: { desc: '文件名' }, format: { desc: '格式: md/html' }, content: { desc: '文档内容（Markdown）' } } },
  ];
  var disabledTools = {}; // 用户禁用的工具列表

  // 监听来自 isolated world 的工具状态
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (e.data && e.data.source === 'DS_MINI_ISOLATED' && e.data.type === 'SET_TOOLS_STATE') {
      disabledTools = {};
      for (var k in e.data.tools) {
        if (!e.data.tools[k]) disabledTools[k] = true;
      }
      TOOL_DEFS_CACHE = {}; // 清空缓存
      // 清空旧注入记录，避免导出时混入旧工具定义
      var el = document.getElementById('ds-mini-injected');
      if (el) el.textContent = '';
    }
  });

  function buildToolDefs(mode) {
    try {
      var ls = JSON.parse(localStorage.getItem('ds_mini_tools_state') || '{}');
      for (var k in ls) { if (!ls[k]) disabledTools[k] = true; }
    } catch(e) {}
    var avail = [];
    for (var i = 0; i < TOOL_DEFS.length; i++) {
      if (!disabledTools[TOOL_DEFS[i].name]) avail.push(TOOL_DEFS[i]);
    }
    if (mode === 'fast') avail = avail.filter(function (t) { return t.name === 'web_fetch' || t.name === 'doc_generate'; });
    if (avail.length === 0) return '';

    var lines = [];

    lines.push('【工具调用说明】');
    lines.push('如果需要实时信息（如新闻、天气、网页内容），请按以下格式调用工具：');
    lines.push('');

    for (var i = 0; i < avail.length; i++) {
      var t = avail[i];
      if (t.name === 'web_search') {
        lines.push('搜索网络：<web_search>{"query": "你的搜索关键词"}</web_search>');
        lines.push('例如：<web_search>{"query": "2026年6月24日热点新闻"}</web_search>');
      } else if (t.name === 'web_fetch') {
        lines.push('抓取网页：<web_fetch>{"url": "目标页面完整URL"}</web_fetch>');
        lines.push('例如：<web_fetch>{"url": "https://github.com/bytedance/deer-flow"}</web_fetch>');
      } else if (t.name === 'news_hub') {
        lines.push('聚合新闻：<news_hub>{"sources": "baidu,weibo,zhihu,36kr"}</news_hub>');
        lines.push('8大实时源：百度热搜|微博热搜|GitHub|知乎|36氪|arXiv|HN|Reddit');
        lines.push('例如：<news_hub>{}</news_hub>（全部源）或指定部分源');
      } else if (t.name === 'github_trending') {
        lines.push('GitHub热门：<github_trending>{}</github_trending>');
        lines.push('获取 GitHub 当日最热开源项目');
        lines.push('例如：<github_trending>{"since": "daily"}</github_trending>');
      } else if (t.name === 'doc_generate') {
        lines.push('生成文档：<doc_generate>{"title": "文件名","format": "md","content": "..."}</doc_generate>');
        lines.push('将内容生成为可下载的文件，支持 Markdown 和 HTML');
        lines.push('例如：<doc_generate>{"title": "报告","format": "md","content": "# 报告标题\\n内容"}</doc_generate>');
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
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var activeSkill = null;
  var skillInstructions = '';
  var agentModeEnabled = false;
  var lastCtx = { chat_session_id: '', model_type: '' };  // 用于静默循环

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ds_url = String(url);
    this.__ds_method = method;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var url = this.__ds_url || '';
    var method = this.__ds_method || '';

    if (method.toUpperCase() === 'POST' && url.indexOf('/api/v0/chat/completion') !== -1) {
      // 保存会话上下文
      try {
        var parsedCtx = JSON.parse(body);
        if (parsedCtx.chat_session_id) {
          lastCtx.chat_session_id = parsedCtx.chat_session_id;
          lastCtx.model_type = parsedCtx.model_type || 'default';
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
    var parsed;
    try { parsed = JSON.parse(body); } catch (e) { return body; }
    if (!parsed.prompt || typeof parsed.prompt !== 'string') return body;

    var userContent = parsed.prompt;

    // 工具结果回注 → 不注入，直接放行
    if (userContent.indexOf('[工具执行结果]') === 0) {
      return JSON.stringify(parsed);
    }

    // Agent 模式关闭 → 不注入工具定义
    if (!agentModeEnabled) {
      // 只注入 skill 指令（如果有）
      if (skillInstructions) {
        var skillCmd = parseSkillCommand(userContent);
        if (skillCmd) {
          var skillPrefix = skillInstructions + '\n---\n';
          var userArgs = skillCmd.args || userContent.slice(skillCmd.skillName.length + 1).trim();
          parsed.prompt = skillPrefix + (userArgs || userContent);
          console.log('[DS-Mini:MAIN] Skill injected (agent off), length:', parsed.prompt.length);
          return JSON.stringify(parsed);
        }
      }
      return JSON.stringify(parsed);
    }

    var toolDefs = getToolDefs(currentMode);
    var prefix = '';

    // 检测 /skill 命令
    var skillCmd = parseSkillCommand(userContent);
    if (skillCmd && skillInstructions) {
      var parts = [];
      if (toolDefs) parts.push(toolDefs);
      if (skillInstructions) parts.push(skillInstructions);
      prefix = parts.join('\n') + '\n---\n';
      var userArgs = skillCmd.args || userContent.slice(skillCmd.skillName.length + 1).trim();
      parsed.prompt = prefix + (userArgs || userContent);
    } else if (toolDefs) {
      prefix = toolDefs + '\n---\n';
      parsed.prompt = prefix + userContent;
    }

    if (parsed.prompt !== userContent) {
      console.log('[DS-Mini:MAIN] Mode:', currentMode, '| Injected context, prompt length:', parsed.prompt.length);
      storeInjectionRecord(prefix, userContent);
    }
    return JSON.stringify(parsed);
  }

  function storeInjectionRecord(prefix, userText) {
    var el = document.getElementById('ds-mini-injected');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ds-mini-injected';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    // 每条记录格式:  prefix||SEP||original_user_input||MSG_SEP||
    var record = prefix + '||SEP||' + userText + '||MSG_SEP||';
    el.textContent = (el.textContent || '') + record;
  }

  // 保存助手原始响应文本（带 Markdown），供导出使用
  function saveAssistantResponse(text) {
    if (!text || !text.trim()) return;
    var el = document.getElementById('ds-mini-asst-raw');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ds-mini-asst-raw';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    var existing = el.textContent || '';
    el.textContent = existing ? existing + '||ASST_SEP||' + text : text;
  }

  function parseSkillCommand(text) {
    var match = text.match(/^\/([\w-]+)\s*(.*)/s);
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
    if (name === 'raw')  return xhr.__ds_buf.raw;
    if (name === 'pos')  return xhr.__ds_buf.pos;
  }
  function setBuf(xhr, name, val) {
    if (!xhr.__ds_buf) xhr.__ds_buf = { text: '', raw: '', pos: 0 };
    xhr.__ds_buf[name] = val;
  }

  function createProgressHandler() {
    return function (event) {
      var xhr = event.target;
      if (!xhr || !xhr.responseText) return;

      // Token 速度: 记录首次响应时间
      if (!xhr.__ds_start) { xhr.__ds_start = performance.now(); xhr.__ds_chars = 0; xhr.__ds_lastLen = 0; }

      var fullText = xhr.responseText;
      var pos = getBuf(xhr, 'pos');
      if (fullText.length <= pos) return;

      var newPart = fullText.slice(pos);
      setBuf(xhr, 'pos', fullText.length);

      var lines = newPart.split('\n');
      var finished = false;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith('data:')) continue;

        var dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        var data;
        try { data = JSON.parse(dataStr); } catch (e) { continue; }

        var text = extractTextFromData(data);
        if (text) setBuf(xhr, 'text', getBuf(xhr, 'text') + text);

        // 方法2: 直接扫描原始 data 行
        setBuf(xhr, 'raw', getBuf(xhr, 'raw') + dataStr);

        if (isStreamFinished(data)) finished = true;
      }

      // 扫描双 buffer
      checkToolCallsBoth(xhr);

      // Token 速度: 每 500ms 更新一次
      if (xhr.__ds_start) {
        xhr.__ds_chars = (xhr.__ds_chars || 0) + (xhr.__ds_lastLen ? getBuf(xhr, 'text').length - xhr.__ds_lastLen : 0);
        xhr.__ds_lastLen = getBuf(xhr, 'text').length;
        var elapsed = (performance.now() - xhr.__ds_start) / 1000;
        if (elapsed > 0.5) {
          var tokPerSec = ((xhr.__ds_chars || 0) * 0.35) / elapsed;
          window.postMessage({ type: 'DS_MINI_TOKEN_SPEED', tokPerSec: tokPerSec, finished: false }, '*');
        }
      }

      if (finished) {
        if (xhr.__ds_start) {
          var elapsed = (performance.now() - xhr.__ds_start) / 1000;
          var totalChars = xhr.__ds_chars || 0;
          var finalTokPerSec = totalChars > 0 && elapsed > 0 ? (totalChars * 0.35) / elapsed : 0;
          window.postMessage({ type: 'DS_MINI_TOKEN_SPEED', tokPerSec: finalTokPerSec, finished: true }, '*');
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
  function extractTextFromData(data) {
    if (!data || typeof data !== 'object') return '';

    if (typeof data.v === 'string') return data.v;

    if (Array.isArray(data.choices)) {
      var text = '';
      for (var i = 0; i < data.choices.length; i++) {
        var delta = data.choices[i].delta;
        if (delta && typeof delta.content === 'string') text += delta.content;
      }
      return text;
    }

    var v = data.v;
    if (!v || typeof v !== 'object') return '';
    var response = v.response;
    if (!response || typeof response !== 'object') return '';

    var fragments = response.fragments;
    if (!Array.isArray(fragments)) return '';

    var text = '';
    for (var i = 0; i < fragments.length; i++) {
      var frag = fragments[i];
      var op = frag.o || frag.op;
      var val = frag.v;
      if ((op === 'APPEND' || op === 'append') && typeof val === 'string') {
        text += val;
      }
    }
    return text;
  }

  function isStreamFinished(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.v && data.v.response && data.v.response.status === 'FINISHED') return true;
    if (Array.isArray(data.choices)) {
      for (var i = 0; i < data.choices.length; i++) {
        if (data.choices[i].finish_reason === 'stop') return true;
      }
    }
    return false;
  }

  // ==========================================================
  // 工具调用检测（双路径）— 使用 XHR 绑定的 buffer
  // ==========================================================
  function checkToolCallsBoth(xhr) {
    var textBuf = getBuf(xhr, 'text');
    var rawBuf  = getBuf(xhr, 'raw');

    // 路径A: 从文本 buffer 中检测
    var calls = extractFromText(textBuf);
    if (calls.length === 0) {
      // 路径B: 从原始 data 行中直扫
      calls = extractFromText(rawBuf);
    }
    if (calls.length === 0) return;

    console.log('[DS-Mini:MAIN] Tool calls detected:', calls.map(function (c) { return c.name; }));
    for (var i = 0; i < calls.length; i++) {
      setBuf(xhr, 'text', textBuf.replace(calls[i].raw, ''));
      setBuf(xhr, 'raw', rawBuf.replace(calls[i].raw, ''));
      textBuf = getBuf(xhr, 'text');
      rawBuf = getBuf(xhr, 'raw');
    }
    window.postMessage({ type: 'DS_MINI_TOOL_CALLS', toolCalls: calls }, '*');
  }

  // 每次调用创建新正则，避免 /g 标记的 lastIndex 问题
  function extractFromText(text) {
    var regex = /<(web_search|web_fetch|news_hub|github_trending|doc_generate)>\s*(\{[\s\S]*?\})\s*(?:<\/\1>)?/g;
    var calls = [];
    var match;
    while ((match = regex.exec(text)) !== null) {
      var name = match[1];
      var body = match[2].trim();
      var payload = {};
      try {
        var parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') payload = parsed;
      } catch (e) {}
      calls.push({
        name: name,
        payload: payload,
        raw: match[0],
        id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
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
  var silentDepth = 0;
  var MAX_SILENT = 10;

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
      var xhr = new XMLHttpRequest();
      origOpen.call(xhr, 'POST', '/api/v0/chat/completion');
      xhr.setRequestHeader('Content-Type', 'application/json');

      // 解析 SSE 响应
      var buf = { text: '', raw: '', pos: 0 };

      xhr.addEventListener('progress', function () {
        if (!xhr.responseText) return;
        var fullText = xhr.responseText;
        if (fullText.length <= buf.pos) return;
        var part = fullText.slice(buf.pos);
        buf.pos = fullText.length;

        var lines = part.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data:')) continue;
          var ds = line.slice(5).trim();
          if (!ds || ds === '[DONE]') continue;

          buf.raw += ds;
          var data;
          try { data = JSON.parse(ds); } catch (e) { continue; }

          var text = extractTextFromData(data);
          if (text) buf.text += text;

          if (isStreamFinished(data)) {
            // 检测新工具调用
            var reg = /<(web_search|web_fetch|news_hub|github_trending|doc_generate)>\s*(\{[\s\S]*?\})\s*(?:<\/\1>)?/g;
            var calls = [];
            var m;
            while ((m = reg.exec(buf.raw)) !== null) {
              var p = {};
              try { p = JSON.parse(m[2]); } catch {}
              calls.push({ name: m[1], payload: p, raw: m[0], id: crypto.randomUUID() });
            }
            if (calls.length > 0) {
              // 有新工具调用 → 继续循环
              window.postMessage({ type: 'DS_MINI_TOOL_CALLS', toolCalls: calls }, '*');
              console.log('[DS-Mini:MAIN] Silent loop continued:', calls.length, 'calls');
            } else if (buf.text.trim()) {
              // 没有新调用 → 最终响应，通知 content script 渲染
              window.postMessage({
                source: 'DS_MINI_MAIN_FINAL',
                type: 'DS_MINI_FINAL_RESPONSE',
                text: buf.text,
              }, '*');
            }
            buf = { text: '', raw: '', pos: 0 };
          }
        }
      });

      xhr.addEventListener('error', function () {
        // 失败时 fallback 到 DOM 模式
        window.postMessage({
          source: 'DS_MINI_ISOLATED',
          type: 'DS_MINI_DOM_FALLBACK',
          text: resultText,
        }, '*');
        console.warn('[DS-Mini:MAIN] Silent loop XHR failed, fallback to DOM');
      });

      origSend.call(xhr, JSON.stringify({
        prompt: resultText,
        chat_session_id: lastCtx.chat_session_id,
        model_type: lastCtx.model_type,
      }));
    }, 1500);
  }

  window.__DS_MINI_MODE = currentMode;
  console.log('[DS-Mini:MAIN] Ready, mode:', currentMode);
})();
