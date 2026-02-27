# OPTIMA v2 Architecture (Current Implementation)

This document describes the architecture as currently implemented in `web-starter-app`.

## 1. System Design

OPTIMA uses a worker-centric browser architecture:

- Main thread (React): UI rendering, user interactions, model selection, history modal, streaming presentation.
- Worker thread (`src/workers/optimizer.worker.ts`): model initialization, static analysis, prompt generation, inference streaming, output normalization, fallback behavior.

This split keeps the UI responsive while model compute and parsing work stay off the main thread.

## 2. Main-Thread Runtime

### 2.1 Entry and App shell

- `src/main.tsx`: mounts `App` inside `ErrorBoundary`.
- `src/App.tsx`:
  - theme toggle (`darkMode` localStorage)
  - history modal and replay actions
  - mounting of `CodeOptimizerTab`

### 2.2 Optimization UI owner

`src/components/CodeOptimizerTab.tsx` is the active orchestration layer for optimization UX:

- Code input and language selection
- Focus mode selection (`performance`, `readability`, `security`, `best-practices`, `all`)
- Fast mode toggle
- Worker event handling
- Streaming preview box
- Output tabs (`overview`, `code`, `diff`, `explain`)
- Toast/status states and keyboard shortcuts
- Local history writes (`code_optimizer_history_v1`)

### 2.3 Model loader state

`src/hooks/useModelLoader.ts` provides:

- singleton worker instance (`globalWorker`)
- global SDK status (`idle`, `initializing`, `loading_model`, `ready`, `error`)
- initialization helpers (`initializeSDK`, `initializeSDKWithModel`)
- progress + download bytes + cached flag + acceleration mode

## 3. Worker Runtime Pipeline

`src/workers/optimizer.worker.ts` handles three incoming message types:

- `INIT`
- `START_OPTIMIZATION`
- `CANCEL_OPTIMIZATION`

### 3.1 Model initialization flow

1. Initialize RunAnywhere in production mode.
2. Register LlamaCPP backend.
3. Subscribe to `llamacpp.wasmLoaded` to detect acceleration mode (`cpu` or `webgpu`).
4. Register available Qwen2.5 GGUF models (0.5B / 1.5B / 3B).
5. Select model requested by UI.
6. Download model if needed (emit progress events).
7. Load model into memory.
8. Emit `READY` to main thread.

### 3.2 Optimization flow (single chunk)

1. Emit `stage: Understanding Code`.
2. Run static analysis (`analyzeCode`).
3. Build prompt (`buildPrompt` or `buildPromptFast`).
4. Emit `stage: Optimizing`.
5. Run streamed generation with timeout and retry safety.
6. Emit `stage: Finalizing Output`.
7. Normalize/validate model output and emit `done`.

### 3.3 Optimization flow (multi-chunk)

If input exceeds line threshold (`MAX_INPUT_LINES = 80`):

1. Split code with boundary-aware chunking and overlap context.
2. Emit `stage: Refining Optimization` + `chunk_progress` updates.
3. Optimize chunks sequentially.
4. Reassemble optimized chunks.
5. Emit synthesized final result payload (`done`).

### 3.4 Streaming and cancellation

- Streaming events: `stream_active` -> repeated `chunk` -> `stream_idle`
- Retry transitions clear stream preview via `retry_clear`
- Cancel path uses active generation cancel function
- Timeout guard: `INFERENCE_TIMEOUT_MS = 90_000`

## 4. Prompting, Analysis, and Post-Processing

### 4.1 Static analysis

`src/lib/staticAnalyzer.ts` detects patterns/complexity hints used in prompt strategy and explanation payloads.

### 4.2 Prompt generation

`src/lib/promptBuilder.ts` provides normal and fast prompt contracts.

### 4.3 Normalization and fallback

Worker applies parser/normalization helpers to:

- extract code output
- resolve wrapper/formatting artifacts
- detect parse failures and preserve safe fallback behavior

If output cannot be validated, original code is preserved instead of returning unsafe partial transforms.

## 5. Worker Event Contract in Use

### 5.1 Lifecycle/status events

- `status`
- `READY`
- `init-error`
- `progress`
- `download_bytes`
- `cached`
- `model_selected`
- `accelerationMode`

### 5.2 Optimization events

- `stage`
- `substage`
- `chunk_progress`
- `stream_active`
- `chunk`
- `stream_idle`
- `retry_clear`
- `done`
- `error`

## 6. Persistence and Local State

- localStorage keys:
  - `code_optimizer_history_v1`
  - `darkMode`
  - `optima_model_cached_v1`
- Model files are cached in browser-managed storage through SDK/model manager.

## 7. Reliability and Tradeoffs

- Determinism favored over creative variance (`temperature = 0.05`).
- Fast mode reduces latency using smaller token budgets and fewer retries.
- Chunked optimization scales better for longer inputs but cannot guarantee full-file global-context coherence.
- Placeholder feature tabs/components exist but are intentionally inactive in current runtime path.

## 8. Current Architecture Gaps

- `src/types/index.ts` request type names do not fully match runtime worker message names (`INIT`/`START_OPTIMIZATION` vs typed `INIT_SDK`/`OPTIMIZE`).
- `useOptimizerState.ts` exists as extracted state utilities, while `CodeOptimizerTab.tsx` still directly manages most live UI state.
- `src/workers/vlm-worker.ts` is present but not part of current UI flow.