---
name: main-world-raw-import-no-ts
description: main-xhr-inject.ts is imported via ?raw and injected as <script> — no TypeScript compilation
type: feedback
---

`src/core/main-xhr-inject.ts` is imported via `?raw` in `main-world.content.ts` and injected as a `<script>` tag into the page. The `?raw` import in WXT/Vite does NOT compile TypeScript — it embeds the raw source text verbatim.

**Rule:** Never add TypeScript type annotations (`: string`, `: URL`, `: unknown[]`, etc.) to `main-xhr-inject.ts`. It must remain pure JavaScript. Any `: type` annotation will cause a SyntaxError when the browser parses the injected script.

**Why:** The ESLint commit `371785b` added type annotations on lines 166/173, breaking ALL MAIN world functionality (XHR hook, new session categorization, Agent tool calls). The error was invisible — no build error, no console error from the content script itself, only a VM3675 SyntaxError in the injected script's execution context.

**How to apply:** Before modifying `main-xhr-inject.ts`, remember it executes as plain JS in the page. If you need types, use JSDoc comments only. ESLint is already configured with `/* eslint-disable no-var, @typescript-eslint/no-unused-vars */` at the top.
