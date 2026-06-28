import type { Skill } from './types';
import { saveSkill } from './skill-registry';

export async function importFromGitHub(url: string): Promise<GitHubImportResult> {
  const parsed = parseGitHubURL(url);
  if (!parsed) throw invalidUrlError();

  const result = await resolveAndFetch(parsed, url, false);
  return result;
}

// ============================================================
// 带目录选择的导入（用于对话框交互）
// ============================================================
export async function importFromGitHubPath(
  user: string, repo: string, branch: string, path: string,
): Promise<GitHubImportResult> {
  const url = `https://github.com/${user}/${repo}/tree/${branch}/${path}`;
  const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}/SKILL.md`;
  const parsed: ParsedGitHub = { rawUrl, baseApi: `https://api.github.com/repos/${user}/${repo}/contents/${path}`, branch, user, repo, path };

  const result = await resolveAndFetch(parsed, url, true);
  return result;
}

// ============================================================
// 核心解析逻辑
// ============================================================
async function resolveAndFetch(
  parsed: ParsedGitHub, url: string, fetchAssets: boolean,
): Promise<GitHubImportResult> {
  const { rawUrl, baseApi, branch, user, repo, path } = parsed;

  // 1. 尝试直接获取 SKILL.md
  let res = await fetch(rawUrl);
  if (res.ok) {
    const content = await res.text();
    const skill = parseSkillMD(content);
    skill.source = 'github';
    skill.githubUrl = url;
    skill.id = 'gh-' + hashStr(url);

    // 如果指定了子路径，获取目录中的资产文件
    if (fetchAssets && path) {
      const assets = await discoverAndFetchAssets(baseApi, branch, user, repo, path);
      if (assets.length > 0) {
        skill.instructions += '\n\n---\n## 附件文件\n\n' + assets.join('\n');
      }
    }

    return { skill, rawUrl };
  }

  // 2. 尝试常见子目录
  const altPaths = [
    rawUrl.replace('/SKILL.md', '/skills/SKILL.md'),
    rawUrl.replace('/SKILL.md', '/.claude/skills/agent/SKILL.md'),
  ];
  for (const p of altPaths) {
    res = await fetch(p);
    if (res.ok) return { skill: parseSkillMD(await res.text()), rawUrl: p };
  }

  // 3. 发现仓库中的子目录（当 URL 是根目录时）
  const entries = await discoverEntries(baseApi, branch, user, repo);
  const skillDirs: string[] = [];
  const skillFiles: Array<{ name: string; rawUrl: string }> = [];

  for (const entry of entries) {
    // 尝试子目录的 SKILL.md
    const candidateDir = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${entry}/SKILL.md`;
    try {
      const r = await fetch(candidateDir);
      if (r.ok) skillDirs.push(entry);
    } catch { /* ignore */ }

    // 尝试直接的 .md 文件
    if (entry.endsWith('.md') && !entry.endsWith('SKILL.md')) {
      skillFiles.push({ name: entry, rawUrl: candidateDir.replace('/SKILL.md', '/' + entry) });
    }
  }

  // 4. 如果有发现，返回列表（由主 agent 处理对话框展示）
  if (skillDirs.length > 0 || skillFiles.length > 0) {
    return { discovered: { entries: skillDirs, files: skillFiles, user, repo, branch }, rawUrl: '' };
  }

  throw new Error(
    `未找到 SKILL.md。\n确保 URL 指向具体技能的路径，如：\n` +
    `  https://github.com/${user}/${repo}/tree/main/<技能名称>`,
  );
}

// ============================================================
// 获取目录中的资产文件
// ============================================================
async function discoverAndFetchAssets(
  baseApi: string, branch: string, user: string, repo: string, path: string,
): Promise<string[]> {
  const entries = await discoverEntries(baseApi, branch, user, repo);
  const assets: string[] = [];

  for (const entry of entries) {
    if (entry === 'SKILL.md') continue;
    if (entry.endsWith('.md') && entry !== 'SKILL.md') {
      const url = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}/${entry}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const ext = entry.split('.').pop() || '';
          assets.push(`### ${entry}\n\`\`\`${ext}\n${await res.text()}\n\`\`\``);
        }
      } catch { /* skip */ }
    }
    // 跳过二进制文件
  }

  return assets;
}

// ============================================================
// 通过 API 或 raw 发现仓库条目
// ============================================================
async function discoverEntries(baseApi: string, branch: string, user: string, repo: string): Promise<string[]> {
  try {
    const res = await fetch(baseApi);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((e: Record<string, unknown>) => e.name as string);
      }
    }
  } catch { /* fallback */ }

  try {
    const res = await fetch(`https://raw.githubusercontent.com/${user}/${repo}/${branch}/`);
    const html = await res.text();
    const matches = html.match(/href="[^"]*\/[^"]+?"/g) || [];
    return matches
      .map(m => m.replace(/href="[^"]*\//, '').replace(/"/g, '').replace(/\/$/, ''))
      .filter(Boolean)
      .filter(n => n !== '..' && !n.startsWith('.'));
  } catch { /* fallback */ }

  return [];
}

