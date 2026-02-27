import { analyzeCode } from '../lib/staticAnalyzer';
import { buildPrompt, buildPromptFast, normalizeLLMOutput } from '../lib/promptBuilder';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import type { OptimizationFocus } from '../lib/promptBuilder';

const INFERENCE_TIMEOUT_MS = 90_000;          // 90s for CPU inference
const TEMPERATURE = 0.05;                      // Low temp = consistent, focused output
const MAX_INPUT_LINES = 80;                    // Avoid chunking sort combos

/** Scale token budget to code size — prevents model rambling on tiny inputs */
function getMaxTokens(lineCount: number): number {
    if (lineCount <= 15)  return 300;   // tiny: simple function, return fast
    if (lineCount <= 40)  return 600;   // medium: one class or algorithm
    if (lineCount <= 80)  return 900;   // large: full module
    return 1200;                         // very large: chunked code
}

/** Fast mode uses a much smaller token budget to reduce latency */
function getMaxTokensFast(lineCount: number): number {
    if (lineCount <= 15)  return 150;
    if (lineCount <= 40)  return 300;
    if (lineCount <= 80)  return 500;
    return 600;
}

let modelLoaded = false;
let modelInitializing = false;
let cancelCurrent: (() => void) | null = null;

class InferenceTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`LLM timed out after ${Math.round(timeoutMs / 1000)}s`);
        this.name = 'InferenceTimeoutError';
    }
}

