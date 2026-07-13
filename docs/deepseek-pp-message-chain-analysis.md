# deepseek-pp Agent Loop Message Chain Analysis

Primary-source research on how deepseek-pp's inline-agent loop creates distinct, visible messages in the conversation history -- and how it prevents "internal" agent loop messages from cluttering the chat UI.

## 1. How the Agent Loop Creates Server-Side Messages

Source file: `D:/project/deepseek-pp-main/core/inline-agent/loop.ts`

Each agent loop iteration creates a **genuine server-side message** via `submitPromptStreaming()`. The loop uses standard DeepSeek API calls that become real conversation messages:

```typescript
// loop.ts line 89-99
const input: SubmitPromptInput = {
  chatSessionId,
  parentMessageId,          // chains from previous turn's responseMessageId
  modelType: promptOptions.modelType,
  prompt,                   // the continuation prompt (tool results)
  refFileIds: promptOptions.refFileIds,
  thinkingEnabled: promptOptions.thinkingEnabled,
  searchEnabled: promptOptions.searchEnabled,
  clientHeaders,
  powHeaders,
};

// loop.ts line 102
const turn: ModelTurn = await submitPromptStreaming(input, { ... }, stepTimeout.signal);

// loop.ts line 116 -- chain the next turn
parentMessageId = turn.responseMessageId;
```

**Message chain on the server:**
```
message_1 (initial user prompt)
  -> response_1 (assistant, with tool calls)
  -> message_2 (continuation prompt, parent=response_1)
  -> response_2 (assistant, with more tool calls)
  -> message_3 (continuation prompt, parent=response_2)
  -> response_3 (final answer)
```

### How `submitPromptStreaming` creates the server-side message

Source file: `D:/project/deepseek-pp-main/core/deepseek/adapter.ts`, lines 394-420

```typescript
// adapter.ts line 399-419
const response = await fetch(DEEPSEEK_API_URL, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    [BYPASS_HOOK_HEADER]: '1',   // <-- bypasses the fetch hook interceptor
    ...input.clientHeaders,
    ...input.powHeaders,
  },
  body: JSON.stringify({
    chat_session_id: input.chatSessionId,
    parent_message_id: input.parentMessageId,   // chains to prior assistant message
    prompt: input.prompt,                         // the full continuation prompt text
    ...
  }),
});
```

**Key behavior:** The agent loop sends raw HTTP POST requests to `chat.deepseek.com/api/v0/chat/completion` with proper `Authorization`, `parent_message_id`, and `chat_session_id`. This is identical to how the user sends a normal chat message -- therefore the server creates persistent message records for each turn.

### Why this creates distinct visible messages

The API endpoint treats each POST request as a new user message. Since each continuation prompt is a full text string (containing `<original_task>`, `<tool_results>`, etc.), the server stores it as a user-type message in the conversation history. The assistant's response is stored as an assistant-type message, chained via `parent_message_id`.

## 2. The `suppressPageEvents` Mechanism

Source file: `D:/project/deepseek-pp-main/core/interceptor/fetch-hook.ts`

### How `suppressPageEvents` is determined (line 281)

```typescript
// fetch-hook.ts line 281
suppressPageEvents: isInlineAgentContinuationRequest(originalPrompt, agentTaskPrompt),
```

The decision is made at request interception time by checking if the request body contains inline agent continuation markers.

### What `suppressPageEvents = true` does:

**A) Skips tool parsing/callbacks (lines 335-341)**
```typescript
// fetch-hook.ts lines 335-341
if (options.suppressEvents) {
  return {
    append() {},
    finish() {},
    getVisibleText() { return ''; },
  };
}
```
The streaming response tool state no-ops all tool detection. No `onToolCall`, `onToolCallStarted`, or `onToolCallChunk` events fire for internal requests.

**B) Skips token speed events (lines 986-992 for fetch, 1094-1100 for XHR)**
```typescript
if (!requestContext.suppressPageEvents) {
  hookState.onResponseTokenSpeed(...)
}
```

