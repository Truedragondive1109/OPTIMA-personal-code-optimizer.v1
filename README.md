# OPTIMA — Your Personal Code Optimizer

**OPTIMA** is a web app that optimizes and refactors code using on-device AI. It runs entirely in the browser (no server, no API keys) and includes a floating chat assistant.

---

## Using the app on the web

### Run the app

1. **Install dependencies** (once):
   ```bash
   npm install
   ```

2. **Start the dev server** (e.g. in PowerShell):
   ```bash
   npm run dev
   ```

3. **Open in the browser:**  
   Go to [http://localhost:5173](http://localhost:5173).

4. **Stop the app:**  
   In the terminal, press **Ctrl + C**.

On first load you’ll see “Loading OPTIMA…” while the SDK initializes. Then the Code Optimizer and header appear. The first time you use optimization or chat, the LLM model may download and load (you’ll see a banner); after that it’s cached in the browser.

---

## Directions for using the app

### Code Optimizer (main screen)

| Step | What to do |
|------|------------|
| **1. Input code** | Paste code into the **Input Code** area (left), or click **Import** (➕) to load a file. Supported extensions (e.g. `.ts`, `.js`, `.py`) are detected and the language is set automatically. |
| **2. Language** | Use **SELECT CODING LANGUAGE** if the auto-detected language is wrong (e.g. TypeScript, Python, JavaScript). |
| **3. Optimization focus** | Use **SELECT OPTIMIZATION** to choose: All, Performance, Readability, Security, or Best Practices. |
| **4. Optimize** | Click **✨ Optimize Code**. The pipeline runs through real stages: Understanding Code (static analysis), Optimizing (LLM inference), and Finalizing Output. |
| **5. Streaming UX** | During optimization, watch the code stream live. Sub-stage text and a chunk progress bar provide real-time feedback. |
| **6. Use result** | View the optimized code, diff, and explanations. Use **Use Optimized** to copy the result into the input area, **Copy Formatted** to copy, or **Export** to download. |

- **History:** Click **History** to see past optimizations; use **Revert** on an item to restore that version into the editor.
- **Character limit:** Input is limited (e.g. 4000 characters). For code < 3000 chars, the system uses a single LLM pass for better context; larger files are chunked.
- **Fallback mechanism:** If the model returns the exact same code or invalid output, OPTIMA will retry once with stronger instructions. If it still fails, it safely falls back to the original code without breaking the UI.

---

## Fine details

- **Keyboard shortcuts**
  - **Ctrl/Cmd + Enter** — Run code optimization (when input has code and is under the limit).
  - **Ctrl/Cmd + K** — Clear the input area and output.
- **Theme:** Use the **sun/moon** icon in the header to switch between light and dark mode. The choice is saved in `localStorage`.
- **Toast messages:** Short notifications (e.g. “Copied to clipboard!”, “Optimization completed!”) appear briefly at the top-right.
- **Errors:** If something goes wrong, an error message appears in a red bar; use **Dismiss** to clear it. For runtime errors, the app may show “Something went wrong” and the message; check the browser console (F12) for details.

---

## Original documentation (RunAnywhere Web Starter)

The rest of this file is the original README for the RunAnywhere Web Starter App.

---

commands -
npm run dev in powershell
ctrl + c for exiting the app in terminal.

# RunAnywhere Web Starter App

A minimal React + TypeScript starter app demonstrating **on-device AI in the browser** using the [`@runanywhere/web`](https://www.npmjs.com/package/@runanywhere/web) SDK. All inference runs locally via WebAssembly — no server, no API key, 100% private.

## Features

| Tab | What it does |
|-----|-------------|
| **Chat** | Stream text from an on-device LLM (SmolLM2 360M) |
| **Vision** | Point your camera and describe what the VLM sees (LFM2-VL 450M) |
| **Voice** | Speak naturally — VAD detects speech, STT transcribes, LLM responds, TTS speaks back |

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Models are downloaded on first use and cached in the browser's Origin Private File System (OPFS).

## How It Works

```
@runanywhere/web (npm package)
  ├── WASM engine (llama.cpp, whisper.cpp, sherpa-onnx)
  ├── Model management (download, OPFS cache, load/unload)
  └── TypeScript API (TextGeneration, STT, TTS, VAD, VLM, VoicePipeline)
```

The app imports everything from `@runanywhere/web`:

```typescript
import { RunAnywhere, TextGeneration, VLMWorkerBridge } from '@runanywhere/web';

await RunAnywhere.initialize({ environment: 'development' });

// Stream LLM text
const { stream } = await TextGeneration.generateStream('Hello!', { maxTokens: 200 });
for await (const token of stream) { console.log(token); }

// VLM: describe an image
const result = await VLMWorkerBridge.shared.process(rgbPixels, width, height, 'Describe this.');
```

## Project Structure

```
src/
├── main.tsx              # React root
├── App.tsx               # Tab navigation (Chat | Vision | Voice)
├── runanywhere.ts        # SDK init + model catalog + VLM worker
├── workers/
│   └── vlm-worker.ts     # VLM Web Worker entry (2 lines)
├── hooks/
│   └── useModelLoader.ts # Shared model download/load hook
├── components/
│   ├── ChatTab.tsx        # LLM streaming chat
│   ├── VisionTab.tsx      # Camera + VLM inference
│   ├── VoiceTab.tsx       # Full voice pipeline
│   └── ModelBanner.tsx    # Download progress UI
└── styles/
    └── index.css          # Dark theme CSS
```

## Adding Your Own Models

Edit the `MODELS` array in `src/runanywhere.ts`:

```typescript
{
  id: 'my-custom-model',
  name: 'My Model',
  repo: 'username/repo-name',           // HuggingFace repo
  files: ['model.Q4_K_M.gguf'],         // Files to download
  framework: LLMFramework.LlamaCpp,
  modality: ModelCategory.Language,      // or Multimodal, SpeechRecognition, etc.
  memoryRequirement: 500_000_000,        // Bytes
}
```

Any GGUF model compatible with llama.cpp works for LLM/VLM. STT/TTS/VAD use sherpa-onnx models.

## Deployment

### Vercel

```bash
npm run build
npx vercel --prod
```

The included `vercel.json` sets the required Cross-Origin-Isolation headers.

### Netlify

Add a `_headers` file:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

### Any static host

Serve the `dist/` folder with these HTTP headers on all responses:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

## Browser Requirements

- Chrome 96+ or Edge 96+ (recommended: 120+)
- WebAssembly (required)
- SharedArrayBuffer (requires Cross-Origin Isolation headers)
- OPFS (for persistent model cache)

## Documentation

- [SDK API Reference](https://docs.runanywhere.ai)
- [npm package](https://www.npmjs.com/package/@runanywhere/web)
- [GitHub](https://github.com/RunanywhereAI/runanywhere-sdks)

## License

MIT