async function workerInitSDK(requestedModelId: string | null) {
    const {
        RunAnywhere,
        SDKEnvironment,
        ModelManager,
        ModelCategory,
        LLMFramework,
        EventBus,
    } = await import('@runanywhere/web');

    const { LlamaCPP } = await import('@runanywhere/web-llamacpp');

    // ── Attach GPU listener BEFORE register() to avoid race condition.
    // The llamacpp.wasmLoaded event can fire synchronously during register,
    // so any listener attached after is too late.
    let gpuMode = 'cpu';
    const gpuDetected = new Promise<string>((resolve) => {
        const unsub = EventBus.shared.on('llamacpp.wasmLoaded', (evt: any) => {
            gpuMode = evt.accelerationMode ?? 'cpu';
            unsub();
            resolve(gpuMode);
        });
        // Fallback: if event never fires, assume CPU after 3s
        setTimeout(() => resolve('cpu'), 3000);
    });

    await RunAnywhere.initialize({ environment: SDKEnvironment.Production, debug: false });
    await LlamaCPP.register();

    // Wait for GPU detection (resolves immediately if already fired)
    const accelerationMode = await gpuDetected;
    self.postMessage({ type: 'accelerationMode', value: accelerationMode });

    RunAnywhere.registerModels([
        {
            id: 'qwen2.5-0.5b-instruct-q4_0',
            name: 'Qwen2.5 0.5B Instruct Q4_0',
            repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
            files: ['qwen2.5-0.5b-instruct-q4_0.gguf'],
            framework: LLMFramework.LlamaCpp,
            modality: ModelCategory.Language,
            memoryRequirement: 350_000_000,
        },
        {
            id: 'qwen2.5-1.5b-instruct-q4_0',
            name: 'Qwen2.5 1.5B Instruct Q4_0',
            repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
            files: ['qwen2.5-1.5b-instruct-q4_0.gguf'],
            framework: LLMFramework.LlamaCpp,
            modality: ModelCategory.Language,
            memoryRequirement: 900_000_000,
        },
        {
            id: 'qwen2.5-3b-instruct-q4_0',
            name: 'Qwen2.5 3B Instruct Q4_0',
            repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
            files: ['qwen2.5-3b-instruct-q4_0.gguf'],
            framework: LLMFramework.LlamaCpp,
            modality: ModelCategory.Language,
            memoryRequirement: 1_800_000_000,
        },
    ]);

    const models = ModelManager.getModels();
    const model = requestedModelId
        ? models.find((m: any) => m.id === requestedModelId)
        : null;

    if (!model) {
        throw new Error('No model selected. Please pick a model to download and load.');
    }

    self.postMessage({ type: 'model_selected', value: { id: model.id, name: model.name } });

    const status = String(model.status).toLowerCase();
    const isCached = status === 'downloaded' || status === 'loaded';

    // Tell the UI immediately whether this is a cold start or warm start.
    // UI uses this to show "Downloading model..." vs "Restoring from cache..."
    self.postMessage({ type: 'cached', value: isCached });

    const downloadIfNeeded = async (m: any) => {
        const st = String(m.status).toLowerCase();
        const cached = st === 'downloaded' || st === 'loaded';

        self.postMessage({ type: 'cached', value: cached });

        if (cached) {
            self.postMessage({ type: 'progress', value: 1 });
            return;
        }

        self.postMessage({ type: 'status', value: 'initializing' });
        const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
            if (evt.modelId === m.id) {
                self.postMessage({ type: 'progress', value: evt.progress ?? 0 });

                const loadedBytes =
                    evt.loadedBytes ?? evt.downloadedBytes ?? evt.receivedBytes ?? evt.bytesDownloaded;
                const totalBytes =
                    evt.totalBytes ?? evt.sizeBytes ?? evt.bytesTotal ?? evt.totalSize;

                if (typeof loadedBytes === 'number' || typeof totalBytes === 'number') {
                    self.postMessage({
                        type: 'download_bytes',
                        value: {
                            loadedBytes: typeof loadedBytes === 'number' ? loadedBytes : null,
                            totalBytes: typeof totalBytes === 'number' ? totalBytes : null,
                        },
                    });
                }
            }
        });

        try {
            await ModelManager.downloadModel(m.id);
            self.postMessage({ type: 'progress', value: 1 });
        } catch (err: any) {
            const currentStatus = String(
                ModelManager.getModels().find((x: any) => x.id === m.id)?.status || ''
            ).toLowerCase();
            if (currentStatus === 'downloaded' || currentStatus === 'loaded') {
                self.postMessage({ type: 'progress', value: 1 });
            } else {
                throw err;
            }
        } finally {
            unsub();
        }
    };

    await downloadIfNeeded(model);

    // ── Load weights into memory (always required, even on warm start)
    self.postMessage({ type: 'status', value: 'loading_model' });

    const loadedModel = ModelManager.getLoadedModel(ModelCategory.Language);
    if (!loadedModel || loadedModel.id !== model.id) {
        if (loadedModel) {
            ModelManager.unloadModel(loadedModel.id);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        const ok = await ModelManager.loadModel(model.id, { coexist: false });
        if (!ok) throw new Error('Model loading failed');
    }
}