**C) Skips `onResponseComplete` (lines 1037-1048 for fetch, 1109-1119 for XHR)**
```typescript
if (!cancelled && !requestContext.suppressPageEvents) {
  hookState.onResponseComplete({
    requestId: requestContext.requestId,
    text: responseToolState.getVisibleText(),
    ...
  });
}
```
This is the critical line. When `suppressPageEvents` is `true`, the `onResponseComplete` callback is never called. This means the content script never receives the response from internal continuation requests, and therefore never attempts to start a **nested** inline agent loop (which would create an infinite recursion).

**IMPORTANT:** `suppressPageEvents` does NOT prevent the page from rendering the continuation messages in the DOM. It only prevents the extension's own callbacks from firing. The page's native chat UI still receives and renders the SSE stream because the fetch hook's `ReadableStream` still forwards the data (the `XmlToolStreamFilter` still processes text and the stream still passes through to the page).

### Detection functions (from prompt.ts)

```typescript
// prompt.ts line 47-50
export function isInlineAgentContinuationRequest(originalPrompt: string, agentTaskPrompt: string): boolean {
  return isInlineAgentContinuationPrompt(originalPrompt) ||
    isInlineAgentContinuationPrompt(agentTaskPrompt);
}

// prompt.ts line 52-61
export function isInlineAgentContinuationPrompt(content: string): boolean {
  if (!hasInlineAgentContinuationTags(content)) return false;  // checks for <original_task> + (<tool_results>|<tool_results_so_far>)
  return content.includes('工具续跑任务') ||
    content.includes('工具结果') ||
    content.includes('Continue like a real agent') ||
    content.includes('tool results') ||
    content.includes('do not call any tools') ||
    content.includes('不要调用任何工具');
}
```

## 3. How Continuation Prompts Work in the Message Chain

Source file: `D:/project/deepseek-pp-main/core/inline-agent/prompt.ts`

### `buildContinuationPrompt` (lines 118-142)

```
[Continuation intro text in user's locale]
[Instructions to continue, not repeat task]
[Instructions to not pseudo-call tools]

<original_task>
[user's original task, clamped to 8000 chars]
</original_task>

[Failure recovery instructions if any tool failed]

<tool_results>
[JSON array of all tool execution results]
</tool_results>
```

### `buildNudgePrompt` (lines 144-172)

When the model outputs visible text but no tool calls, a "nudge" prompt asks the model to choose between calling a tool or declaring the task complete:

```
[Nudge text: no tools detected, choose next action]

<original_task>
[original task]
</original_task>

<previous_assistant_text>
[last assistant text, clamped to 4000 chars]
</previous_assistant_text>

<tool_results_so_far>
[all results so far]
</tool_results_so_far>
```

### Are these prompts stored as messages on the server?

**Yes.** Each continuation prompt is sent as the `prompt` field in a POST to the completion API. Since each API call uses the session's `chat_session_id` and chains via `parent_message_id`, the server creates a persistent user message for each turn. The continuation prompt text (including `<original_task>` and `<tool_results>` XML) becomes the message content stored server-side.

### How are they hidden in the chat UI?

The continuation messages **do appear in the DOM** initially, but they are **hidden client-side**:

1. **XmlToolStreamFilter** (fetch-hook.ts line 705-933): Strips XML tool-call tags from the visible SSE text stream as it passes through. BUT the continuation prompt text itself (which contains `<original_task>` and `<tool_results>`) passes through because those are **user message content** (echoed back in request-message events), not tool call XML in the assistant's response. The filter operates on response text only.

2. **DOM hiding via MutationObserver** (content.ts lines 5702-5755):
   ```typescript
   // content.ts line 5727-5733
   function hideInlineAgentContinuationMessages(root: ParentNode) {
     const messages = getInlineAgentContinuationMessageCandidates(root);
     for (const message of messages) {
       if (!isInlineAgentContinuationRenderedText(message.textContent)) continue;
       message.setAttribute('data-dpp-hidden-inline-agent-continuation', 'true');
       message.style.display = 'none';
     }
   }
   ```
   This observes `.ds-message` elements and applies `display: none` to any message containing continuation prompt markers.

