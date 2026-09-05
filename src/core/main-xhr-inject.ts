// ============================================================
// deepseek-enhancer — 主世界 XHR 拦截脚本
// ============================================================
// 此文件为 raw 注入脚本（原文注入页面执行），不参与类型系统
// 消息名与 src/core/protocol.ts 的 union 对齐，改动须同步：
//   MAIn→Isolated: DS_MINI_TOOL_CALLS / DS_MINI_NEW_SESSION
//   Isolated→MAIN: SET_SKILL / CLEAR_SKILL / SET_AGENT_MODE / DS_MINI_AGENT_STOP
/* eslint-disable no-var, @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
(function () {
  'use strict';

  if (window.__DS_MINI_XHR_HOOKED__) return;
  window.__DS_MINI_XHR_HOOKED__ = true;

  console.log('[DS-Mini:MAIN] XHR hook installed');

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
      }
    }, 200);
  });
  if (document.body) modeObserver.observe(document.body, { childList: true, subtree: true });

  // ==========================================================
  // 工具定义 — 由构建期 seam 生成（main-world.content.ts 注入时替换占位符）
  // 注意：注释中不得出现占位符字面量，否则 replace 只替换第一处会放走真正的注入点
  // ==========================================================
  const TOOL_DEFS = JSON.parse('__DS_TOOL_DEFS__');
  const disabledTools = {}; // 用户禁用的工具列表

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
        lines.push(
          'format=md 时 content 为 Markdown；format=html 时 content 为完整 HTML 文档（<!DOCTYPE html> 开头、内联 <style> 样式，适合复杂版式页面），content 为 Markdown 时会自动转成 HTML',
        );
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
    lines.push(
      '- 任务完成后请输出 <task_complete>{"summary": "完成总结"}</task_complete> 标记结束',
    );
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
  let stopRequested = false; // 用户点击 Stop 后置位，吞掉后续工具事件
  let lastIsNewUserFlow = true; // 最近一次请求是否新用户消息（非工具结果回注）
  const lastCtx = {
    chat_session_id: '',
    model_type: '',
    lastBody: null,
    parentMessageId: null,
  }; // 用于静默循环

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__ds_url = String(url);
    this.__ds_method = method;
    return origOpen.call(this, method, url, ...args);
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
          lastCtx.lastBody = parsedCtx; // 保存完整请求体供静默循环复用

          // 新用户消息（非工具结果回注）→ 重置 parentMessageId + 复位停止标记
          // 回注 prompt 以「以下是工具执行结果」开头（formatResults 输出），旧前缀 [工具执行结果] 已废弃
          if (parsedCtx.prompt && parsedCtx.prompt.indexOf('以下是工具执行结果') !== 0) {
            lastCtx.parentMessageId = null;
            stopRequested = false;
            lastIsNewUserFlow = true;
          } else {
            lastIsNewUserFlow = false;
          }

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

    // Agent 模式关闭 → 不注入任何内容
    if (!agentModeEnabled) {
      return JSON.stringify(parsed);
    }

    // Agent 模式开启时，即使是工具结果回注也注入工具定义（支持多轮循环）
    // ponytail: 静默 XHR 因 PoW 防重放不可用，改用 DOM 纯循环，需每轮注入工具定义

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

      if (finished) {
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

    // 新格式：fragments 数组行（{"p":"response/fragments","o":"APPEND","v":[{type,content,...}]}）
    // 开标签 `<` 等字符可能以数组形式到达，旧实现只处理 string v 会漏掉
    if (data.o === 'APPEND' && Array.isArray(data.v)) {
      var arrText = '';
      for (var ai = 0; ai < data.v.length; ai++) {
        const fr = data.v[ai];
        if (
          fr &&
          typeof fr.content === 'string' &&
          (fr.type === 'RESPONSE' || fr.type === 'TEXT' || !fr.type)
        ) {
          arrText += fr.content;
        }
      }
      return arrText;
    }

    // 裸 string v 行（新格式主体）：排除 o === 'SET' 状态行（FINISHED 等），
    // 否则状态值会被当作文本追加进 buffer，污染 saveAssistantResponse 落盘数据
    // ponytail: 与 sse-parser.ts extractContent 方式0a 保持一致
    if (typeof data.v === 'string' && data.o !== 'SET') return data.v;

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
    // 新格式：{"p":"response/status","o":"SET","v":"FINISHED"}
    if (data.o === 'SET' && data.p === 'response/status' && data.v === 'FINISHED') return true;
    if (Array.isArray(data.choices)) {
      for (let i = 0; i < data.choices.length; i++) {
        // ponytail: 与 sse-parser.ts 一致，length（token 上限）也是结束
        if (
          data.choices[i].finish_reason === 'stop' ||
          data.choices[i].finish_reason === 'length'
        ) {
          return true;
        }
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

    // FR-5: 先检测 task_complete 标记（平衡扫描，summary 含嵌套花括号不截断）
    // 注意：移除标记后不 return——同一 buffer 可能既有工具调用又有 task_complete
    // （异常输出顺序），继续走下方工具检出，与 ui-tool-blocks DOM 兜底行为对齐
    var tc = extractTaskCompleteFrom(textBuf) || extractTaskCompleteFrom(rawBuf);
    if (tc) {
      console.log('[DS-Mini:MAIN] Task complete marker detected, summary:', tc.summary);

      // 移除标记（DOM submit 下页面自己渲染最终回复，不额外注入）
      setBuf(xhr, 'text', stripTaskCompleteFrom(textBuf));
      setBuf(xhr, 'raw', stripTaskCompleteFrom(rawBuf));
      textBuf = getBuf(xhr, 'text');
      rawBuf = getBuf(xhr, 'raw');
    }

    // 路径A: 从文本 buffer 中检测
    let calls = extractFromText(textBuf);
    if (calls.length === 0) {
      // 路径B: 从原始 data 行中直扫
      calls = extractFromText(rawBuf);
    }
    if (calls.length === 0) return;
    // 用户已点击 Stop → 吞掉后续工具事件，不再触发新循环
    if (stopRequested) return;

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
    window.postMessage(
      {
        source: 'DS_MINI_MAIN',
        type: 'DS_MINI_TOOL_CALLS',
        toolCalls: calls,
        isNewUserFlow: lastIsNewUserFlow,
      },
      '*',
    );
  }

  // 每次调用创建新正则，避免 /g 标记的 lastIndex 问题
  // ponytail: regex built from TOOL_DESCRIPTORS, injected at build time by main-world.content.ts
  // JSON 主体用平衡扫描提取（content 可能含嵌套花括号，非贪婪正则会提前截断）
  function extractBalancedJson(text, startIndex) {
    if (text[startIndex] !== '{') return null;
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = startIndex; i < text.length; i++) {
      var ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(startIndex, i + 1);
      }
    }
    return null;
  }

  // 宽松解析模型输出的 JSON：先严格 parse，失败后修复字符串值内未转义的控制字符
  // （真实换行/回车/Tab）与尾逗号重试，仍失败返回 null
  function parseToolJsonLoose(body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return null;
    } catch (e) {}

    let fixed = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (inString) {
        if (escaped) {
          fixed += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          fixed += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          fixed += ch;
          inString = false;
          continue;
        }
        const code = ch.charCodeAt(0);
        if (code < 0x20) {
          fixed +=
            ch === '\n'
              ? '\\n'
              : ch === '\r'
                ? '\\r'
                : ch === '\t'
                  ? '\\t'
                  : '\\u' + code.toString(16).padStart(4, '0');
          continue;
        }
        fixed += ch;
        continue;
      }
      if (ch === '"') inString = true;
      fixed += ch;
    }
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

    try {
      const parsed = JSON.parse(fixed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return null;
  }

  // task_complete：平衡扫描定位 JSON 主体（summary 含嵌套花括号不截断）
  function extractTaskCompleteFrom(text) {
    if (!text) return null;
    var tagStart = text.indexOf('<task_complete>');
    if (tagStart < 0) return null;
    var jsonStart = tagStart + '<task_complete>'.length;
    var body = extractBalancedJson(text, jsonStart);
    if (!body) return null;
    var parsed = parseToolJsonLoose(body);
    return { summary: (parsed && parsed.summary) || '任务完成' };
  }

  function stripTaskCompleteFrom(text) {
    if (!text) return '';
    var result = text;
    while (true) {
      var tagStart = result.indexOf('<task_complete>');
      if (tagStart < 0) break;
      var jsonStart = tagStart + '<task_complete>'.length;
      var body = extractBalancedJson(result, jsonStart);
      if (!body) break;
      var end = jsonStart + body.length;
      var close = result.slice(end).match(/^\s*<\/task_complete>/);
      if (close) end += close[0].length;
      result = result.slice(0, tagStart) + result.slice(end);
    }
    return result.trim();
  }

  function extractFromText(text) {
    const regex = __DS_TOOL_NAMES_REGEX__;
    const calls = [];
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1];
      const tagEnd = match.index + match[0].length;

      // 跳过标签与 JSON 之间的空白
      let jsonStart = tagEnd;
      while (jsonStart < text.length && /\s/.test(text[jsonStart])) jsonStart++;
      const body = extractBalancedJson(text, jsonStart);
      if (!body) continue;

      // raw = 标签 + 空白 + JSON（闭合标签可选）
      let rawEnd = jsonStart + body.length;
      const afterRaw = text.slice(rawEnd).match(new RegExp('^\\s*</' + name + '>'));
      let raw = text.slice(match.index, rawEnd);
      if (afterRaw) {
        raw += afterRaw[0];
        rawEnd += afterRaw[0].length;
      }

      const payload = parseToolJsonLoose(body) || {};
      calls.push({
        name: name,
        payload: payload,
        raw: raw,
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      });

      // 跳过已消费的 raw，避免重复匹配
      regex.lastIndex = rawEnd;
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
      case 'DS_MINI_AGENT_STOP':
        stopRequested = true;
        console.log('[DS-Mini:MAIN] Stop requested, agent loop halted');
        break;
    }
  });

  console.log('[DS-Mini:MAIN] Ready, mode:', currentMode);
})();