// Fix 3: accept originalCode + language so retries can rebuild a meaningful prompt
async function runLLMCall(
    prompt: string,
    originalCode: string = '',
    language: string = '',
    retryCount: number = 0,
    maxTokens: number = 600,
    fastMode: boolean = false,
): Promise<string> {
    let output = '';
    let firstTokenSent = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let firstTokenWatchdog: ReturnType<typeof setTimeout> | null = null;
    let localCancel: (() => void) | null = null;

    try {
        const { stream, result, cancel } = await TextGeneration.generateStream(prompt, {
            max_new_tokens: maxTokens,
            temperature: TEMPERATURE,
        } as any);

        localCancel = cancel;
        cancelCurrent = cancel;

        // Mark as streaming immediately (prefill can be slow before first token).
        try {
            self.postMessage({ type: 'stream_active' });
        } catch {
            // no-op
        }

        // If the model takes a long time to produce the first token, show a more accurate substage.
        firstTokenWatchdog = setTimeout(() => {
            if (!firstTokenSent) {
                try {
                    self.postMessage({ type: 'substage', value: 'Generating (waiting for first token)…' });
                } catch {
                    // no-op
                }
            }
        }, 7000);

        const streamTask = (async () => {
            let liveBuffer = '';
            let lastFlush = 0;
            const FLUSH_INTERVAL_MS = 50;
            const FLUSH_MIN_CHARS = 120;

            const flush = () => {
                if (!liveBuffer) return;
                try {
                    self.postMessage({ type: 'chunk', value: liveBuffer });
                } catch {
                    // no-op
                }
                liveBuffer = '';
                lastFlush = Date.now();
            };

            for await (const token of stream) {
                output += token;

                if (!firstTokenSent) {
                    firstTokenSent = true;
                    if (firstTokenWatchdog) {
                        clearTimeout(firstTokenWatchdog);
                        firstTokenWatchdog = null;
                    }
                    lastFlush = Date.now();
                }

                liveBuffer += token;
                const now = Date.now();
                if (liveBuffer.length >= FLUSH_MIN_CHARS || now - lastFlush >= FLUSH_INTERVAL_MS) {
                    flush();
                }
            }

            flush();
        })();

        await Promise.race([
            Promise.all([streamTask, result]),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    try {
                        cancel();
                    } catch {
                        // no-op
                    }
                    reject(new InferenceTimeoutError(INFERENCE_TIMEOUT_MS));
                }, INFERENCE_TIMEOUT_MS);
            }),
        ]);
    } finally {
        try {
            self.postMessage({ type: 'stream_idle' });
        } catch {
            // no-op
        }
        if (firstTokenWatchdog) clearTimeout(firstTokenWatchdog);
        if (timeoutId) clearTimeout(timeoutId);
        if (localCancel) {
            try {
                localCancel();
            } catch {
                // no-op
            }
        }
        cancelCurrent = null;
    }

    if (!output.trim()) {
        // Fix 3: retries use the actual original code, not slices of the prompt string
        if (retryCount === 0) {
            const lang = language || 'code';
            const fence = lang.toLowerCase();
            const simplePrompt =
                `Optimize this ${lang} code and return the complete result in a fenced code block:\n` +
                `\`\`\`${fence}\n${originalCode}\n\`\`\`\nOutput:`;
            self.postMessage({ type: 'retry_clear' });
            return runLLMCall(simplePrompt, originalCode, language, 1, maxTokens, fastMode);
        } else if (retryCount === 1) {
            const lang = language || 'code';
            const fence = lang.toLowerCase();
            const verySimplePrompt =
                `Return ONLY the optimized ${lang} code below in a fenced code block. ` +
                `Do not explain. Do not cut off.\n` +
                `\`\`\`${fence}\n${originalCode}\n\`\`\`\nOutput:`;
            self.postMessage({ type: 'retry_clear' });
            return runLLMCall(verySimplePrompt, originalCode, language, 2, maxTokens, fastMode);
        }
        throw new Error('Model returned empty output after retries');
    }

    // Fix 8: tighten -> check so Python type hints don't trigger a false retry
    const isIncomplete =
        output.endsWith('...') ||
        output.endsWith('..') ||
        output.endsWith(' -> ') ||          // dangling arrow only (space on both sides)
        (output.endsWith('{') && !output.includes('}')) ||
        (output.endsWith('(') && !output.includes(')')) ||
        output.match(/\b(if|for|while|function|class|def)\s*$/i) ||
        output.match(/(\{|\\|\/\*)\s*$/);

    // In fast mode, avoid most retries to keep speed
    const maxRetries = fastMode ? 0 : 2;
    if (isIncomplete && retryCount < maxRetries) {
        const completePrompt = prompt + '\n\nIMPORTANT: Return the COMPLETE optimized code, do not cut off mid-sentence.';
        self.postMessage({ type: 'retry_clear' });
        return runLLMCall(completePrompt, originalCode, language, retryCount + 1, maxTokens, fastMode);
    }

    return limitOutputToTokens(output, maxTokens);
}

