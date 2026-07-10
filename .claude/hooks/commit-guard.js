#!/usr/bin/env node
// commit-guard — PreToolUse hook: remind agent to run typecheck + lint + format before git commit.

const MATCHERS = [/git\s+commit\b/];
const EXCLUSIONS = [/--no-verify/, /--amend/, /--no-edit/];

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

      const matched = MATCHERS.some((re) => re.test(cmd));
      const excluded = EXCLUSIONS.some((re) => re.test(cmd));
      if (!matched || excluded) return;

      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext:
              'MANDATORY: Before git commit, run these checks in order:\n' +
              '1. `npm run typecheck` — fix type errors\n' +
              '2. `npm run lint` — fix lint errors\n' +
              '3. `npm run format:check` — if fails, run `npm run format`, then re-add staged files\n' +
              'All three must pass before committing.',
          },
        }),
      );
    } catch (_) {
      // silent fail — best-effort hook
    }
  });
}

main();
