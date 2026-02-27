# OPTIMA - Project Root Structure (Current)

```text
web-starter-app/
|-- .gitignore
|-- index.html
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- vite.config.ts
|-- vitest.config.ts
|-- vercel.json
|-- README.md
|-- optima_architecture_and_demo.md
|-- optima_v2_architecture.md
|-- project-root-structure.md
|-- public/
|   `-- optima.png
|-- src/
|   |-- main.tsx
|   |-- App.tsx
|   |-- ErrorBoundary.tsx
|   |-- runanywhere.ts
|   |-- vite-env.d.ts
|   |-- components/
|   |   |-- CodeOptimizerTab.tsx
|   |   |-- CodeInputPanel.tsx
|   |   |-- OutputPanel.tsx
|   |   |-- OverviewPanel.tsx
|   |   |-- ExplainPanel.tsx
|   |   |-- DiffViewer.tsx
|   |   |-- ModelStatusBar.tsx
|   |   |-- PipelineIndicator.tsx
|   |   |-- ChatTab.tsx
|   |   |-- VisionTab.tsx
|   |   |-- VoiceTab.tsx
|   |   |-- FloatingChatAgent.tsx
|   |   `-- ModelBanner.tsx
|   |-- hooks/
|   |   |-- useModelLoader.ts
|   |   `-- useOptimizerState.ts
|   |-- lib/
|   |   |-- constants.ts
|   |   |-- staticAnalyzer.ts
|   |   |-- promptBuilder.ts
|   |   `-- codeDiff.ts
|   |-- styles/
|   |   |-- index.css
|   |   `-- accessibility.css
|   |-- types/
|   |   `-- index.ts
|   |-- workers/
|   |   |-- optimizer.worker.ts
|   |   `-- vlm-worker.ts
|   `-- __tests__/
|       `-- core.test.ts
|-- tests/
|   |-- web-starter-app-bugs.md
|   `-- web-starter-app-test-suite.md
|-- dist/ (generated output)
`-- node_modules/ (dependencies)
```

## Top-Level Files

- `README.md`: setup, usage, feature overview, troubleshooting
- `optima_v2_architecture.md`: current architecture and flow
- `project-root-structure.md`: this structure reference
- `optima_architecture_and_demo.md`: older/alternate architecture notes
- `package.json`: scripts + dependencies
- `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`: build/test/type config
- `vercel.json`: deployment config

## `src/` Responsibilities

### `src/main.tsx`

Application entry point. Mounts `App` with `ErrorBoundary`.

### `src/App.tsx`

Shell-level UI responsibilities:

- header/branding
- theme toggle
- history modal (select runs, load previous input/output)
- render `CodeOptimizerTab`

### `src/components/`

Primary UI layer.

Active components in current flow:

- `CodeOptimizerTab.tsx`: main optimization controller UI
- `OverviewPanel.tsx`: high-level optimization analysis view
- `DiffViewer.tsx`: before/after diff visualization
- `ExplainPanel.tsx`: textual reasoning and strategy details
- `CodeInputPanel.tsx`, `OutputPanel.tsx`, `ModelStatusBar.tsx`, `PipelineIndicator.tsx`

Placeholder components (currently `export { }`):

- `ChatTab.tsx`
- `VisionTab.tsx`
- `VoiceTab.tsx`
- `FloatingChatAgent.tsx`
- `ModelBanner.tsx`

### `src/hooks/`

- `useModelLoader.ts`: global worker wiring + model lifecycle state
- `useOptimizerState.ts`: reusable optimizer state helpers (not the primary live state owner yet)

### `src/lib/`

Optimization logic utilities:

- `staticAnalyzer.ts`: pattern/complexity analysis
- `promptBuilder.ts`: prompt construction + output normalization helpers
- `codeDiff.ts`: diff utilities
- `constants.ts`: storage keys, limits, labels, and shared config

### `src/styles/`

- `index.css`: main application design/theme system
- `accessibility.css`: accessibility-specific styling rules

### `src/types/`

- `index.ts`: worker message/request type declarations and helpers

### `src/workers/`

- `optimizer.worker.ts`: active inference/optimization worker
- `vlm-worker.ts`: currently unused in active app flow

### `src/__tests__/`

- `core.test.ts`: automated tests

## Non-Source Folders

- `public/`: static assets bundled or copied at build time
- `tests/`: manual QA docs and test planning notes
- `dist/`: generated production build output
- `node_modules/`: installed dependencies

## Current Structure Notes

- Some components/types reflect planned expansion beyond the current shipped optimization path.
- Runtime message names in worker and typed request names in `src/types/index.ts` are not fully aligned yet.
- Existing architecture is intentionally centered on `CodeOptimizerTab.tsx` + `optimizer.worker.ts` as the operational core.