// ============================================================
// GitHubImportResult 联合类型
// ============================================================
export interface GitHubImportResult {
  skill?: Skill;
  rawUrl: string;
  /** 自动发现的可选项 */
  discovered?: {
    entries: string[];
    files: Array<{ name: string; rawUrl: string }>;
    user: string;
    repo: string;
    branch: string;
  };
}

function invalidUrlError(): Error {
  return new Error(
    '不支持的 GitHub URL 格式。\n' +
    '支持格式：\n' +
    '  - 仓库根：https://github.com/user/repo\n' +
    '  - 子路径：https://github.com/user/repo/tree/main/skills/my-skill\n' +
    '  - Raw URL：https://raw.githubusercontent.com/.../SKILL.md',
  );
}

interface ParsedGitHub {
  rawUrl: string;
  baseApi: string;
  branch: string;
  user: string;
  repo: string;
  path?: string;
}

function parseGitHubURL(url: string): ParsedGitHub | null {
  if (url.includes('raw.githubusercontent.com')) {
    const m = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/);
    if (!m) return { rawUrl: url, baseApi: '', branch: 'main', user: '', repo: '' };
    return { rawUrl: url, baseApi: `https://api.github.com/repos/${m[1]}/${m[2]}/contents/`, branch: m[3], user: m[1], repo: m[2] };
  }

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/(.+))?/);
  if (!match) return null;

  const [, user, repo, branchRaw, path] = match;
  const branch = branchRaw || 'main';
  const filePath = path ? `${path}/SKILL.md` : 'SKILL.md';

  return {
    rawUrl: `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`,
    baseApi: `https://api.github.com/repos/${user}/${repo}/contents/${path || ''}`,
    branch, user, repo, path,
  };
}

// ============================================================
// SKILL.md 解析
// ============================================================
function parseSkillMD(content: string): Skill {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/);
  let name = '';
  let description = '';
  let instructions = content;

  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    instructions = frontmatterMatch[2].trim();
    const nameMatch = fm.match(/^name:\s*(.+)/m);
    if (nameMatch) name = nameMatch[1].trim();
    const descMatch = fm.match(/^description:\s*(.+)/m);
    if (descMatch) description = descMatch[1].trim();
  }

  if (!name) {
    const firstLine = instructions.split('\n')[0].replace(/^#\s*/, '').trim();
    name = firstLine.slice(0, 50).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
    if (!name) name = 'imported-skill';
  }

  return {
    id: '', name, description: description || name, instructions,
    source: 'custom', enabled: true, memoryEnabled: false,
  };
}

// ============================================================
// 本地导入
// ============================================================
export function importFromLocal(): Promise<Skill> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        const skill = parseSkillMD(content);
        skill.source = 'local';
        skill.localPath = file.name;
        skill.id = 'local-' + hashStr(file.name + Date.now());
        input.remove();
        resolve(skill);
      } catch (err) { reject(err); }
    });

    input.addEventListener('cancel', () => {
      input.remove();
      openFolderPicker(resolve, reject);
    });

    input.click();
  });
}

function openFolderPicker(resolve: (s: Skill) => void, reject: (e: Error) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  // @ts-ignore
  input.webkitdirectory = true;

  input.addEventListener('change', async () => {
    const files = input.files;
    if (!files || files.length === 0) { reject(new Error('未选择文件')); return; }

    try {
      let skillFile: File | null = null;
      const assetFiles: File[] = [];
      for (const file of files) {
        const fn = file.name.toLowerCase();
        if (fn === 'skill.md' || fn.endsWith('/skill.md')) { skillFile = file; } else { assetFiles.push(file); }
      }
      if (!skillFile) { reject(new Error('未找到 SKILL.md')); return; }
      const content = await skillFile.text();
      const skill = parseSkillMD(content);
      skill.source = 'local';
      skill.localPath = skillFile.webkitRelativePath || skillFile.name;
      skill.id = 'local-' + hashStr(skillFile.webkitRelativePath + Date.now());

      if (assetFiles.length > 0) {
        const parts: string[] = ['', '---', '## 附件文件', ''];
        for (const file of assetFiles) {
          try {
            const c = await file.text();
            const rel = file.webkitRelativePath || file.name;
            const ext = file.name.split('.').pop() || '';
            parts.push('### ' + rel, '', '```' + ext, c, '```', '');
          } catch { /* skip */ }
        }
        skill.instructions += parts.join('\n');
      }
      input.remove();
      resolve(skill);
    } catch (err) { reject(err); }
  });

  input.addEventListener('cancel', () => { input.remove(); reject(new Error('已取消')); });
  input.click();
}

export async function importAndSave(skill: Skill): Promise<Skill> {
  await saveSkill(skill);
  return skill;
}

function hashStr(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(36);
}