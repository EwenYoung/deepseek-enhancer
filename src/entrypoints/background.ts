// ============================================================
// deepseek-enhancer — Background Service Worker
// ============================================================
// 代理跨域请求，绕过 CORS 限制
// 使用 Tavily API 进行搜索和网页抓取

const TAVILY_BASE = 'https://api.tavily.com';
const STORAGE_KEY = 'ds_mini_tavily_key';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXECUTE_TOOL') {
      handleToolExecution(message.payload).then(sendResponse);
      return true;
    }
    if (message.type === 'SET_API_KEY') {
      chrome.storage.local
        .set({ [STORAGE_KEY]: message.key })
        .then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.type === 'GET_API_KEY') {
      chrome.storage.local
        .get(STORAGE_KEY)
        .then((r) => sendResponse({ key: r[STORAGE_KEY] || '' }));
      return true;
    }
    if (message.type === 'TEST_TAVILY') {
      testTavily().then(sendResponse);
      return true;
    }
  });
});

// ============================================================
// 工具执行
// ============================================================
interface ToolExecRequest {
  name: string;
  payload: Record<string, unknown>;
}

async function handleToolExecution(req: ToolExecRequest) {
  const startTime = performance.now();

  try {
    const apiKey = await getAPIKey();

    let result: string;

    switch (req.name) {
      case 'web_search':
        if (!apiKey) return { success: false, error: '未设置 Tavily API Key', duration: 0 };
        result = await tavilySearch(apiKey, req.payload);
        break;
      case 'web_fetch':
        if (!apiKey) return { success: false, error: '未设置 Tavily API Key', duration: 0 };
        result = await tavilyExtract(apiKey, req.payload);
        break;
      case 'news_hub':
        result = await newsHubSearch(req.payload, apiKey);
        break;
      case 'github_trending':
        result = await githubTrendingSearch(req.payload);
        break;
      default:
        return { success: false, error: `Unknown tool: ${req.name}`, duration: 0 };
    }

    return {
      success: true,
      result,
      duration: performance.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration: performance.now() - startTime,
    };
  }
}

async function getAPIKey(): Promise<string> {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  return r[STORAGE_KEY] || '';
}

// ============================================================
// Tavily 连通性测试
// ============================================================
async function testTavily(): Promise<{ ok: boolean; message: string }> {
  const apiKey = await getAPIKey();
  if (!apiKey) {
    return { ok: false, message: '未配置 API Key' };
  }

  try {
    const res = await fetch(`${TAVILY_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: 'test',
        search_depth: 'basic',
        include_answer: false,
        max_results: 1,
      }),
    });

    if (res.ok) {
      return { ok: true, message: '连接正常 ✅' };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `API Key 无效 (HTTP ${res.status})` };
    }
    return { ok: false, message: `连接失败: HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: `网络错误: ${err instanceof Error ? err.message : '未知'}` };
  }
}

// ============================================================
// Tavily Search
// ============================================================
// API: POST https://api.tavily.com/search
// Docs: https://docs.tavily.com/api-reference/endpoint/search