3. **`isInlineAgentContinuationStructure`** (prompt.ts lines 75-77): A looser check used for DOM detection:
   ```typescript
   export function isInlineAgentContinuationStructure(content: string): boolean {
     return hasInlineAgentContinuationTags(content);
   }
   ```
   This only checks for paired `<original_task>` + `<tool_results>`/`<tool_results_so_far>` tags. Since DeepSeek may interleave timestamps, action rows, and reasoning with the prompt in the live DOM, the strict keyword check (`isInlineAgentContinuationPrompt`) may miss -- but the structural tag check is sufficient.

## 4. The `INLINE_AGENT_CONTINUATION_PLACEHOLDER` Mechanism

Source file: `D:/project/deepseek-pp-main/core/inline-agent/prompt.ts`, line 10
```
export const INLINE_AGENT_CONTINUATION_PLACEHOLDER = '[DeepSeek++ internal inline-agent continuation hidden]';
```

### Where it is used:

**A) History cleanup: `sanitizeInlineAgentContinuationMessage`** (history-cleanup.ts lines 564-579)

When the conversation history is fetched (from API or IndexedDB), continuation messages are detected and their content is replaced with the placeholder:
```typescript
// history-cleanup.ts lines 564-579
function sanitizeInlineAgentContinuationMessage(msg: any) {
  if (!isInlineAgentContinuationMessage(msg)) return;
  if (typeof msg.content === 'string' && isInlineAgentContinuationPrompt(msg.content)) {
    msg.content = INLINE_AGENT_CONTINUATION_PLACEHOLDER;
  }
  // Also handles fragment-based messages
}
```

**B) DOM detection: `isInlineAgentContinuationRenderedText`** (content.ts lines 5736-5744)
```typescript
function isInlineAgentContinuationRenderedText(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || !text) return false;
  return text.includes(INLINE_AGENT_CONTINUATION_PLACEHOLDER) ||
    isInlineAgentContinuationStructure(text);
}
```

**C) History message filtering: `isRemovableInternalManagedAgentMessage`** (history-cleanup.ts line 553-555)
```typescript
function isRemovableInternalManagedAgentMessage(msg: any): boolean {
  return isInternalManagedAgentMessage(msg) && !isInlineAgentContinuationMessage(msg);
}
```
This **removes** other internal agent messages (non-continuation ones with tool format reminders) but **preserves** continuation messages (with their content replaced by the placeholder). So the history shows each turn as a real message, but with placeholder content instead of the raw XML.


### How `XmlToolStreamFilter` works (fetch-hook.ts lines 705-933)

The filter operates on the SSE byte stream:

1. **State machine** with two states: `NORMAL` and `SUPPRESSING`
2. Each SSE text patch event is checked for XML tool open tags matching known tool invocation names
3. When a tool open tag is found but no close tag yet, state transitions to `SUPPRESSING` -- text between the open and close tags is dropped from the page-rendered stream
4. When the close tag appears, state returns to `NORMAL` and trailing text resumes forwarding
5. **But:** the filter only strips tool tags from the **assistant's response text** (SSE text patches). The **user's continuation message** is sent via a different SSE event type (request-message echo) and passes through the "Non-response events" path at line 762:
   ```typescript
   // fetch-hook.ts line 762
   this.emit(controller, effectiveBlock);  // Non-response events pass through
   ```

**The tool filter does NOT strip continuation prompt text.** The continuation XML (`<original_task>`, `<tool_results>`) appears in SSE request-message events, not in response text patches. The filter explicitly passes non-response events through unchanged. This is why the DOM hiding via MutationObserver is still needed.

### How `cloneParsedWithSanitizedInternalPrompt` works (fetch-hook.ts lines 572-600)

This function deep-clones an SSE parsed object and replaces the text content with sanitized values:

1. Traverses the parsed SSE data structure recursively
2. For each node containing text, calls `sanitizeInternalPromptText()` which calls `extractVisibleUserPrompt()` to strip the `<!-- deepseek-pp-visible-user-prompt:* -->` markers and return only the user-visible portion
3. For response text patches (detected by `isResponsePatch`), replaces with empty string (because the tool format reminder injected by `augmentRequestBody` has the `VISIBLE_USER_PROMPT_*` markers)
4. Other internal prompt markers (tool format reminder, etc.) get stripped

This is applied at fetch-hook.ts line 573 (called from `XmlToolStreamFilter.processBlocks`):
```typescript
// fetch-hook.ts line 756
const sanitizedParsed = cloneParsedWithSanitizedInternalPrompt(parsed, this.visiblePrompt);
```

