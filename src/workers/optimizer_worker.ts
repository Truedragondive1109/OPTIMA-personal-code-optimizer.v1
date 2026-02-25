import { analyzeCode } from '../lib/staticAnalyzer';
import { buildPrompt, normalizeLLMOutput } from '../lib/promptBuilder';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import type { OptimizationFocus } from '../lib/promptBuilder';

const INFERENCE_TIMEOUT_MS = 90_000;          // Fix 2: 90s for CPU inference
const MAX_NEW_TOKENS = 1200;                   // Fix 1: room for full sort algos
const TEMPERATURE = 0.05;                      // Lower for more consistent output
const MAX_INPUT_LINES = 80;                    // Fix 7: avoid chunking sort combos

let modelLoaded = false;
let modelInitializing = false;
let cancelCurrent: (() => void) | null = null;

class InferenceTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`LLM timed out after ${Math.round(timeoutMs / 1000)}s`);
        this.name = 'InferenceTimeoutError';
    }
}

async function workerInitSDK() {
    const {
        RunAnywhere,
        SDKEnvironment,
        ModelManager,
        ModelCategory,
        LLMFramework,
        EventBus,
    } = await import('@runanywhere/web');

    const { LlamaCPP } = await import('@runanywhere/web-llamacpp');

    await RunAnywhere.initialize({ environment: SDKEnvironment.Development, debug: false });
    await LlamaCPP.register();

    EventBus.shared.on('llamacpp.wasmLoaded', (evt: any) => {
        self.postMessage({ type: 'accelerationMode', value: evt.accelerationMode ?? 'cpu' });
    });

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
    ]);

    const model = ModelManager.getModels().find((m: any) => m.modality === ModelCategory.Language);
    if (!model) {
        throw new Error('No language model registered in worker');
    }

    const status = String(model.status).toLowerCase();
    if (status !== 'downloaded' && status !== 'loaded') {
        self.postMessage({ type: 'status', value: 'initializing' });
        const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
            if (evt.modelId === model.id) {
                self.postMessage({ type: 'progress', value: evt.progress ?? 0 });
            }
        });

        try {
            await ModelManager.downloadModel(model.id);
            self.postMessage({ type: 'progress', value: 1 });
        } catch (err: any) {
            // If download fails, check if it was already downloaded
            const models = ModelManager.getModels();
            const currentModel = models.find((m: any) => m.id === model.id);
            const currentStatus = String(currentModel?.status || '').toLowerCase();
            if (currentStatus === 'downloaded' || currentStatus === 'loaded') {
                self.postMessage({ type: 'progress', value: 1 });
            } else {
                throw err;
            }
        } finally {
            unsub();
        }
    }

    self.postMessage({ type: 'status', value: 'loading_model' });

    const loadedModel = ModelManager.getLoadedModel(ModelCategory.Language);
    if (!loadedModel || loadedModel.id !== model.id) {
        if (loadedModel) {
            ModelManager.unloadModel(loadedModel.id);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        const ok = await ModelManager.loadModel(model.id, { coexist: false });
        if (!ok) {
            throw new Error('Model loading failed');
        }
    }
}

// Fix 3: accept originalCode + language so retries can rebuild a meaningful prompt
async function runLLMCall(
    prompt: string,
    originalCode: string = '',
    language: string = '',
    retryCount: number = 0,
): Promise<string> {
    let output = '';
    let firstTokenSent = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let localCancel: (() => void) | null = null;

    try {
        const { stream, result, cancel } = await TextGeneration.generateStream(prompt, {
            max_new_tokens: MAX_NEW_TOKENS,
            temperature: TEMPERATURE,
        } as any);

        localCancel = cancel;
        cancelCurrent = cancel;

        const streamTask = (async () => {
            for await (const token of stream) {
                output += token;
                if (!firstTokenSent) {
                    firstTokenSent = true;
                    self.postMessage({ type: 'stream_active' });
                }
            }
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
            return runLLMCall(simplePrompt, originalCode, language, 1);
        } else if (retryCount === 1) {
            const lang = language || 'code';
            const fence = lang.toLowerCase();
            const verySimplePrompt =
                `Return ONLY the optimized ${lang} code below in a fenced code block. ` +
                `Do not explain. Do not cut off.\n` +
                `\`\`\`${fence}\n${originalCode}\n\`\`\`\nOutput:`;
            self.postMessage({ type: 'retry_clear' });
            return runLLMCall(verySimplePrompt, originalCode, language, 2);
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

    if (isIncomplete && retryCount < 2) {
        const completePrompt = prompt + '\n\nIMPORTANT: Return the COMPLETE optimized code, do not cut off mid-sentence.';
        self.postMessage({ type: 'retry_clear' });
        return runLLMCall(completePrompt, originalCode, language, retryCount + 1);
    }

    return limitOutputToTokens(output, MAX_NEW_TOKENS);
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

async function optimizeChunk(chunk: string, language: string, focus: OptimizationFocus): Promise<string> {
    const analysis = analyzeCode(chunk, language);
    const prompt = buildPrompt(chunk, language, focus, analysis);
    
    self.postMessage({ type: 'substage', value: `Optimizing chunk...` });
    const modelOutput = await runLLMCall(prompt, chunk, language);
    
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
            await workerInitSDK();
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

        const { code, language, focus } = msg.payload as {
            code: string;
            language: string;
            focus: OptimizationFocus;
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
                    const optimizedChunk = await optimizeChunk(chunks[i], language, focus);
                    optimizedChunks.push(optimizedChunk);
                }
                
                optimizedCode = optimizedChunks.join('\n');
            } else {
                // ── Single-chunk path ──────────────────────────────────────
                const fullPrompt = buildPrompt(code, language, focus, analysis);
                self.postMessage({ type: 'stage', value: 'Optimizing' });
                const modelOutput = await runLLMCall(fullPrompt, code, language);
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