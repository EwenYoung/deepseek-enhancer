# deepseek-pp Agent Loop UI Analysis

How deepseek-pp renders agent loop activity in the chat UI, and how it differs from the current deepseek-enhancer approach.

---

## 1. How deepseek-pp Displays Agent Loop Activity

### 1.1 Architecture Overview

deepseek-pp's agent loop runs entirely in the **MAIN world** (fetch/XHR interception layer) and communicates with the **content script** (UI layer) through a `post` callback. There is no postMessage bridge for the agent loop — both layers are in the same extension context and share a direct function reference.

**Flow**:
```
MAIN world (fetch-hook.ts)
  -> onResponseComplete(payload)
    -> content script (content.ts)
      -> startInlineAgentIfNeeded()     [line 2928]
        -> startInlineAgentLoop()       [line 3113]
          -> runInlineAgentLoop()       [core/inline-agent/loop.ts]
            -> post('AGENT_*')          [callback to content.ts]
            -> submitPromptStreaming()  [core/deepseek/adapter.ts]
```

### 1.2 The Agent Panel (Container + Steps + Footer)

The UI is a **collapsible panel** appended below the assistant's message in the chat DOM. It has three structural layers:

#### Container
- `core/inline-agent/renderer.ts:237-242` — `createAgentContainer()` creates a `<div class="dpp-agent-container">` with a left border accent (`border-left: 1px solid`).
- Mounted by `mountInlineAgentContainer()` (content.ts:3021-3038) which uses a `MutationObserver` to keep the container attached to the correct assistant response host even as DeepSeek's virtual list re-renders.

#### Steps
Each loop iteration creates a new **step element** (`dpp-agent-step`), appended to the container:

- `renderer.ts:244-294` — `createAgentStepElement(stepIndex, onStop, labels)` builds:
  - **Header**: Step indicator ("Step 1"), status text ("streaming..."), optional Stop button
  - **Body** (`.dpp-agent-step-body`): Live streamed text in real-time, rendered as inline Markdown
  - **Tools** (`.dpp-agent-step-tools`): Per-tool result summaries (checkmark / X + name + summary)

Key CSS behaviors (renderer.ts:20-233):
- Streaming steps get accent-colored left border (`border-color: var(--dpp-ui-accent)`)
- Tool-executing steps get warning-colored border
- Error steps get error-colored border
- Body auto-scrolls to bottom during streaming (`scrollStepBodyToBottom`, line 305-312)
- Steps auto-collapse 800ms after completion (content.ts:3277-3279)
- Clicking the header toggles collapse (`step.setAttribute('data-collapsed', ...)`)

#### Footer
- `renderer.ts:339-358` — `createAgentFooter(totalSteps, totalTools, isError)` shows final stats
  - Success: "Agent complete (3 steps, 5 tool calls)" with green indicator
  - Error: Error message with red indicator

### 1.3 The Event-Driven UI Update Pipeline

The `post` callback in content.ts:3125-3127 routes every agent lifecycle event:

```
Event: AGENT_STEP_STARTED  -> handleAgentStepStarted()   [content.ts:3195]
  Creates step element, appends to container, sets inlineAgentCurrentStep

Event: AGENT_STREAM_CHUNK  -> handleAgentStreamChunk()   [content.ts:3211]
  Throttled via requestAnimationFrame (content.ts:3216)
  Calls updateStepStreamText() -> renderInlineMarkdown()
  Text capped at 8000 chars (INLINE_AGENT_STEP_RENDER_MAX_CHARS)

Event: AGENT_TOOL_DETECTED -> (no UI action)             [content.ts:3176]
  Tool detection is logged but no visual update — tool results
  are shown only in AGENT_STEP_COMPLETE

Event: AGENT_STEP_COMPLETE -> handleAgentStepComplete()  [content.ts:3255]
  Flushes pending stream render
  Adds tool results via addToolResultToStep()
  Updates status label ("Completed with 2 tools" / "Completed")
  Auto-collapses step after 800ms

Event: AGENT_LOOP_COMPLETE -> handleAgentLoopComplete()  [content.ts:3284]
  Renders final answer text via appendInlineAgentFinalAnswer()
    -> create <div data-dpp-body-text> with renderInlineMarkdown()
    -> appends it AFTER the container (as a sibling in parent)
  Appends footer with totalSteps/totalTools stats
  Cleans up all module-level state

Event: AGENT_LOOP_ERROR -> handleAgentLoopError()        [content.ts:3344]
  Marks current step as error
  Appends error footer
```