## 5. Session Export / Trace

deepseek-pp does NOT have a chat export feature (no exporter module found). Instead, it has an **inline agent trace** system (content.ts lines 3928-3935):

```typescript
function createInlineAgentTrace(...): InlineAgentTraceRecord {
  return {
    id, loopId, chatSessionId,
    anchorMessageId, anchorMessageIndex, anchorContent,
    url,          // the chat session's URL on chat.deepseek.com
    originalPrompt, agentTaskPrompt,
    status: 'running', steps: [], totalSteps, totalTools, finalText,
    ...
  };
}
```

The trace is stored in `localStorage` under a key, keyed by session + message ID. It includes step-by-step records of each agent loop iteration (text, tool executions, response message IDs). The trace is separate from the chat messages -- it's an extension-level record for internal use, not a user-facing export.

### What appears in the conversation history API

When the page fetches past messages via the history API (or IndexedDB):

1. **`interceptHistoryResponse`** (fetch-hook.ts lines 1182-1198) fetches the server response, runs `stripToolCallsFromHistory` on it, and returns the modified JSON
2. **`stripToolCallsFromHistory`** in history-cleanup.ts:
   - Removes non-continuation internal agent messages entirely (`isRemovableInternalManagedAgentMessage`)
   - Replaces continuation message content with `INLINE_AGENT_CONTINUATION_PLACEHOLDER`
   - Strips XML tool call blocks from assistant message content
   - Restores tool call records for UI rendering purposes (artifact blocks, etc.)
3. The same logic applies to IndexedDB reads (lines 1257-1293)

The result: continuation messages are **visible** in the history list as normal messages, but their content is the placeholder string `[DeepSeek++ internal inline-agent continuation hidden]` instead of the raw XML.

## 6. Key Difference: Enhancer vs DeepSeek-PP

| Aspect | deepseek-pp (this codebase) | deepseek-enhancer |
|--------|--------------------------|-------------------|
| **Transport** | `fetch()` with `BYPASS_HOOK_HEADER` to skip interceptor | Raw `XMLHttpRequest` (original page API bypassed) |
| **Auth** | Captures and reuses `Authorization` header from page's real requests | Intercepts page's own XHR calls |
| **Message creation** | Server-side: each `submitPromptStreaming` creates a real server message | Client-side: uses `domSubmit()` to fill textarea + click send, piggybacking on page's normal send flow |
| **Continuation messages** | Stored server-side, hidden client-side (DOM display:none + history placeholder) | Not stored server-side (uses aborted/injected XHR that bypasses normal message flow) |
| **Message chain** | `parent_message_id` chain: each turn's parent = prior turn's responseMessageId | No parent chain: each turn is a standalone injection that the page's SSE handler processes |
| **Visibility** | Messages exist in history but show placeholder | Messages are ephemeral, never appear in history |

### The fundamental difference

**deepseek-pp** uses the **standard API endpoint** with full headers and proper chaining. Each agent loop iteration is a first-class citizen in the conversation -- it creates a real server-side message with a real message ID, chained to the previous assistant response via `parent_message_id`. The continuation prompt text lives on DeepSeek's servers forever.

**deepseek-enhancer** uses the **page's own UI flow** (fill textarea, click send) which the page's JavaScript-intercepting code processes. The enhancer's approach is more "parasitic" -- it doesn't create its own API calls but instead hijacks the page's normal message-sending mechanism.

### Why the enhancer's approach cannot create distinct messages

The enhancer uses `domSubmitText()` which programmatically fills the chat textarea and clicks the send button. This triggers the page's own event handlers, which call the page's own API code. The page's code creates the message. But the enhancer's approach has a fundamental issue:

1. The enhancer's tool results are injected as "tool result" blocks in the UI
2. The enhancer does NOT send continuation prompts as new user messages -- it instead modifies the SSE stream in-flight
3. The enhancer's approach manipulates the page at the XHR level, not at the API level

**This is why the enhancer needs a different approach to create proper multi-turn conversations.** The deepseek-pp approach (standard API calls with `parent_message_id` chaining) is the correct pattern.
