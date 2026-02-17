# Web Starter App — Bug Report

## Run 1: Feb 17, 2026

**Environment:** Playwright (Chromium headless), macOS, Vite dev server
**SDK Version:** @runanywhere/web@0.1.0-beta.7 + web-llamacpp@0.1.0-beta.7 + web-onnx@0.1.0-beta.7

---

### BUG-1: `sherpa-onnx-glue.js` in `@runanywhere/web-onnx` is not browser-compatible [CRITICAL]

**Severity:** Critical — Voice tab (STT, TTS, VAD) is completely non-functional

**Symptoms:**
- All Sherpa-ONNX models (Silero VAD, Whisper STT, Piper TTS) fail to load
- Error: `createModule is not a function`
- App correctly shows error banner but Voice pipeline is unusable

**Root cause:** The `sherpa-onnx-glue.js` file shipped in `@runanywhere/web-onnx@0.1.0-beta.7` has three problems:

1. **No ES module export.** The file uses CJS/UMD exports (`module.exports = Module`) but `SherpaONNXBridge._doLoad()` uses `const { default: createModule } = await import(moduleUrl)` which expects ESM. In the browser, `import()` returns an empty module — `createModule` is `undefined`.

2. **Unconditional `require("node:path")`.** At position ~6952, the file calls `var nodePath = require("node:path")` outside any `ENVIRONMENT_IS_NODE` guard. This throws `ReferenceError: require is not defined` in the browser.

3. **NODERAWFS not patched for browser.** The Emscripten glue was compiled with `-s NODERAWFS=1`. The `ENVIRONMENT_IS_NODE = false` patch described in `SherpaONNXBridge.js` comments (lines 98–101) was not applied to the shipped file. This causes `Error: NODERAWFS is currently only supported on Node.js` at runtime.

**Fix required (in the npm package build):**

1. Post-compile patch: add `export default Module;` to the end of the glue file
2. Post-compile patch: move `require("node:path")` inside `if (ENVIRONMENT_IS_NODE)`
3. Post-compile patch: force `ENVIRONMENT_IS_NODE = false` and skip NODERAWFS FS mount

These patches should be applied in `./wasm/scripts/build-sherpa-onnx.sh` before publishing.

**Likely cause:** During the multi-package refactor from `@runanywhere/web@beta.4` → `@runanywhere/web-onnx@beta.7`, the post-compile browser patches were lost or not applied to the new package's build output.

**Fix applied:** Added `wasm/scripts/patch-sherpa-glue.js` — a Node.js script that applies 5 patches to the Emscripten output:
1. `ENVIRONMENT_IS_NODE = false` (force browser code paths)
2. `require("node:path")` → browser-compatible PATH shim (isAbsolute/normalize/join)
3. NODERAWFS error throw → removed (avoids "not supported" crash)
4. NODERAWFS FS patching → removed (preserves MEMFS)
5. `export default Module;` appended (enables ESM dynamic import)

The script is called from `build-sherpa-onnx.sh` Step 3.5 after copying the Emscripten output.
Verified: 5/5 patches apply successfully to the `sherpa-onnx-glue.js` from `@runanywhere/web-onnx@0.1.0-beta.7`.

**Status:** FIXED in `@runanywhere/web-onnx@0.1.0-beta.8` (published Feb 17, 2026).

---

### BUG-2: WebGPU WASM file missing (404) [LOW]

**Severity:** Low — graceful fallback to CPU

**Error:** `404: /node_modules/@runanywhere/web-llamacpp/wasm/racommons-llamacpp-webgpu.js`

**Impact:** None — CPU fallback works. LLM runs at ~24-27 tok/s.

---

## Passing Tests Summary

| Category | Pass | Fail | Skip |
|----------|------|------|------|
| A. App Load & Init | 7 | 0 | 0 |
| B. Header & Badge | 4 | 0 | 0 |
| C. Tab Navigation | 8 | 0 | 0 |
| D. Chat Tab UI | 9 | 0 | 0 |
| E. Chat Interactions | 5 | 0 | 0 |
| F. Vision Tab UI | 9 | 0 | 0 |
| G–H. Vision Camera/Live | 2 | 0 | 8 |
| I. Voice Tab UI | 8 | 0 | 0 |
| J. Voice Interactions | 2 | 1* | 2 |
| K. ModelBanner States | 5 | 0 | 3 |
| L. Styling & Theming | 8 | 0 | 0 |
| M. Cross-Tab State | 4 | 0 | 0 |
| N. Error Handling | 5 | 0 | 0 |
| O. Console Audit | 5 | 0 | 0 |
| **TOTAL** | **81** | **1*** | **13** |

*BUG-1 blocks all Voice/STT/TTS/VAD functionality. Skips are headless-browser limitations (no camera/mic).

**Chat tab works end-to-end:** model download → OPFS cache → load (252ms) → streaming generation (27 tok/s).

