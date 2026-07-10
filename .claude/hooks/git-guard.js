#!/usr/bin/env node
// git-guard — PreToolUse hook: intercept destructive git commands, demand confirmation.

const DANGER = [
  { re: /git\s+reset\s+--hard/, msg: 'git reset --hard' },
  { re: /git\s+clean\s+.*-f/, msg: 'git clean -f' },
  { re: /git\s+branch\s+-D/, msg: 'git branch -D' },
  { re: /git\s+checkout\s+--/, msg: 'git checkout -- (discard file changes)' },
  { re: /git\s+restore\s+\./, msg: 'git restore . (discard all file changes)' },
  { re: /git\s+push\s+.*--force/, msg: 'git push --force' },
  { re: /git\s+push\s+.*-f\b/, msg: 'git push -f' },
  { re: /git\s+stash\s+drop/, msg: 'git stash drop' },
];

function main() {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      const input = JSON.parse(raw);
      const cmd = (
        (input && input.tool_input && input.tool_input.command) ||
        ''
      ).trim();

      const hit = DANGER.find((d) => d.re.test(cmd));
      if (!hit) return;

      const isPush = /git\s+push/.test(cmd);

      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext:
              isPush
                ? `DESTRUCTIVE GIT WARNING: Detected "${hit.msg}". This will overwrite remote history. ` +
                  'Verify the target branch is NOT main/master. Ask user to confirm before proceeding.'
                : `DESTRUCTIVE GIT WARNING: Detected "${hit.msg}". This operation is IRREVERSIBLE. ` +
                  'Confirm with user before executing. Show what would be lost (git status, git log).',
          },
        }),
      );
    } catch (_) {
      // silent fail
    }
  });
}

main();