async function tavilySearch(apiKey: string, payload: Record<string, unknown>): Promise<string> {
  const query = String(payload.query || payload.q || '');
  if (!query) throw new Error('web_search 缺少 query 参数');

  const body = JSON.stringify({
    api_key: apiKey,
    query,
    search_depth: 'advanced', // advanced 返回质量更高的结果
    include_answer: true, // AI 生成的摘要
    include_raw_content: false,
    max_results: 5,
    exclude_domains: [
      // 排除低质量/成人内容站
      'famosas.vip',
      'pornhub.com',
      'xvideos.com',
      'xhamster.com',
    ],
  });

  const res = await fetch(`${TAVILY_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tavily 搜索失败: HTTP ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const lines: string[] = [`🔍 搜索: "${query}"`, ''];

  // AI 生成的答案
  const answer = data.answer as string | undefined;
  if (answer) {
    lines.push(`**答案**: ${answer}`, '');
  }

  // 搜索结果
  const results = data.results as Array<Record<string, unknown>> | undefined;
  if (results && results.length > 0) {
    lines.push('**来源**:');
    for (const r of results) {
      const title = (r.title as string) || '(无标题)';
      const url = (r.url as string) || '';
      const content = (r.content as string) || '';
      const snippet = content.length > 300 ? content.slice(0, 300) + '...' : content;
      lines.push(`- **[${title}](${url})**`);
      if (snippet) lines.push(`  ${snippet}`);
    }
  }

  if (lines.length <= 2) lines.push('未找到相关结果。');

  return lines.join('\n');
}

// ============================================================
// Tavily Extract
// ============================================================
// API: POST https://api.tavily.com/extract
// Docs: https://docs.tavily.com/api-reference/endpoint/extract

async function tavilyExtract(apiKey: string, payload: Record<string, unknown>): Promise<string> {
  const url = String(payload.url || '');
  if (!url) throw new Error('web_fetch 缺少 url 参数');

  const urls = url
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length === 0) throw new Error('web_fetch 缺少有效的 url');

  const body = JSON.stringify({
    api_key: apiKey,
    urls,
    include_images: false,
    extract_depth: 'basic',
  });

  const res = await fetch(`${TAVILY_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tavily 抓取失败: HTTP ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const lines: string[] = [];

  const results = data.results as Array<Record<string, unknown>> | undefined;
  const failed = data.failed_results as Array<Record<string, unknown>> | undefined;

  if (results) {
    for (const r of results) {
      const rawContent = (r.raw_content as string) || '';
      const u = (r.url as string) || '';
      lines.push(`📄 抓取: ${u}`, '');

      if (rawContent) {
        const maxLen = 8000;
        lines.push(
          rawContent.length > maxLen
            ? rawContent.slice(0, maxLen) + '\n\n...（已截断）'
            : rawContent,
        );
      } else {
        lines.push('(无内容)');
      }
      lines.push('');
    }
  }

  if (failed && failed.length > 0) {
    lines.push('**抓取失败**:');
    for (const f of failed) {
      lines.push(`- ${f.url}: ${f.error || '未知错误'}`);
    }
  }

  return lines.join('\n') || '(无结果)';
}

// ============================================================
// 多源新闻聚合（百度热搜 + 微博热搜 + Tavily）
// ============================================================
async function newsHubSearch(payload: Record<string, unknown>, apiKey: string): Promise<string> {
  const defaultSources = 'baidu,weibo,github,zhihu,36kr,hackernews,reddit';
  const sources: string[] = String(payload.sources || defaultSources)
    .split(',')
    .map((s) => s.trim());
  const results: Array<{ source: string; content: string }> = [];

  for (const src of sources) {
    try {
      switch (src) {
        // 中文平台 — 用 Tavily 搜索绕过 CORS
        case 'baidu':
          results.push({
            source: '百度热搜',
            content: await searchViaTavily(apiKey, '2026年6月 百度热搜榜 实时热点'),
          });
          break;
        case 'weibo':
          results.push({
            source: '微博热搜',
            content: await searchViaTavily(apiKey, '2026年6月 微博热搜榜 实时'),
          });
          break;
        case 'zhihu':
          results.push({
            source: '知乎热榜',
            content: await searchViaTavily(apiKey, '2026年6月 知乎热榜 热点话题'),
          });
          break;
        case '36kr':
          results.push({
            source: '36氪 AI科技',
            content: await searchViaTavily(apiKey, '2026年6月 36氪 人工智能 科技新闻'),
          });
          break;
        // 国际平台 — 直接 API 调用（无 CORS 限制）
        case 'github':
          results.push({ source: 'GitHub Trending', content: await fetchGitHubTrending() });
          break;
        case 'hackernews':
          results.push({ source: 'Hacker News', content: await fetchHackerNews() });
          break;
        case 'reddit':
          results.push({ source: 'Reddit ML', content: await fetchRedditML() });
          break;
        case 'arxiv':
          results.push({ source: 'arXiv AI', content: await fetchArXiv() });
          break;
        default:
          results.push({ source: src, content: await searchViaTavily(apiKey, String(src)) });
          break;
      }
    } catch (err) {
      results.push({
        source: src,
        content: `获取失败: ${err instanceof Error ? err.message : '未知错误'}`,
      });
    }
  }

  if (results.length === 0) return '(无结果)';

  return results
    .map((r) => `${'='.repeat(30)}\n📡 ${r.source}\n${'='.repeat(30)}\n\n${r.content}`)
    .join('\n\n');
}

// Tavily 搜索封装（用于中文源 CORS fallback）
async function searchViaTavily(apiKey: string, query: string): Promise<string> {
  if (!apiKey) return '（未配置 Tavily API Key，无法搜索。请在插件面板中配置）';

  const res = await fetch(`${TAVILY_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 8,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    return `（Tavily 搜索失败: HTTP ${res.status}）`;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const lines: string[] = [];

  const answer = data.answer as string | undefined;
  if (answer) lines.push(answer, '');

  const results = data.results as Array<Record<string, unknown>> | undefined;
  if (results) {
    for (const r of results) {
      const title = (r.title as string) || '(无标题)';
      const content = (r.content as string) || '';
      lines.push(`- **${title}**`);
      if (content) lines.push(`  ${content.slice(0, 200)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '(无结果)';
}

// ============================================================
// GitHub Trending
// ============================================================
async function githubTrendingSearch(payload: Record<string, unknown>): Promise<string> {
  const lang = String(payload.language || '');
  const since = String(payload.since || 'daily');
  const url = lang
    ? `https://github.com/trending/${encodeURIComponent(lang)}?since=${since}`
    : `https://github.com/trending?since=${since}`;

  return fetchGitHubTrending(url);
}

// ---- 实现 ----

async function fetchGitHubTrending(url?: string): Promise<string> {
  const targetUrl = url || 'https://github.com/trending?since=daily';
  const res = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await res.text();

  const repos: string[] = [];
  const repoRe = /<h2[^>]*>\s*<a[^>]+href="\/([^/]+\/[^"]+)"[^>]*>/g;
  let match;
  while ((match = repoRe.exec(html)) !== null) {
    repos.push(match[1].trim());
  }

  return repos.length > 0
    ? repos
        .slice(0, 25)
        .map((r) => `- ${r}`)
        .join('\n')
    : '(未能获取 GitHub Trending 数据)';
}

async function fetchArXiv(): Promise<string> {
  // 用 arXiv API 获取 cs.AI 领域最新论文（XML 格式）
  const res = await fetch(
    'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&start=0&max_results=15',
    { headers: { 'User-Agent': 'deepseek-enhancer/0.1' } },
  );
  const xml = await res.text();

  const entries: string[] = [];
  // 使用字符串切分提取 <entry> 中的标题和摘要
  const parts = xml.split('<entry>');
  for (let i = 1; i < parts.length; i++) {
    const entry = parts[i].split('</entry>')[0];
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const summaryMatch = entry.match(/<summary>([^<]+)<\/summary>/);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 150) : '';
      entries.push(`- **${title}**\n  ${summary}`);
    }
  }

  return entries.length > 0 ? entries.slice(0, 15).join('\n\n') : '(未能获取 arXiv 数据)';
}