function chunkCode(code: string): string[] {
    const lines = code.split('\n');
    if (lines.length <= MAX_INPUT_LINES) {
        return [code];
    }

    const chunks: string[] = [];
    const chunkSize = Math.floor(MAX_INPUT_LINES * 0.7); // More conservative chunking
    
    // Find logical break points (function boundaries, class definitions, etc.)
    for (let i = 0; i < lines.length; i += chunkSize) {
        let endIdx = Math.min(i + chunkSize, lines.length);
        
        // Try to break at logical boundaries
        if (endIdx < lines.length) {
            // Look for function/class/end-of-block boundaries within reasonable range
            const searchRange = Math.min(10, endIdx - i);
            for (let j = 0; j < searchRange; j++) {
                const line = lines[endIdx - j - 1].trim();
                if (line.match(/^(function|class|def|}|\/\/|\/\*|#)/) || 
                    line.endsWith('}') || line.endsWith('*/')) {
                    endIdx = endIdx - j;
                    break;
                }
            }
        }
        
        const chunk = lines.slice(i, endIdx).join('\n');
        chunks.push(chunk);
        
        // Add context overlap between chunks
        if (endIdx < lines.length && chunks.length > 0) {
            const overlapLines = lines.slice(Math.max(0, endIdx - 3), endIdx);
            if (overlapLines.length > 0) {
                chunks[chunks.length - 1] += '\n// Context for next chunk:\n' + overlapLines.join('\n');
            }
        }
    }
    
    return chunks;
}

async function optimizeChunk(chunk: string, language: string, focus: OptimizationFocus, fastMode: boolean = false): Promise<string> {
    const analysis = analyzeCode(chunk, language);
    const prompt = fastMode ? buildPromptFast(chunk, language, focus) : buildPrompt(chunk, language, focus, analysis);
    
    self.postMessage({ type: 'substage', value: `Optimizing chunk...` });
    const maxTokens = fastMode ? getMaxTokensFast(chunk.split('\n').length) : getMaxTokens(chunk.split('\n').length);
    const modelOutput = await runLLMCall(prompt, chunk, language, 0, maxTokens, fastMode);
    
    const parsed = normalizeLLMOutput(modelOutput, chunk, analysis, language);

    // Only fall back to original if parsing genuinely failed (truncation,
    // missing named functions/imports, etc). A _parse_warning alone just means
    // a minor bracket repair was applied — the code is still usable.
    if (!parsed._parsed) {
        self.postMessage({ type: 'substage', value: `Using original chunk (could not validate output)` });
        return chunk;
    }

    return parsed.optimized_code;
}

function limitOutputToTokens(text: string, maxTokens: number): string {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= maxTokens) return text.trim();
    return tokens.slice(0, maxTokens).join(' ');
}

