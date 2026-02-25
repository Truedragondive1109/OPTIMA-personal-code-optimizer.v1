# OPTIMA - Project Root Structure

```text
OPTIMA-personal-code-optimizer.v1/
|-- index.html
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- vite.config.ts
|-- vercel.json
|-- README.md
|-- optima_architecture_and_demo.md
|-- project-root-structure.md
|-- src/
|   |-- main.tsx
|   |-- App.tsx
|   |-- ErrorBoundary.tsx
|   |-- runanywhere.ts
|   |-- vite-env.d.ts
|   |-- components/
|   |   |-- CodeOptimizerTab.tsx
|   |   |-- ExplainPanel.tsx
|   |   |-- DiffViewer.tsx
|   |   |-- OverviewPanel.tsx
|   |   |-- ModelStatusBar.tsx
|   |   |-- PipelineIndicator.tsx
|   |   |-- ChatTab.tsx (empty placeholder)
|   |   |-- VisionTab.tsx (empty placeholder)
|   |   |-- VoiceTab.tsx (empty placeholder)
|   |   |-- FloatingChatAgent.tsx (empty placeholder)
|   |   |-- ModelBanner.tsx (empty placeholder)
|   |-- hooks/
|   |   `-- useModelLoader.ts
|   |-- lib/
|   |   |-- staticAnalyzer.ts
|   |   |-- promptBuilder.ts
|   |   `-- codeDiff.ts
|   |-- workers/
|   |   |-- optimizer_worker.ts
|   |   `-- vlm-worker.ts (unused)
|   `-- styles/
|       `-- index.css
|-- tests/
|   |-- web-starter-app-bugs.md
|   `-- web-starter-app-test-suite.md
|-- node_modules/
```

## File Responsibilities

### Core Application Files
- **`src/main.tsx`**: React app entry point and rendering
- **`src/App.tsx`**: Main app component with theme and layout
- **`src/ErrorBoundary.tsx`**: Error boundary for graceful error handling
- **`src/runanywhere.ts`**: RunAnywhere SDK initialization and model catalog
- **`src/vite-env.d.ts`**: Vite environment type definitions

### Active Components
- **`src/components/CodeOptimizerTab.tsx`**: Main optimizer UI with input/output panels, loading stages, and tab management
- **`src/components/ExplainPanel.tsx`**: Detailed optimization explanations and insights
- **`src/components/DiffViewer.tsx`**: Side-by-side code comparison with diff statistics
- **`src/components/OverviewPanel.tsx`**: Comprehensive analysis overview with complexity metrics and pattern detection
- **`src/components/ModelStatusBar.tsx`**: Model loading status and acceleration mode display
- **`src/components/PipelineIndicator.tsx`**: Processing stage indicators with animated progress

### Placeholder Components (Empty)
- **`src/components/ChatTab.tsx`**: Empty placeholder for future chat functionality
- **`src/components/VisionTab.tsx`**: Empty placeholder for future vision features
- **`src/components/VoiceTab.tsx`**: Empty placeholder for future voice integration
- **`src/components/FloatingChatAgent.tsx`**: Empty placeholder for future AI assistant
- **`src/components/ModelBanner.tsx`**: Empty placeholder for future model information display

### Core Logic
- **`src/hooks/useModelLoader.ts`**: Model state management and SDK initialization hook
- **`src/lib/staticAnalyzer.ts`**: Code pattern analysis and complexity detection
- **`src/lib/promptBuilder.ts`**: Smart prompt construction with adaptive sizing and language-specific examples
- **`src/lib/codeDiff.ts`**: Diff calculation utilities and visualization helpers

### Workers
- **`src/workers/optimizer_worker.ts`**: Main optimization engine with LLM inference, retry logic, and output normalization
- **`src/workers/vlm-worker.ts`**: Unused VLM worker (can be removed in cleanup)

### Styling
- **`src/styles/index.css`**: Premium glassmorphism design system with dark/light themes

### Configuration
- **`package.json`**: Dependencies and build scripts
- **`tsconfig.json`**: TypeScript compilation configuration
- **`vite.config.ts`**: Vite build tool configuration
- **`vercel.json`**: Deployment configuration for Vercel

### Documentation
- **`README.md`**: Comprehensive project documentation and getting started guide
- **`optima_architecture_and_demo.md`**: Detailed technical architecture and implementation notes
- **`project-root-structure.md`**: This file - project structure overview

### Development Files
- **`tests/`**: Development documentation and bug tracking (not used in production)

### Build Output
- **`dist/`**: Built application files (generated during build)