async function fetchHackerNews(): Promise<string> {
  // HN 官方 API 获取 Top Stories (免费，无鉴权)
  const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids: number[] = await idsRes.json();

  // 取前 20 条，并发抓取每个 item
  const topIds = ids.slice(0, 20);
  const items = await Promise.all(
    topIds.map(async (id) => {
      try {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const item = (await res.json()) as Record<string, unknown>;
        return {
          title: (item.title as string) || '',
          url: (item.url as string) || '',
          score: (item.score as number) || 0,
          descendants: (item.descendants as number) || 0,
        };
      } catch {
        return { title: '', url: '', score: 0, descendants: 0 };
      }
    }),
  );

  return items
    .filter((i) => i.title)
    .map((i, _idx) => `- ${i.title} [🔥${i.score} 💬${i.descendants}]`)
    .join('\n');
}

async function fetchRedditML(): Promise<string> {
  const res = await fetch('https://www.reddit.com/r/MachineLearning/hot.json?limit=15', {
    headers: { 'User-Agent': 'deepseek-enhancer/0.1' },
  });
  const data = (await res.json()) as Record<string, unknown>;
  const children = data?.data?.children as Array<Record<string, unknown>> | undefined;

  if (!children || children.length === 0) return '(无 Reddit 数据)';

  return children
    .map((child, _i) => {
      const post = child?.data as Record<string, unknown>;
      const title = post?.title || '';
      const score = post?.score || 0;
      const numComments = post?.num_comments || 0;
      return `- ${title} [⬆${score} 💬${numComments}]`;
    })
    .join('\n');
}
