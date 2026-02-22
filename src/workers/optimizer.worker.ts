/**
 * optimizer.worker.ts — OPTIMA Optimization Pipeline
 *
 * PIPELINE:
 *   1. "Understanding Code"   → static analysis + prompt construction
 *   2. "Optimizing"           → LLM inference (SINGLE call for small input)
 *   3. "Finalizing Output"    → code extraction + normalization
 *
 * RETRY: If optimized_code === original_code, retry ONCE with stronger prompt.
 * CHUNKING: Disabled for code < CHUNK_THRESHOLD characters.
 * OUTPUT: LLM returns raw code (no JSON). Streamed tokens ARE the code.
 */

import { analyzeCode } from '../lib/staticAnalyzer';
import { buildStructuredPrompt, normalizeLLMOutput } from '../lib/promptBuilder';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import type { OptimizationFocus } from '../lib/promptBuilder';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Below this character count, send FULL code as single request (no chunking)
const CHUNK_THRESHOLD = 3000;

// ─────────────────────────────────────────────────────────────────────────────
// Worker state
// ─────────────────────────────────────────────────────────────────────────────
let modelLoaded = false;
let cancelCurrent: (() => void) | null = null;

// Sub-stage messages during LLM inference
const LLM_SUB_STAGES = [
    'Rewriting inefficient loops...',
    'Optimizing memory usage...',
    'Reducing algorithmic complexity...',
    'Applying compiler-like optimizations...',
    'Searching for hidden bottlenecks...',
    'Improving data structure access patterns...',
    'Eliminating redundant computations...',
    'Refactoring for zero-overhead abstractions...',
    'Analyzing branch prediction impact...',
    'Optimizing cache locality...',
    'Reducing time complexity...',
    'Simplifying control flow...',
    'Applying idiomatic patterns...',
    'Validating correctness of transforms...',
    'Checking edge cases...',
    'Minimizing allocations...',
    'Flattening nested iterations...',
    'Inlining hot functions...',
    'Streamlining I/O operations...',
    'Profiling critical paths...',
];