### 1.4 Streaming Text Rendering

- `core/inline-agent/markdown.ts` — `renderInlineMarkdown()` is a lightweight inline Markdown renderer supporting: headers (#/##/###), bold, italic, inline code, code blocks, links, tables, lists.
- Applied by `updateStepStreamText()` (renderer.ts:296-303) — sets `body.innerHTML = renderInlineMarkdown(visibleText)` and auto-scrolls.
- The visible text is accumulated by `createStreamingToolTextAccumulator()` (loop.ts:332-339) which strips tool XML tags (e.g., `<web_search>...</web_search>`) from the visible text in real-time via `core/interceptor/streaming-tool-text.ts`.

### 1.5 Tool Call Visualization (Two Layers)

#### During initial response (before agent loop starts)
Tool calls detected in the streaming SSE response are rendered as **tool cards** (`dpp-tool-card`) inside the chat message itself.

- `core/ui/tool-card.ts` — Full-featured tool card with:
  - Wrench icon, tool name, spinning loader
  - Collapsible body showing payload and result detail
  - State transitions: running -> success/error
  - Automatic collapse after 2s
  - Animated entry (opacity + translateY)
- Managed by `core/interceptor/fetch-hook.ts` lines 978-1009 via `XmlToolStreamFilter` which:
  - Passes through fragment-creation SSE events (to preserve DeepSeek's native tool card rendering)
  - Suppresses raw XML tool call text from the visible stream
  - Replaces internal continuation prompts with the placeholder `[DeepSeek++ internal inline-agent continuation hidden]`

#### During agent loop (step-level tools)
Each step shows tool execution results in a simpler format:

- `renderer.ts:324-337` — `addToolResultToStep(step, toolName, ok, summary)` adds `<div class="dpp-agent-step-tool-item ok|err">` with checkmark/X + name + summary (truncated to 100 chars).

### 1.6 How Internal Continuation Messages Are Hidden

A critical piece: agent loop continuation requests must be invisible to the user. deepseek-pp uses a layered approach:

1. **suppressPageEvents flag**: When `createRequestContext()` in fetch-hook.ts:281 detects the request body contains inline-agent continuation tags (`<original_task>` + `<tool_results>`), it sets `suppressPageEvents: true`. This prevents:
   - `onResponseComplete` from firing (fetch-hook.ts:1037)
   - `onResponseTokenSpeed` from firing (fetch-hook.ts:987)
   - Tool cards from being created (fetch-hook.ts:983)

2. **Continuation message hider**: `startInlineAgentContinuationMessageHider()` (content.ts:5702-5725) sets up a MutationObserver that watches for rendered DOM messages containing the continuation structure tags or the `INLINE_AGENT_CONTINUATION_PLACEHOLDER` string, and hides them via `style.display = 'none'`.

3. **Prompt sanitization**: `XmlToolStreamFilter.processChunk()` replaces the original prompt text with a placeholder in the SSE stream seen by the page's rendering engine (fetch-hook.ts:756-758, `cloneParsedWithSanitizedInternalPrompt`).

### 1.7 The Nudge Mechanism (Also Hidden)

When the model produces text indicating intent to continue ("I will search...") but generates no tool calls, the loop injects a **nudge prompt** to force the model to either call tools or complete:

- `loop.ts:142-255` — After no tool calls detected, checks `shouldNudge()` (prompt.ts:92-100) which uses regex matching on trailing text for pending-action phrases.
- Nudge is sent as a separate `submitPromptStreaming()` call with `parentMessageId` pointing to the current turn (loop.ts:168-198).
- Max 8 nudges per loop (`INLINE_AGENT_MAX_NUDGES = 8`), max 25 steps (`INLINE_AGENT_MAX_STEPS = 25`).
- All nudge API calls are also `suppressPageEvents = true`, so they are invisible to the user.

### 1.8 Programmatic API Calls (BYPASS_HOOK_HEADER)

The agent loop submits prompts directly via `fetch()` (NOT via XHR or DOM manipulation):

- `core/deepseek/adapter.ts:394-443` — `submitPromptStreaming()` calls `fetch(DEEPSEEK_API_URL, ...)` with:
  - `X-DPP-Bypass-Hook: 1` header (adapter.ts:44, contracts.ts:23) — tells the fetch hook to pass the request through without re-intercepting
  - `credentials: 'include'` for auth cookies
  - Client headers (token, app version, locale, timezone)
  - PoW headers (computed via WASM)

This is a key architectural difference from enhancer — deepseek-pp uses its own fetch to avoid the hook's re-entry, while enhancer uses raw XHR via `XMLHttpRequest.prototype.send`.

### 1.9 Pet/Status Indicator Integration

The content script integrates agent state with a "pet" visual indicator:

- `setPetState('working')` on `AGENT_STEP_STARTED` (content.ts:3161)
- `setPetState('speaking')` on `AGENT_STREAM_CHUNK` (content.ts:3165)
- `setPetState('success')` on `AGENT_LOOP_COMPLETE` (content.ts:3184)
- `setPetState('error')` on `AGENT_LOOP_ERROR` (content.ts:3188)

---

## 2. Key Differences from Current deepseek-enhancer

### 2.1 Structural Differences

| Aspect | deepseek-pp | deepseek-enhancer (current) |
|--------|------------|----------------------------|
| **Communication** | Direct `post` callback (same JS context) | `window.postMessage` between MAIN and isolated worlds |
| **Loop execution** | Content script via `runInlineAgentLoop()` | MAIN world via `handleSilentLoop()` + `checkSilentBuf()` |
| **API calls** | `fetch()` with BYPASS_HOOK_HEADER | Raw `XMLHttpRequest` via prototype methods |
| **Tool execution** | `executeToolCallsSequentially()` in content script | `handleMainWorldToolCalls()` in isolated content script |
| **UI** | Dedicated agent panel with steps, streaming text, tool results, footer, auto-collapse | Simple loading/result blocks inserted into chat DOM |
| **Intermediate steps visible** | Yes — each step is a collapsible card showing live streaming text | No — only tool loading/result blocks visible; loop is "silent" |
| **Final response** | Rendered via Markdown in `<div data-dpp-body-text>` as sibling of container | Posted via postMessage as `DS_MINI_FINAL_RESPONSE`, rendered by content script into chat |
| **Internal message hiding** | `suppressPageEvents` flag + DOM MutationObserver | `scanAndHideToolResults()` via TreeWalker + `data-ds-hidden` attribute |
| **Streaming text in UI** | Real-time incremental Markdown rendering per step | None during silent loop — text arrives only at end |
| **Task complete signal** | `<task_complete>{"summary":"..."}</task_complete>` parsed in loop.ts, checked at both step-level and nudge-level | Same marker but parsed in `checkSilentBuf` only |

### 2.2 What Enhancer Is Missing

1. **No step visualization**: The silent loop has zero visual feedback during intermediate steps. The user sees loading blocks for tool calls, then nothing until the final response appears. They have no idea how many loop iterations are happening or what the model is "thinking" at each step.

2. **No streaming text during loop**: `checkSilentBuf` (main-xhr-inject.ts:836) only processes the full buffer after SSE completion. The `handleSilentLoop` XHR's `progress` event (line 750) could theoretically stream but the text is never posted to the UI.

3. **No agent panel**: Tool blocks are free-floating `<div>` elements inserted after the last message. There's no container, no step grouping, no collapsible structure.

4. **No nudge mechanism**: Enhancer has a much simpler nudge (main-xhr-inject.ts:913-922) that sends a single hardcoded Chinese prompt template. No max nudge count check, no `shouldNudge()` regex analysis.

5. **Internal messages leak visibly**: Enhancer's `scanAndHideToolResults()` uses a TreeWalker + `display:none` approach that sometimes leaves visible flickers. deepseek-pp's `suppressPageEvents` flag prevents the page from ever rendering these messages in the first place.

6. **No footer/statistics**: When the loop completes, enhancer just posts the final text. There's no indication of how many steps or tool calls were made.

7. **No markdown rendering**: Enhancer's tool block results use plain `<pre>` text. No bold, headings, links, or tables.

8. **No concurrency guard**: deepseek-pp checks `isInlineAgentRunning()` to prevent duplicate loops (content.ts:2940-2946). Enhancer has no such check.

---

## 3. Feasibility Assessment

### 3.1 Can Be Replicated (with refactoring)

| Feature | Feasibility | Notes |
|---------|-------------|-------|
| **Agent panel container** | High | Pure DOM manipulation. Requires coordinating between MAIN and isolated worlds. |
| **Step visualization** | High | Can use a similar `createAgentStepElement()` approach. The postMessage bridge already carries step data. |
| **Streaming text during silent loop** | Medium | The XHR `progress` event in `handleSilentLoop` already receives chunks. Need to post per-chunk messages to isolated world for rendering. Currently only `checkSilentBuf` runs at end. |
| **Footer with stats** | High | Simple DOM element appended at loop end. |
| **Task complete signal** | High | Already partially implemented in `checkSilentBuf`. |
| **Nudge count limit** | High | Add `nudgeCount > MAX_NUDGES` check to existing nudge path. |
| **Markdown rendering** | Medium | Can port `renderInlineMarkdown()` from deepseek-pp's markdown.ts. Safe (no dependencies). |
| **Auto-collapse steps** | High | Simple timeout + CSS class. |
| **Stop button** | Medium | Already exists via abort mechanism. Need to wire button to abort controller. |

### 3.2 Cannot Be Replicated (or requires architecture change)

| Feature | Blocker | Workaround |
|---------|---------|------------|
| **suppressPageEvents (no rendering at all)** | Enhancer's XHR interception is in MAIN world and cannot prevent DeepSeek's rendering engine from processing its own SSE stream. The bypass header approach (`X-DPP-Bypass-Hook`) won't work because enhancer hooks `XMLHttpRequest.prototype.send`, not `fetch`. | Already handled by `scanAndHideToolResults()` — this is acceptable. The flicker is minor and the messages do get hidden. |
| **Tool cards inside chat messages** | Would require intercepting and rewriting DeepSeek's own SSE rendering pipeline, which is opaque and changes with platform updates. | Not needed — the tool blocks already serve this purpose. |
| **Pet/status indicator** | Requires the pet infrastructure. | Low priority — can add a simple status label in the agent panel. |
| **Programmatic `fetch()` instead of XHR** | Would require a completely different interception architecture (FetchEvent-based, like deepseek-pp). Enhancer is XHR-based. | Not needed — raw XHR works fine. The queuing mechanism (`setTimeout(delay)`) is functionally equivalent. |

### 3.3 Must-Work-Around Constraints

The fundamental constraint is the **browser extension MAIN/isolated world split**. deepseek-pp can use a single `post` callback because both the loop engine and the UI are in the same JS context (content script). Enhancer has:
- Loop logic in **MAIN world** (injected via `<script>` tag into page context)
- UI in **isolated world** (content script with its own DOM access)

This means all UI updates must go through `window.postMessage`, which adds latency but does not prevent any of the features listed above — it just means the message schema needs to be extended.

---

## 4. Implementation Plan

### Phase 1: Agent Panel + Step Streaming (Core UI)

**Goal**: Show the user what's happening during the silent loop.

**Files to modify**:

1. **`src/core/ui-tool-blocks.ts`** — Add agent panel rendering:
   - Port `renderer.ts` from deepseek-pp (createAgentContainer, createAgentStepElement, updateStepStreamText, addToolResultToStep, createAgentFooter)
   - Port `markdown.ts` from deepseek-pp (renderInlineMarkdown)
   - Add styles for `.dpp-agent-container`, `.dpp-agent-step`, etc.
   - Listen for new postMessage types: `DS_MINI_AGENT_STEP_STARTED`, `DS_MINI_AGENT_STREAM_CHUNK`, `DS_MINI_AGENT_TOOL_DETECTED`, `DS_MINI_AGENT_LOOP_COMPLETE`, `DS_MINI_AGENT_LOOP_ERROR`
   - Maintain module-level state: `inlineAgentContainer`, `inlineAgentCurrentStep`, `inlineAgentLoopId`

2. **`src/core/main-xhr-inject.ts`** — Stream intermediate data:
   - In `handleSilentLoop`'s `xhr.addEventListener('progress', ...)`: after extracting text via `extractTextFromData()`, post incremental chunks via `window.postMessage({ type: 'DS_MINI_AGENT_STREAM_CHUNK', ... })`
   - At step boundaries (tool call detection in `checkSilentBuf`): post `DS_MINI_AGENT_STEP_STARTED` and `DS_MINI_AGENT_STEP_COMPLETE`
   - When loop completes: post `DS_MINI_AGENT_LOOP_COMPLETE` with totalSteps/totalTools/finalText

3. **`src/core/types.ts`** — Add new message types:
   - `DS_MINI_AGENT_STEP_STARTED` — `{ loopId, stepIndex }`
   - `DS_MINI_AGENT_STREAM_CHUNK` — `{ loopId, stepIndex, fullText }`
   - `DS_MINI_AGENT_TOOL_DETECTED` — `{ loopId, stepIndex, call }`
   - `DS_MINI_AGENT_STEP_COMPLETE` — `{ loopId, stepIndex, toolExecutions }`
   - `DS_MINI_AGENT_LOOP_COMPLETE` — `{ loopId, totalSteps, totalTools, finalText }`
   - `DS_MINI_AGENT_LOOP_ERROR` — `{ loopId, stepIndex, error }`

4. **`src/entrypoints/content.ts`** — Wire new message types to handler functions.

### Phase 2: Nudge Improvements

**Goal**: Better nudge detection and limiting.

**File**: `src/core/main-xhr-inject.ts`
- Port `shouldNudge()` logic from `prompt.ts:92-100` — regex-based pending-action detection
- Add `nudgeCount > MAX_NUDGES` (8) check
- When max nudges reached, force end with budget notice

### Phase 3: Concurrency Guard

**File**: `src/entrypoints/content.ts` or `src/core/ui-tool-blocks.ts`
- Add `isInlineAgentRunning()` check before starting a new loop
- Show toast when a loop is already active

### Phase 4: Final Answer Rendering

**File**: `src/core/ui-tool-blocks.ts`
- On `DS_MINI_AGENT_LOOP_COMPLETE`: render final text via `renderInlineMarkdown()` in a `<div data-dpp-body-text>` appended after the agent container
- Append footer with step/tool counts

### Phase 5 (Optional): Trace Persistence

**Goal**: Restore agent panel on page refresh (like deepseek-pp's trace system).

**Files**: `src/core/ui-tool-blocks.ts`, new `src/core/agent-trace.ts`
- Port `InlineAgentTraceRecord` types and localStorage persistence from content.ts:3937-4100
- Render restored traces as collapsed historical panels

### Key Risks

1. **Step count tracking**: Enhancer currently only knows about tool calls, not "steps". Need a step counter that increments on each `handleSilentLoop` iteration, resetting on new user messages.

2. **Streaming chunk performance**: Posting incremental text via postMessage on every SSE chunk could overwhelm the message channel. Already throttled in deepseek-pp via `requestAnimationFrame` — must replicate that (renderer.ts:3216).

3. **loopId coordination**: Both MAIN and isolated world need a shared `loopId` to associate messages. Enhancer uses `silentDepth`. Need to add a UUID-based `loopId` created by the isolated world and passed to MAIN via `DS_MINI_SILENT_RESULT`.

---

## Appendix A: File Reference Map

### deepseek-pp files
| File | Lines | Role |
|------|-------|------|
| `core/inline-agent/loop.ts` | 1-455 | Agent loop engine: step iteration, streaming state, nudge logic, post events |
| `core/inline-agent/renderer.ts` | 1-359 | DOM rendering: container, step, footer creation + CSS |
| `core/inline-agent/markdown.ts` | 1-118 | Lightweight inline Markdown to HTML |
| `core/inline-agent/prompt.ts` | 1-194 | Continuation/nudge prompt building, task_complete detection, shouldNudge |
| `core/inline-agent/types.ts` | 1-115 | All agent-related types: payloads, states, messages, constants |
| `core/interceptor/fetch-hook.ts` | 86-111, 968-1065, 1081-1165 | Hook state, `ResponseCompletePayload`, SSE interceptor, XHR interceptor |
| `core/interceptor/fetch-hook.ts` | 705-923 | `XmlToolStreamFilter` — strips tool XML from visible stream |
| `core/deepseek/adapter.ts` | 162-194, 394-443 | `createPowHeaders`, `createClientHeaders`, `submitPromptStreaming` |
| `core/ui/tool-card.ts` | 1-324 | Tool card component with animations |
| `core/tool-loop/engine.ts` | 9-20 | `executeToolCallsSequentially` |
| `entrypoints/content.ts` | 2928-3015 | `startInlineAgentIfNeeded` — agent trigger |
| `entrypoints/content.ts` | 3113-3156 | `startInlineAgentLoop` — loop bridge |
| `entrypoints/content.ts` | 3158-3192 | `handleInlineAgentLoopEvent` — event router |
| `entrypoints/content.ts` | 3195-3371 | All UI event handlers |
| `entrypoints/content.ts` | 5702-5755 | Continuation message hider |

### deepseek-enhancer files (current)
| File | Lines | Role |
|------|-------|------|
| `src/core/main-xhr-inject.ts` | 687-936 | `handleSilentLoop` (XHR loop), `checkSilentBuf` (response dispatch) |
| `src/core/ui-tool-blocks.ts` | 1-600 | Tool block UI, `handleMainWorldToolCalls`, PoW, DOM submission |
| `src/core/sse-parser.ts` | — | Tool call extraction from SSE text |
| `src/entrypoints/content.ts` | — | Message routing, initialization |
