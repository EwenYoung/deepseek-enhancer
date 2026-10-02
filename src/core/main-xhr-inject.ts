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

  // 官方页面已下线快速/专家/识图三种模式，只剩单一入口，无需再做模式检测；
  // 工具定义按工具面板开关全量注入。

  // ==========================================================
  // 工具定义 — 由构建期 seam 生成（main-world.content.ts 注入时替换占位符）
  // 注意：注释中不得出现占位符字面量，否则 replace 只替换第一处会放走真正的注入点
  // ==========================================================
  const TOOL_DEFS = JSON.parse('__DS_TOOL_DEFS__');

  function buildToolDefs() {
    const disabledTools = {}; // 每次构建重算：工具在面板重新启用后无需刷新页面即生效
    try {
      const ls = JSON.parse(localStorage.getItem('ds_mini_tools_state') || '{}');
      for (const k in ls) {
        if (!ls[k]) disabledTools[k] = true;
      }
    } catch (e) {}
    const avail = TOOL_DEFS.filter(function (t) {
      return !disabledTools[t.name];
    });
    if (avail.length === 0) return '';

    const lines = [];

    lines.push('【工具调用说明】');
    lines.push('如果需要实时信息（如新闻、天气、网页内容），请按以下格式调用工具：');
    lines.push('');

    for (var i = 0; i < avail.length; i++) {
      const t = avail[i];
      if (t.name === 'news_hub') {
        lines.push('聚合新闻：<news_hub>{"sources": "baidu,weibo,zhihu,36kr"}</news_hub>');
        lines.push('8大实时源：百度热搜|微博热搜|GitHub|知乎|36氪|arXiv|HN|Reddit');
        lines.push('例如：<news_hub>{}</news_hub>（全部源）或指定部分源');
      } else if (t.name === 'github_trending') {
        lines.push('GitHub热门：<github_trending>{}</github_trending>');
        lines.push('获取 GitHub 当日最热开源项目');
        lines.push('例如：<github_trending>{"since": "daily"}</github_trending>');
      } else if (t.name === 'doc_generate') {
        lines.push(
          '生成文档：<doc_generate>{"title": "文件名","format": "md 或 html","content": "正文"}</doc_generate>',
        );
        lines.push('format=md 时 content 为 Markdown；format=html 时 content 为完整 HTML 文档');
      }
      lines.push('');
    }

    lines.push('重要规则：');
    lines.push('- 必须替换 query/url 为真实内容，不要使用占位符');
    lines.push('- 一次只输出一个 XML 标签，放到回复末尾');
    lines.push('- 收到工具结果后，如有需要可以再次调用工具，直到完成全部需求后再回复用户');
    return '<tool_defs>\n' + lines.join('\n') + '\n</tool_defs>';
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
  // 已注入工具定义的会话 ID。localStorage 持久化：会话从头注入过之后，
  // 页面刷新也不再重复补注入（刷新后 server 历史里首条已带定义，模型仍可调用；
  // 历史里从未注入过的会话中途打开 Agent 开关时才补注入一次）
  let injectedSessions = {};
  const INJECTED_KEY = 'ds_mini_injected_sessions';
  try {
    const stored = localStorage.getItem(INJECTED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) injectedSessions = parsed;
    }
  } catch (e) {
    /* localStorage 不可用时退化为仅内存记录（刷新后可能重复，但功能不中断） */
  }
  function rememberInjected(sid) {
    injectedSessions[sid] = true;
    // 只增不清的会话键会缓慢累积（每条约 36 字符），设置上限防止长期占用；
    // 旧的会话记录被淘汰后若再中途开启 Agent，会重新补注入一次（无副作用）
    const keys = Object.keys(injectedSessions);
    if (keys.length > 200) {
      for (var i = 0; i < keys.length - 200; i++) delete injectedSessions[keys[i]];
    }
    try {
      localStorage.setItem(INJECTED_KEY, JSON.stringify(injectedSessions));
    } catch (e) {}
  }
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
        this.__ds_session = parsedCtx.chat_session_id || '';
        if (parsedCtx.chat_session_id) {
          lastCtx.chat_session_id = parsedCtx.chat_session_id;
          lastCtx.model_type = parsedCtx.model_type || 'default';
          lastCtx.lastBody = parsedCtx; // 保存完整请求体供静默循环复用

          // 新用户消息（非工具结果回注）→ 重置 parentMessageId + 复位停止标记
          // 回注 prompt 以 <tool_results> 开头（formatResults 输出）；旧中文前缀
          // 仍识别（历史会话粘贴等场景），防止回注被误判为新用户消息
          if (
            parsedCtx.prompt &&
            parsedCtx.prompt.indexOf('<tool_results>') !== 0 &&
            parsedCtx.prompt.indexOf('以下是工具执行结果') !== 0
          ) {
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
      const progressHandler = createProgressHandler();
      this.addEventListener('progress', progressHandler);
      this.addEventListener('load', createLoadHandler(progressHandler));
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

    // 工具定义注入门槛：会话首条消息（parent_message_id 为空）注入；历史里从未
    // 注入过定义的会话中途才打开 Agent 开关时补注入一次（injectedSessions 持久化在
    // localStorage：页面刷新后靠它避免对已注入过的会话重复补注入，否则第二轮以后的
    // 用户消息会被反复包上工具定义）。工具结果回注（循环续接）一律不注入，定义留在
    // 会话历史里，续接轮次依赖它继续调用工具。
    const isToolResultEcho =
      userContent.indexOf('<tool_results>') === 0 ||
      userContent.indexOf('以下是工具执行结果') === 0;
    const sid = parsed.chat_session_id || '';
    const needToolDefs =
      !isToolResultEcho && (!parsed.parent_message_id || (sid !== '' && !injectedSessions[sid]));

    const toolDefs = needToolDefs ? buildToolDefs() : '';
    let prefix = '';

    // 注入块与用户原文各包一层 XML，模型据此区分消息类型；无注入块时不包装，
    // 保持裸用户消息
    // 检测 /skill 命令
    const skillCmd = parseSkillCommand(userContent);
    if (skillCmd && skillInstructions) {
      const parts = [];
      if (toolDefs) parts.push(toolDefs);
      parts.push('<skill_instructions>\n' + skillInstructions + '\n</skill_instructions>');
      prefix = parts.join('\n\n');
      const userArgs = skillCmd.args || userContent.slice(skillCmd.skillName.length + 1).trim();
      parsed.prompt =
        prefix + '\n\n<user_message>\n' + (userArgs || userContent) + '\n</user_message>';
    } else if (toolDefs) {
      prefix = toolDefs;
      parsed.prompt = prefix + '\n\n<user_message>\n' + userContent + '\n</user_message>';
    }

    if (toolDefs && sid) rememberInjected(sid);

    if (parsed.prompt !== userContent) {
      console.log('[DS-Mini:MAIN] Injected context, prompt length:', parsed.prompt.length);
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

  // 保存助手原始响应文本（带 Markdown），供导出使用；每条记录按会话 ID 归档
  // （「会话 ID||ASST_SID||文本」，解析侧 chat-exporter.ts，分隔符须同步）
  function saveAssistantResponse(text, xhr) {
    if (!text || !text.trim()) return;
    let el = document.getElementById('ds-mini-asst-raw');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ds-mini-asst-raw';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    const record = (xhr && xhr.__ds_session ? xhr.__ds_session : '') + '||ASST_SID||' + text;
    const existing = el.textContent || '';
    el.textContent = existing ? existing + '||ASST_SEP||' + record : record;
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

  // 每条完成请求恰落一条助手响应记录（progress 命中 FINISHED 或 load 兜底时调用）。
  // 纯工具调用轮的正文剥空但确有响应，落占位记录保持
  // 请求↔记录一一对应：缺失会让缓存条数与页面气泡数出现差口，导出配对整体错位
  function saveAssistantFinal(xhr) {
    if (xhr.__ds_saved) return;
    var fullText = getBuf(xhr, 'text');
    if (!fullText && getBuf(xhr, 'raw')) fullText = '（工具调用）';
    if (fullText) saveAssistantResponse(fullText, xhr);
    xhr.__ds_saved = true;
  }

  function createProgressHandler() {
    return function (event) {
      const xhr = event.target;
      if (!xhr || !xhr.responseText || xhr.__ds_done) return;

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

        const text = extractTextFromData(xhr, data);
        if (text) setBuf(xhr, 'text', getBuf(xhr, 'text') + text);

        // 思考过程增量不进 raw 兜底缓冲，防止思考里提及的工具标签被误检出。
        // 思考段增量同样可能是无 p 字段裸行（{"v":"字"}）或 fragments/-1/content 行，
        // 按当前流的阶段（getFragPhase）一并过滤
        const p = typeof data.p === 'string' ? data.p : '';
        const inThinking =
          p.indexOf('thinking') !== -1 ||
          p.indexOf('reasoning') !== -1 ||
          getFragPhase(xhr) === 'THINK';
        if (!inThinking) {
          setBuf(xhr, 'raw', getBuf(xhr, 'raw') + dataStr);
        }

        if (isStreamFinished(data)) finished = true;
      }

      // 扫描双 buffer
      checkToolCallsBoth(xhr);

      if (finished) {
        // 流已完成：置完成标记，后续 progress/load 一律忽略。
        // 否则位置清零后的整段重扫会把同一条回复存两次、工具调用检出两遍
        saveAssistantFinal(xhr);
        xhr.__ds_done = true;
        flushBuffers(xhr);
      }
    };
  }

  // FINISHED 行可能落在只触发 load 的尾块里：不兜底的话这条回复就存不上
  function createLoadHandler(progressHandler) {
    return function (event) {
      const xhr = event.target;
      if (!xhr || xhr.__ds_done) return;
      progressHandler(event);
      if (!xhr.__ds_done) {
        saveAssistantFinal(xhr);
        xhr.__ds_done = true;
        flushBuffers(xhr);
      }
    };
  }

  // ==========================================================
  // 文本提取（支持 DeepSeek SSE 格式）
  // ==========================================================
  // fragment 阶段跟踪：思考增量与正文增量共用 "response/fragments/-1/content"
  // 路径（-1 是当前活跃 fragment 占位，路径不含 thinking/reasoning 字样，凭行
  // 内容无法区分），后续增量多为无 p 字段的裸行（{"v":"字"}）。DeepSeek 流
  // 顺序固定：快照行（携带 thinking_enabled / fragments 类型）→ 思考段 →
  // 携带 type=RESPONSE 的 fragments 数组行（正文开始标记）→ 正文段。判定规则：
  //   1. 初始视为正文（RESPONSE），兼容无快照行的简单流；
  //   2. 快照行按 thinking_enabled 与 fragments 类型校正当前阶段；
  //   3. 思考阶段的 -1/content 与裸行一律不进正文缓存（修复：思考文本曾混入
  //      缓存并随导出重复出现在正文位置）。
  // 阶段状态挂在 XHR 实例（__ds_frag_phase），与 text/raw/pos buffer 一致按流隔离，
  // 避免并发流（用户连发多条）互相污染导致正文丢失或思考混入。
  function getFragPhase(xhr) {
    return xhr && xhr.__ds_frag_phase ? xhr.__ds_frag_phase : 'RESPONSE';
  }
  function setFragPhase(xhr, v) {
    if (xhr) xhr.__ds_frag_phase = v;
  }

  function trackFragPhase(xhr, data) {
    if (!data || typeof data !== 'object') return;
    if (data.o === 'APPEND' && Array.isArray(data.v)) {
      for (var i = 0; i < data.v.length; i++) {
        var fr = data.v[i];
        if (fr && (fr.type === 'THINK' || fr.type === 'RESPONSE')) setFragPhase(xhr, fr.type);
      }
    }
    // message 快照行（v.response.fragments 携带类型），取最后一个作为当前阶段；
    // 快照行无有效 fragments 类型时以 thinking_enabled 判定（无思考流程直接进入正文）
    var resp =
      data.v && typeof data.v === 'object' && !Array.isArray(data.v) ? data.v.response : null;
    if (resp && Array.isArray(resp.fragments) && resp.fragments.length > 0) {
      var last = resp.fragments[resp.fragments.length - 1];
      if (last && (last.type === 'THINK' || last.type === 'RESPONSE')) setFragPhase(xhr, last.type);
    } else if (resp && typeof resp.thinking_enabled === 'boolean') {
      setFragPhase(xhr, resp.thinking_enabled ? 'THINK' : 'RESPONSE');
    }
  }

  // ponytail: duplicates sse-parser.ts extractContent(). Keep in sync.
  function extractTextFromData(xhr, data) {
    if (!data || typeof data !== 'object') return '';

    trackFragPhase(xhr, data);

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
    // 否则状态值会被当作文本追加进 buffer，污染 saveAssistantResponse 落盘数据。
    // 思考过程增量同样以 string v 到达（p 含 thinking/reasoning），不排除就会混进
    // 正文缓存与续接上下文；思考段增量还可能是无 p 字段的裸行（{"v":"字"}），
    // 一律按当前阶段判定：THINK 阶段的增量不进正文缓存；
    // ponytail: 与 sse-parser.ts extractContent 方式0a 保持一致
    if (typeof data.v === 'string' && data.o !== 'SET') {
      const p = typeof data.p === 'string' ? data.p : '';
      if (p.indexOf('thinking') !== -1 || p.indexOf('reasoning') !== -1) return '';
      if (getFragPhase(xhr) === 'THINK') return '';
      return data.v;
    }

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
    // thinking_content 这类思考路径也含 "content" 子串，必须先排除
    if (path.indexOf('thinking') !== -1 || path.indexOf('reasoning') !== -1) return false;
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

  console.log('[DS-Mini:MAIN] Ready');
})();