// ─────────────────────────────────────────────────────────────────────────────
// SDK initialization
// ─────────────────────────────────────────────────────────────────────────────
async function workerInitSDK() {
    try {
        const {
            RunAnywhere,
            SDKEnvironment,
            ModelManager,
            ModelCategory,
            LLMFramework,
            EventBus,
        } = await import('@runanywhere/web');

        const { LlamaCPP } = await import('@runanywhere/web-llamacpp');

        // Step 1: Initialize SDK
        try {
            await RunAnywhere.initialize({ environment: SDKEnvironment.Development, debug: false });
        } catch (err: any) {
            throw new Error(`SDK initialization failed: ${err.message || String(err)}`);
        }

        // Step 2: Register LlamaCPP backend
        try {
            await LlamaCPP.register();
        } catch (err: any) {
            throw new Error(`Failed to register LlamaCPP backend: ${err.message || String(err)}. Check browser compatibility (Chrome/Edge 96+, WebAssembly, SharedArrayBuffer).`);
        }

        EventBus.shared.on('llamacpp.wasmLoaded', (evt: any) => {
            self.postMessage({ type: 'accelerationMode', value: evt.accelerationMode ?? 'cpu' });
        });

        // Step 3: Register model catalog
        RunAnywhere.registerModels([
            {
                id: 'lfm2-350m-q4_k_m',
                name: 'LFM2 350M Q4_K_M',
                repo: 'LiquidAI/LFM2-350M-GGUF',
                files: ['LFM2-350M-Q4_K_M.gguf'],
                framework: LLMFramework.LlamaCpp,
                modality: ModelCategory.Language,
                memoryRequirement: 250_000_000,
            } as any,
        ]);

        const models = ModelManager.getModels().filter((m: any) => m.modality === ModelCategory.Language);
        if (models.length === 0) {
            throw new Error('No Language model registered in worker');
        }

        const model = models[0];
        const modelId = model.id;
        let forceDownload = false;

        // Step 4: Handle model status - download if needed or reset if in error state
        if (String(model.status).toLowerCase() === 'error') {
            // Model is in error state - try to reset by re-downloading
            console.log('[Worker] Model is in error state, attempting to reset by re-downloading...');
            self.postMessage({ type: 'status', value: 'initializing' });
            
            try {
                // Try to unload/clear the error state first
                try {
                    const loadedModel = ModelManager.getLoadedModel(ModelCategory.Language);
                    if (loadedModel) {
                        ModelManager.unloadModel(loadedModel.id);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (err) {
                    console.warn('[Worker] Could not unload model in error state:', err);
                }

                // Re-register the model to reset its state
                RunAnywhere.registerModels([
                    {
                        id: 'lfm2-350m-q4_k_m',
                        name: 'LFM2 350M Q4_K_M',
                        repo: 'LiquidAI/LFM2-350M-GGUF',
                        files: ['LFM2-350M-Q4_K_M.gguf'],
                        framework: LLMFramework.LlamaCpp,
                        modality: ModelCategory.Language,
                        memoryRequirement: 250_000_000,
                    } as any,
                ]);

                // Get fresh model reference
                const freshModels = ModelManager.getModels().filter((m: any) => m.modality === ModelCategory.Language);
                if (freshModels.length === 0) {
                    throw new Error('Failed to re-register model');
                }
                const freshModel = freshModels[0];

                // Force re-download
                const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
                    if (evt.modelId === freshModel.id) {
                        self.postMessage({ type: 'progress', value: evt.progress ?? 0 });
                    }
                });

                await ModelManager.downloadModel(freshModel.id);
                unsub();
                self.postMessage({ type: 'progress', value: 1 });

                // Step 6 will re-read current status from ModelManager.
                forceDownload = false;
            } catch (err: any) {
                console.warn('[Worker] Reset from error state failed. Falling back to forced re-download.', err);
                forceDownload = true;
            }
        } else if (String(model.status).toLowerCase() !== 'downloaded' && String(model.status).toLowerCase() !== 'loaded') {
            forceDownload = true;
        }

        if (forceDownload) {
            // Normal download flow
            self.postMessage({ type: 'status', value: 'initializing' });

            try {
                const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
                    if (evt.modelId === modelId) {
                        self.postMessage({ type: 'progress', value: evt.progress ?? 0 });
                    }
                });

                await ModelManager.downloadModel(modelId);
                unsub();
                self.postMessage({ type: 'progress', value: 1 });
            } catch (err: any) {
                throw new Error(`Model download failed: ${err.message || String(err)}. If this persists, click "Clear Cache & Retry".`);
            }
        }

        // Step 5: Unload any existing models first (clean slate)
        try {
            const loadedModel = ModelManager.getLoadedModel(ModelCategory.Language);
            if (loadedModel) {
                console.log('[Worker] Unloading existing model before reload:', loadedModel.id);
                ModelManager.unloadModel(loadedModel.id);
                // Give it a moment to fully unload
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (err: any) {
            console.warn('[Worker] Error unloading existing model (continuing anyway):', err);
        }

        // Step 6: Load model into memory with retry logic
        self.postMessage({ type: 'status', value: 'loading_model' });
        
        let loadAttempts = 0;
        const maxLoadAttempts = 3;
        let lastError: Error | null = null;

        while (loadAttempts < maxLoadAttempts) {
            try {
                loadAttempts++;
                
                // Check model status before loading
                const currentModel = ModelManager.getModels().find((m: any) => m.id === modelId);
                if (!currentModel) {
                    throw new Error(`Model ${modelId} not found in catalog`);
                }

                const currentStatus = String(currentModel.status).toLowerCase();

                if (currentStatus === 'loaded') {
                    console.log('[Worker] Model already loaded, skipping');
                    break;
                }

                // Handle error state - should have been reset in Step 4, but check again
                if (currentStatus === 'error') {
                    if (loadAttempts === 1) {
                        // First attempt - try to reset by re-registering
                        console.log('[Worker] Model still in error state, attempting reset...');
                        RunAnywhere.registerModels([
                            {
                                id: 'lfm2-350m-q4_k_m',
                                name: 'LFM2 350M Q4_K_M',
                                repo: 'LiquidAI/LFM2-350M-GGUF',
                                files: ['LFM2-350M-Q4_K_M.gguf'],
                                framework: LLMFramework.LlamaCpp,
                                modality: ModelCategory.Language,
                                memoryRequirement: 250_000_000,
                            } as any,
                        ]);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue; // Retry with fresh model state
                    } else {
                        // Secondary recovery path: force re-download and retry once more.
                        self.postMessage({ type: 'status', value: 'initializing' });
                        const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
                            if (evt.modelId === currentModel.id) {
                                self.postMessage({ type: 'progress', value: evt.progress ?? 0 });
                            }
                        });
                        try {
                            await ModelManager.downloadModel(currentModel.id);
                            self.postMessage({ type: 'progress', value: 1 });
                            await new Promise(resolve => setTimeout(resolve, 500));
                            continue;
                        } finally {
                            unsub();
                        }
                    }
                }

                if (currentStatus !== 'downloaded' && currentStatus !== 'loaded') {
                    // Recover from transient "registered"/"downloading" states by forcing a download.
                    if (currentStatus === 'registered' || currentStatus === 'downloading') {
                        self.postMessage({ type: 'status', value: 'initializing' });
                        const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
                            if (evt.modelId === currentModel.id) {
                                self.postMessage({ type: 'progress', value: evt.progress ?? 0 });
                            }
                        });
                        try {
                            await ModelManager.downloadModel(currentModel.id);
                            self.postMessage({ type: 'progress', value: 1 });
                            continue;
                        } finally {
                            unsub();
                        }
                    }

                    // If another internal flow started loading, briefly wait and retry.
                    if (currentStatus === 'loading') {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }

                    throw new Error(`Model status is "${currentStatus}", expected "downloaded" or "loaded". Try refreshing the page.`);
                }

                // Attempt to load
                const ok = await ModelManager.loadModel(modelId, { coexist: false });
                
                if (ok) {
                    // Verify it's actually loaded
                    const verifyLoaded = ModelManager.getLoadedModel(ModelCategory.Language);
                    if (verifyLoaded && verifyLoaded.id === modelId) {
                        console.log('[Worker] Model loaded successfully');
                        return; // Success!
                    } else {
                        throw new Error('Model reported loaded but verification failed');
                    }
                } else {
                    // Load returned false - might be memory issue or corrupted file
                    if (loadAttempts < maxLoadAttempts) {
                        console.warn(`[Worker] Load attempt ${loadAttempts} failed, retrying...`);
                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, 1000 * loadAttempts));
                        // Try unloading again before retry
                        try {
                            const loaded = ModelManager.getLoadedModel(ModelCategory.Language);
                            if (loaded) ModelManager.unloadModel(loaded.id);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } catch {}
                        continue;
                    } else {
                        throw new Error(`Model loading failed after ${maxLoadAttempts} attempts. Possible causes: insufficient memory (need ~250MB free), corrupted model file, or browser limitations. Try closing other tabs/apps and refresh the page.`);
                    }
                }
            } catch (err: any) {
                lastError = err;
                if (loadAttempts < maxLoadAttempts && !err.message?.includes('not found') && !err.message?.includes('status is')) {
                    console.warn(`[Worker] Load attempt ${loadAttempts} error:`, err);
                    await new Promise(resolve => setTimeout(resolve, 1000 * loadAttempts));
                    continue;
                } else {
                    throw err;
                }
            }
        }

        if (lastError) {
            throw lastError;
        }
    } catch (err: any) {
        // Re-throw with enhanced context
        const message = err.message || String(err);
        throw new Error(message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run a single LLM call — returns accumulated text output
// Streams tokens directly to UI (they ARE code now, not JSON)
// ─────────────────────────────────────────────────────────────────────────────
async function runLLMCall(prompt: string): Promise<string> {
    let output = '';

    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timed out after 120s')), 120_000)
    );

    const inferencePromise = async () => {
        const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(prompt, {
            maxTokens: 1024,
            temperature: 0.2,
            topP: 0.9,
        });
        cancelCurrent = cancel;

        let tokenCount = 0;
        let firstTokenSent = false;

        for await (const token of stream) {
            output += token;
            tokenCount++;

            // Signal first token — UI knows LLM is generating
            if (!firstTokenSent) {
                firstTokenSent = true;
                self.postMessage({ type: 'stream_active' });
            }

            // Stream tokens directly — they ARE code (no JSON to filter)
            self.postMessage({ type: 'chunk', value: token });

            // Yield every ~15 tokens to keep worker responsive
            if (tokenCount % 15 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        await resultPromise;
        cancelCurrent = null;
    };

    await Promise.race([inferencePromise(), timeoutPromise]);
    return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message handler
// ─────────────────────────────────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent<any>) => {
    const msg = e.data;

    // ── INIT ─────────────────────────────────────────────────────────────────
    if (msg.type === 'INIT') {
        if (modelLoaded) {
            self.postMessage({ type: 'READY' });
            return;
        }
        try {
            self.postMessage({ type: 'status', value: 'initializing' });
            await workerInitSDK();
            modelLoaded = true;
            self.postMessage({ type: 'READY' });
        } catch (err: any) {
            console.error('[Worker INIT Error]', err);
            self.postMessage({ type: 'init-error', value: err.message || String(err) });
        }
        return;
    }

    // ── START_OPTIMIZATION ───────────────────────────────────────────────────
    if (msg.type === 'START_OPTIMIZATION') {
        if (!modelLoaded) {
            self.postMessage({ type: 'error', value: 'Model is still loading. Please wait for the AI to be ready.' });
            return;
        }

        const { code, language, focus } = msg.payload as {
            code: string;
            language: string;
            focus: OptimizationFocus;
        };

        try {
            // ═══════════════════════════════════════════════════════════════════
            // STAGE 1 — "Understanding Code"
            // Real work: static analysis + prompt construction
            // ═══════════════════════════════════════════════════════════════════
            self.postMessage({ type: 'stage', value: 'Understanding Code' });

            const analysis = analyzeCode(code, language);
            self.postMessage({ type: 'analysis', value: analysis });

            // Determine input: single call for small code, chunks for large
            const useChunking = code.length >= CHUNK_THRESHOLD && analysis.chunks.length > 1;
            const codeBlocks = useChunking ? analysis.chunks : [code];

            // Build prompts
            const prompts = codeBlocks.map(block => {
                const { systemPrompt, userPrompt } = buildStructuredPrompt(block, analysis, focus);
                return `${systemPrompt}\n\n${userPrompt}`;
            });

            // ═══════════════════════════════════════════════════════════════════
            // STAGE 2 — "Optimizing"
            // Real work: LLM inference
            // Tokens ARE code — streamed directly as live preview
            // ═══════════════════════════════════════════════════════════════════
            self.postMessage({ type: 'stage', value: 'Optimizing' });

            // Sub-stage rotation
            let subStageIdx = 0;
            self.postMessage({ type: 'substage', value: LLM_SUB_STAGES[0] });
            const subStageInterval = setInterval(() => {
                subStageIdx = (subStageIdx + 1) % LLM_SUB_STAGES.length;
                self.postMessage({ type: 'substage', value: LLM_SUB_STAGES[subStageIdx] });
            }, 1500);

            let combinedOutput = '';

            try {
                for (let i = 0; i < codeBlocks.length; i++) {
                    if (i > 0) {
                        self.postMessage({ type: 'stage', value: 'Refining Optimization' });
                        await new Promise(r => setTimeout(r, 0)); // yield between chunks
                    }

                    if (codeBlocks.length > 1) {
                        self.postMessage({
                            type: 'chunk_progress',
                            value: { current: i + 1, total: codeBlocks.length }
                        });
                    }

                    const chunkOutput = await runLLMCall(prompts[i]);
                    combinedOutput += chunkOutput;
                }
            } finally {
                clearInterval(subStageInterval);
                self.postMessage({ type: 'stream_idle' });
            }

            // ═══════════════════════════════════════════════════════════════════
            // STAGE 3 — "Finalizing Output"
            // Real work: code extraction + normalization
            // ═══════════════════════════════════════════════════════════════════
            self.postMessage({ type: 'stage', value: 'Finalizing Output' });

            let parsed = normalizeLLMOutput(combinedOutput, code, analysis, language);

            // ═══════════════════════════════════════════════════════════════════
            // RETRY: If output is unchanged, try ONCE more with stronger prompt
            // ═══════════════════════════════════════════════════════════════════
            if (parsed._no_change && analysis.detected_patterns.length > 0) {
                console.log('[OPTIMA] Output unchanged with detected issues — retrying with stronger prompt');

                self.postMessage({ type: 'stage', value: 'Optimizing' });
                self.postMessage({ type: 'substage', value: 'Retrying with stronger instructions...' });

                // Clear streamed code for retry
                self.postMessage({ type: 'retry_clear' });

                const { systemPrompt, userPrompt } = buildStructuredPrompt(code, analysis, focus, true);
                const retryPrompt = `${systemPrompt}\n\n${userPrompt}`;

                const retrySubStageInterval = setInterval(() => {
                    subStageIdx = (subStageIdx + 1) % LLM_SUB_STAGES.length;
                    self.postMessage({ type: 'substage', value: LLM_SUB_STAGES[subStageIdx] });
                }, 1500);

                let retryOutput: string;
                try {
                    retryOutput = await runLLMCall(retryPrompt);
                } finally {
                    clearInterval(retrySubStageInterval);
                    self.postMessage({ type: 'stream_idle' });
                }

                self.postMessage({ type: 'stage', value: 'Finalizing Output' });

                const retryParsed = normalizeLLMOutput(retryOutput, code, analysis, language);

                // Use retry result if it actually changed, otherwise keep original
                if (!retryParsed._no_change) {
                    parsed = retryParsed;
                    parsed._parse_warning = 'Required retry — initial attempt returned unchanged code';
                }
            }

            // Final result — replaces streamed preview
            self.postMessage({ type: 'done', value: parsed });

        } catch (err: any) {
            cancelCurrent = null;
            const errMsg = err.message || String(err);
            console.error('[OPTIMA] Pipeline error:', errMsg);

            self.postMessage({
                type: 'done',
                value: {
                    algorithm: 'Custom Logic',
                    complexity_before: 'Unknown',
                    complexity_after: 'Unknown',
                    bottleneck: 'None detected',
                    strategy: 'Fallback',
                    optimization_strategy: 'Fallback',
                    tradeoffs: 'None',
                    estimated_improvement: 'No measurable improvement',
                    confidence: 0,
                    explanation: `Optimization unavailable — safe fallback used. ${errMsg}`,
                    optimized_code: code,
                    _parsed: false,
                    _no_change: true,
                    _parse_warning: 'Optimization unavailable — safe fallback used',
                },
            });
        }

        return;
    }

    // ── CANCEL_OPTIMIZATION ──────────────────────────────────────────────────
    if (msg.type === 'CANCEL_OPTIMIZATION') {
        if (cancelCurrent) {
            cancelCurrent();
            cancelCurrent = null;
        }
    }
};