---

## Run 2: Feb 17, 2026 — Post-Fix Validation (beta.8)

**Environment:** Playwright (Chromium headless), macOS, Vite dev server
**SDK Version:** @runanywhere/web@0.1.0-beta.8 + web-llamacpp@0.1.0-beta.8 + web-onnx@0.1.0-beta.8

### BUG-1 Resolved

The `sherpa-onnx-glue.js` in `@runanywhere/web-onnx@0.1.0-beta.8` now ships with all 5 browser-compatibility patches applied:
- `ENVIRONMENT_IS_NODE=false` — confirmed
- `require("node:path")` — removed, replaced with browser PATH shim
- NODERAWFS throw — removed
- NODERAWFS FS patching — removed
- `export default Module;` — confirmed at end of file

### Test Results — All UI Tests PASS

| Category | Pass | Fail |
|----------|------|------|
| A. App Load & SDK Init | 7 | 0 |
| B. Header & Badge | 4 | 0 |
| C. Tab Navigation (15 rapid switches) | 8 | 0 |
| D. Chat Tab UI | 9 | 0 |
| F. Vision Tab UI | 9 | 0 |
| I. Voice Tab UI | 8 | 0 |
| M. Cross-Tab State | 4 | 0 |
| N. Error Handling | 5 | 0 |
| O. Console Audit | 5 | 0 |

### Console Audit

| Type | Count | Details |
|------|-------|---------|
| Errors | 1 | WebGPU WASM 404 (EXPECTED — CPU fallback works) |
| Warnings | 1 | WebGPU fallback warning (EXPECTED) |
| Unexpected errors | 0 | None |

### Backend Registration Verified

- `[RunAnywhere:LlamaCppBridge] LlamaCpp WASM ...` — LlamaCpp backend loaded
- `[RunAnywhere:LlamaCppProvider] LlamaCpp backend registered` — LLM+VLM capabilities
- `[RunAnywhere:ONNXProvider] ONNX backend registered` — STT+TTS+VAD capabilities
- No `createModule is not a function` error (BUG-1 FIXED)
- No `require is not defined` error (node:path patch working)
- No `NODERAWFS not supported` error (NODERAWFS patches working)

---

## Run 3: Feb 17, 2026 — Full End-to-End Test Suite (beta.8, clean npm install)

**Environment:** Playwright (Chromium headless), macOS, Vite dev server
**SDK Version:** @runanywhere/web@0.1.0-beta.8 + web-llamacpp@0.1.0-beta.8 + web-onnx@0.1.0-beta.8
**Install:** Clean `rm -rf node_modules && npm install` from npm registry

### Test Results — All Testable Tests PASS

| Category | Pass | Fail | Skip |
|----------|------|------|------|
| A. App Load & SDK Init | 7 | 0 | 0 |
| B. Header & Acceleration Badge | 4 | 0 | 0 |
| C. Tab Bar & Navigation (20 rapid switches) | 8 | 0 | 0 |
| D. Chat Tab — UI Elements | 9 | 0 | 0 |
| E. Chat Tab — Interactions | 3 | 0 | 2 |
| F. Vision Tab — UI Elements | 9 | 0 | 0 |
| G–H. Vision Camera/Live | 0 | 0 | 10 |
| I. Voice Tab — UI Elements | 8 | 0 | 0 |
| J. Voice Interactions | 0 | 0 | 5 |
| K. ModelBanner States | 4 | 0 | 4 |
| L. Styling & Theming | 8 | 0 | 0 |
| M. Cross-Tab State | 4 | 0 | 0 |
| N. Error Handling & Edge Cases | 5 | 0 | 0 |
| O. Console Error Audit | 5 | 0 | 0 |
| **TOTAL** | **74** | **0** | **21** |

Skips are headless-browser limitations (no camera, no microphone, model download tests).

### Key Verified Results

**SDK Initialization:**
- `[RunAnywhere:RunAnywhere] Initializing RunAnywhere...` — core init
- `[RunAnywhere:LlamaCppBridge] LlamaCpp WASM loaded` — LLM/VLM backend
- `[RunAnywhere:LlamaCppProvider] LlamaCpp backend registered` — LLM+VLM capabilities
- `[RunAnywhere:ONNXProvider] ONNX backend registered` — STT+TTS+VAD capabilities

**Styling Verified:**
- Dark theme: `rgb(15, 23, 42)`
- Orange accent: `rgba(255, 85, 0, 1)`
- Max-width: 600px
- Responsive at 375px / 768px / 1024px — all render correctly

**Console Audit:**
- 1 error: WebGPU WASM 404 (EXPECTED)
- 1 warning: WebGPU fallback (EXPECTED)
- 0 TypeError / ReferenceError
- 0 React errors
- 0 CORS errors
- 0 unexpected errors

### Bugs Found: NONE (0 new bugs)