self.onmessage = async (e: MessageEvent<any>) => {
    const msg = e.data;

    if (msg.type === 'INIT') {
        if (modelLoaded) {
            self.postMessage({ type: 'READY' });
            return;
        }

        if (modelInitializing) {
            // Already initializing, don't start again
            return;
        }

        try {
            modelInitializing = true;
            self.postMessage({ type: 'status', value: 'initializing' });
            const requestedModelId: string | null = msg?.payload?.modelId ?? null;
            await workerInitSDK(requestedModelId);
            modelLoaded = true;
            modelInitializing = false;
            self.postMessage({ type: 'READY' });
        } catch (err: any) {
            modelInitializing = false;
            self.postMessage({ type: 'init-error', value: err?.message || String(err) });
        }
        return;
    }

    if (msg.type === 'START_OPTIMIZATION') {
        if (!modelLoaded) {
            self.postMessage({ type: 'error', value: 'Model is still loading. Please wait for the AI to be ready.' });
            return;
        }

        const { code, language, focus, fastMode = false } = msg.payload as {
            code: string;
            language: string;
            focus: OptimizationFocus;
            fastMode?: boolean;
        };

        try {
            self.postMessage({ type: 'stage', value: 'Understanding Code' });
            const analysis = analyzeCode(code, language);
            self.postMessage({ type: 'analysis', value: analysis });

            // Check if code needs chunking
            const chunks = chunkCode(code);
            let optimizedCode = code;

            if (chunks.length > 1) {
                self.postMessage({ type: 'stage', value: 'Refining Optimization' });
                self.postMessage({ type: 'chunk_progress', value: { current: 0, total: chunks.length } });
                
                const optimizedChunks: string[] = [];
                for (let i = 0; i < chunks.length; i++) {
                    self.postMessage({ type: 'chunk_progress', value: { current: i + 1, total: chunks.length } });
                    const optimizedChunk = await optimizeChunk(chunks[i], language, focus, fastMode);
                    optimizedChunks.push(optimizedChunk);
                }
                
                optimizedCode = optimizedChunks.join('\n');
            } else {
                // ── Single-chunk path ──────────────────────────────────────
                const fullPrompt = fastMode ? buildPromptFast(code, language, focus) : buildPrompt(code, language, focus, analysis);
                self.postMessage({ type: 'stage', value: 'Optimizing' });
                const maxTokens = fastMode ? getMaxTokensFast(code.split('\n').length) : getMaxTokens(code.split('\n').length);
                const modelOutput = await runLLMCall(fullPrompt, code, language, 0, maxTokens, fastMode);
                self.postMessage({ type: 'stream_idle' });

                self.postMessage({ type: 'stage', value: 'Finalizing Output' });
                const parsed = normalizeLLMOutput(modelOutput, code, analysis, language);

                // Always send 'done' — never throw on a fallback result.
                // parsed._no_change + parsed._parse_warning tells the UI it
                // was a safe fallback (original preserved), not a crash.
                self.postMessage({ type: 'done', value: parsed });
                return;
            }

            // ── Multi-chunk path ───────────────────────────────────────────
            // Build result directly from the reassembled code. Do NOT call
            // normalizeLLMOutput(optimizedCode, code) here — that would compare
            // the already-optimized output against itself as the "original"
            // and almost always produce a wrong no-change / validation failure.
            const finalAnalysis = analyzeCode(optimizedCode, language);
            self.postMessage({
                type: 'done',
                value: {
                    algorithm:               finalAnalysis.detected_algorithm || 'Custom Logic',
                    complexity_before:       analysis.estimated_complexity || 'Unknown',
                    complexity_after:        finalAnalysis.estimated_complexity || 'Unknown',
                    bottleneck:              finalAnalysis.detected_patterns[0]?.description || 'None detected',
                    strategy:                'Multi-chunk optimization applied',
                    optimization_strategy:   'Multi-chunk optimization applied',
                    tradeoffs:               'None',
                    estimated_improvement:   'Optimized across ' + chunks.length + ' chunks',
                    confidence:              Math.round(finalAnalysis.confidence_score * 100),
                    explanation:             'Code was split into ' + chunks.length + ' chunks and each was optimized independently.',
                    optimized_code:          optimizedCode,
                    detected_patterns:       finalAnalysis.detected_patterns,
                    possible_optimizations:  finalAnalysis.possible_optimizations,
                    static_confidence_score: finalAnalysis.confidence_score,
                    _parsed:                 true,
                    _no_change:              optimizedCode === code,
                },
            });
        } catch (err: any) {
            cancelCurrent = null;
            const errMsg = err?.message || String(err);
            const isTimeout = err instanceof InferenceTimeoutError || /timed out/i.test(errMsg);
            self.postMessage({
                type: 'error',
                value: isTimeout
                    ? `Optimization timed out after ${Math.round(INFERENCE_TIMEOUT_MS / 1000)}s. Try smaller input.`
                    : `Optimization failed: ${errMsg}`,
            });
        }

        return;
    }

    if (msg.type === 'CANCEL_OPTIMIZATION') {
        if (cancelCurrent) {
            cancelCurrent();
            cancelCurrent = null;
        }
    }
};