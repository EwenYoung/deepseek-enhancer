import type { Skill } from './types';
import { saveSkill } from './skill-registry';

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
    name = firstLine
      .slice(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!name) name = 'imported-skill';
  }

  return {
    id: '',
    name,
    description: description || name,
    instructions,
    source: 'custom',
    enabled: true,
    memoryEnabled: false,
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
      } catch (err) {
        reject(err);
      }
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
  // @ts-expect-error - webkitdirectory is a non-standard property
  input.webkitdirectory = true;

  input.addEventListener('change', async () => {
    const files = input.files;
    if (!files || files.length === 0) {
      reject(new Error('未选择文件'));
      return;
    }

    try {
      let skillFile: File | null = null;
      const assetFiles: File[] = [];
      for (const file of files) {
        const fn = file.name.toLowerCase();
        if (fn === 'skill.md' || fn.endsWith('/skill.md')) {
          skillFile = file;
        } else {
          assetFiles.push(file);
        }
      }
      if (!skillFile) {
        reject(new Error('未找到 SKILL.md'));
        return;
      }
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
          } catch {
            /* skip */
          }
        }
        skill.instructions += parts.join('\n');
      }
      input.remove();
      resolve(skill);
    } catch (err) {
      reject(err);
    }
  });

  input.addEventListener('cancel', () => {
    input.remove();
    reject(new Error('已取消'));
  });
  input.click();
}

export async function importAndSave(skill: Skill): Promise<Skill> {
  await saveSkill(skill);
  return skill;
}

function hashStr(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
