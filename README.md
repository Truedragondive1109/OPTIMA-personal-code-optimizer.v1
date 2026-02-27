# OPTIMA - On-Device Code Intelligence Engine

OPTIMA is a browser-first code optimization app built with React + TypeScript + Vite + RunAnywhere.

Inference runs locally on your device through a Web Worker and LlamaCPP-backed models. The app is designed to keep source code private while still providing practical optimization suggestions, code rewrites, and explainable results.

## Highlights

- On-device AI optimization workflow (no server inference path in this repo)
- Model selection at startup (Qwen2.5 0.5B, 1.5B, 3B GGUF variants)
- Multi-language optimization support:
  - JavaScript
  - TypeScript
  - Python
  - Java
  - C++
- Streaming generation preview with live status states
- Multiple output views:
  - Overview
  - Optimized code
  - Diff
  - Explanation
- Fast mode for lower latency
- Run history persistence in localStorage
- Graceful cancellation and timeout protection

## Core Features

### 1. Optimization Pipeline

- Static analysis of input code
- Prompt construction based on language, focus, and mode
- LLM inference in a dedicated worker thread
- Output normalization and safety fallbacks

### 2. Smart UI States

- Idle / initializing / loading / ready / error model states
- Progress and byte-level download feedback
- Stage-based optimization display (`Understanding Code`, `Optimizing`, `Refining Optimization`, `Finalizing Output`)

### 3. History and Replay

- Stores recent runs in localStorage (`code_optimizer_history_v1`)
- Lets you inspect previous outputs and load previous input/optimized code back into editor

### 4. Reliability Features

- Inference timeout guard (90s)
- Active cancel support from UI
- Retry logic for empty/incomplete model output
- Fallback to original code when output cannot be validated

## Architecture Overview

The app uses a worker-centric design:

- Main thread:
  - React UI rendering
  - Model selection UI
  - History modal and theme controls
  - Streaming text display and result panels
- Worker thread (`src/workers/optimizer.worker.ts`):
  - SDK/model initialization
  - Download/load orchestration
  - Static analysis + prompting + inference
  - Chunking for larger inputs
  - Result normalization and final payload emission

Message-based communication is used between UI and worker (`INIT`, `START_OPTIMIZATION`, `CANCEL_OPTIMIZATION`).

## Model and Runtime Details

Registered models:

- `qwen2.5-0.5b-instruct-q4_0` (approx memory requirement: 350MB)
- `qwen2.5-1.5b-instruct-q4_0` (approx memory requirement: 900MB)
- `qwen2.5-3b-instruct-q4_0` (approx memory requirement: 1.8GB)

Runtime tuning:

- Temperature: `0.05`
- Timeout: `90_000ms`
- Input chunk threshold: 80 lines
- Adaptive token budgets (normal + fast variants)

## Project Structure

```text
web-starter-app/
|-- src/
|   |-- components/
|   |-- hooks/
|   |-- lib/
|   |-- styles/
|   |-- types/
|   |-- workers/
|   `-- __tests__/
|-- public/
|-- tests/
|-- README.md
|-- optima_v2_architecture.md
`-- project-root-structure.md
```

Detailed structure and responsibilities:

- `optima_v2_architecture.md`
- `project-root-structure.md`

## Setup

### Prerequisites

- Node.js 18+ (recommended)
- npm 9+
- Modern Chromium-based browser recommended for best WebAssembly/WebGPU behavior

### Install

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open `http://localhost:5173`.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Test Commands

- `npm run test`
- `npm run test:ui`
- `npm run test:coverage`

## How to Use

1. Start the app.
2. Select a model and wait for download/load.
3. Paste code in the input panel.
4. Choose language and optimization focus.
5. Toggle Fast mode if you prefer lower latency.
6. Click `Optimize Code`.
7. Inspect output in Overview, Code, Diff, and Explain tabs.
8. Optionally load historical runs from History modal.

## Configuration and Persistence

Local keys currently used:

- `code_optimizer_history_v1`
- `darkMode`
- `optima_model_cached_v1`

Model assets are downloaded and cached by the SDK/browser storage layer.

## Privacy and Security Notes

- Code processing is local in-browser for this app implementation.
- No explicit backend inference route is defined in this repository.
- History is client-side only (localStorage).

## Troubleshooting

### Model does not load

- Check network connectivity for first-time model download
- Ensure sufficient available memory for selected model
- Try a smaller model (0.5B) first
- Refresh page and retry

### Slow optimization

- Enable Fast mode
- Use smaller input snippet
- Close heavy browser tabs/applications
- Prefer 0.5B/1.5B model for lower latency

### Output looks incomplete

- Retry optimization once
- Disable Fast mode for more complete outputs
- Reduce input size and optimize sections separately

### Browser compatibility issues

- Use latest Chrome or Edge for best compatibility
- Run via localhost or HTTPS context

## Known Limitations

- Placeholder components exist and are not yet feature-complete:
  - `ChatTab.tsx`
  - `VisionTab.tsx`
  - `VoiceTab.tsx`
  - `FloatingChatAgent.tsx`
  - `ModelBanner.tsx`
- `src/workers/vlm-worker.ts` is present but not part of the active UI path
- Some type declarations in `src/types/index.ts` differ from current runtime worker message names

## Roadmap (High-Level)

- Align worker runtime contract and type-level request/message definitions
- Expand automated tests beyond current core coverage
- Integrate or remove placeholder components based on product direction
- Improve modularity of `CodeOptimizerTab.tsx` state/event handling

## License

MIT