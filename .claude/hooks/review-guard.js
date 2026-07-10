#!/usr/bin/env node
// review-guard — UserPromptSubmit hook: remind agent to delegate review to subagent.

const MATCHERS = [
  /\breview\b/i,
  /\b审查\b/,
  /\b检查(一下)?代码\b/,
  /code\s*review/i,
  /\breview\s+this\b/i,
  /\bPR\s*review\b/i,
];

// Already a skill invocation — don't interfere
const SKIP_PREFIXES = ['/review', '/caveman-review', '/ponytail', '/code-review'];

function main() {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      const input = JSON.parse(raw);
      const prompt = ((input && input.prompt) || '').trim();

      if (!prompt) return;

      // Skip if user is already calling a review skill
      if (SKIP_PREFIXES.some((p) => prompt.startsWith(p))) return;

      const matched = MATCHERS.some((re) => re.test(prompt));
      if (!matched) return;

      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext:
              'REVIEW DELEGATION RULE: User is requesting a code review. ' +
              'Do NOT review code yourself. Instead, dispatch a subagent (Agent tool) with subagent_type="general-purpose". ' +
              'Describe the scope, files, and review criteria to the subagent. ' +
              'Options: for terse feedback use caveman-review skill, for standards+spec review use code-review skill.',
          },
        }),
      );
    } catch (_) {
      // silent fail
    }
  });
}

main();
