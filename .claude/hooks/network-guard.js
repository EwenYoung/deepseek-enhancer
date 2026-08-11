#!/usr/bin/env node
// network-guard — PreToolUse hook: remind agent to configure proxy before network commands.

const MATCHERS = [
  /\bnpm\s+(install|i|update|outdated|audit)\b/,
  /\bcurl\b/,
  /\bwget\b/,
  /\bgit\s+(clone|fetch|pull)\b/,
  /\bgh\s+/,
  /\bnpx\s+/,
];

// Commands that need network but are self-contained with their own proxy config
const EXCLUSIONS = [];

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
      if (!matched) return;

      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext:
              'NETWORK ACCESS: This command needs internet. ' +
              'Set proxy first: `export http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897`. ' +
              'After the command completes, unset: `unset http_proxy https_proxy`. ' +
              'Or invoke `/network-proxy` skill.',
          },
        }),
      );
    } catch (_) {
      // silent fail
    }
  });
}

main();
