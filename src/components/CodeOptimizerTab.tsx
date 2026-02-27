import { useState, useRef, useCallback, useEffect } from 'react';
import { useSDKState, globalWorker, initializeSDKWithModel } from '../hooks/useModelLoader';
import { ExplainPanel } from './ExplainPanel';
import { DiffViewer } from './DiffViewer';
import OverviewPanel from './OverviewPanel';
import { type OptimizationResult, type OptimizationFocus, isFullySupported } from '../lib/promptBuilder';

 type HistoryEntry = {
  id: string;
  createdAt: number;
  language: string;
  focus: OptimizationFocus;
  inputCode: string;
  result: OptimizationResult;
 };

 const HISTORY_STORAGE_KEY = 'code_optimizer_history_v1';
 const HISTORY_MAX_ENTRIES = 50;

 function safeLoadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryEntry[];
  } catch {
    return [];
  }
 }

 function safeSaveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
 }

 function addHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const current = safeLoadHistory();
  const next = [entry, ...current].slice(0, HISTORY_MAX_ENTRIES);
  safeSaveHistory(next);
  return next;
 }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++'
] as const;

const detectLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const m: Record<string, string> = {
    js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
    py: 'Python', java: 'Java', cpp: 'C++', cc: 'C++', cxx: 'C++',
  };
  return m[ext] || 'TypeScript';
};

// 100+ rotating processing messages
const LOADING_MESSAGES = [
  // Code understanding
  "Understanding your code structure...",
  "Parsing abstract syntax tree...",
  "Mapping call graph and dependencies...",
  "Tracing data flow across functions...",
  "Building internal representation...",
  "Reading your intent carefully...",
  "Understanding what your code does...",
  "Identifying code entry points...",
  // Pattern detection
  "Looking for inefficiencies...",
  "Detecting nested loop hazards...",
  "Scanning for O(n²) anti-patterns...",
  "Auditing memory allocation patterns...",
  "Identifying redundant computations...",
  "Counting branch misprediction risks...",
  "Estimating cache miss probability...",
  "Checking for duplicate logic...",
  "Looking for dead code...",
  "Searching for unnecessary allocations...",
  "Measuring algorithmic complexity...",
  "Detecting early exit opportunities...",
  // Optimization actions
  "Refactoring for performance...",
  "Rewriting hot paths for CPU cache efficiency...",
  "Collapsing O(n/8) to O(n/64)...",
  "Applying memoization where applicable...",
  "Replacing verbose loops with idiomatic patterns...",
  "Refactoring for zero-overhead abstractions...",
  "Inlining critical inner loops...",
  "Squeezing cycles out of tight loops...",
  "Vectorising data-parallel operations...",
  "Eliminating unnecessary heap allocations...",
  "Collapsing redundant passes into one...",
  "Selecting the optimal data structure...",
  "Converting O(n) search to O(1) lookup...",
  "Pruning unreachable branches...",
  "Short-circuiting early termination paths...",
  "Aligning struct fields for cache line packing...",
  "Unrolling small loops for pipeline efficiency...",
  "Hoisting invariant computations out of loops...",
  "Reducing function call overhead...",
  "Rearranging operations for better ILP...",
  "Profiling hot execution paths...",
  "Eliminating common subexpressions...",
  // Quality / correctness
  "Optimizing like it's production code...",
  "Compilers would approve this...",
  "Turning spaghetti into clean logic...",
  "Making it readable AND fast...",
  "Ensuring correctness first, speed second...",
  "Honoring the original algorithm's intent...",
  "Checking for subtle edge cases...",
  "Validating output against safety rules...",
  "Cross-checking complexity claims...",
  "Ensuring idiomatic style for this language...",
  "Confirming no behavior is changed...",
  // Humour / personality
  "Making your future self proud... 😌",
  "Did you know? Faster code = happier users.",
  "Consulting the ancient runtime profiling scrolls...",
  "Negotiating with the garbage collector...",
  "Feeding the compiler some carrots 🥕...",
  "Teaching the CPU new tricks...",
  "Untangling code spaghetti... 🍝",
  "Polishing the critical path to a mirror finish...",
  "Measuring twice, optimizing once...",
  "Whispering sweet nothings to the branch predictor...",
  "Compressing cognitive load byte by byte...",
  "Reasoning about asymptotic behaviour...",
  "Asking the model to behave nicely... 🙏",
  "Thinking hard so you don't have to...",
  "Running it through the mental compiler...",
  "Applying the principle of least surprise...",
  "Remembering Donald Knuth's warnings...",
  "Checking if we can cheat (we can't)...",
  "Turning O(n³) into something you won't be embarrassed by...",
  "Debating tabs vs spaces... just kidding.",
  "Double-checking the math...",
  "Making sure no kittens are harmed during this optimization...",
  "Being careful with C pointers... very careful...",
  "Respecting memory boundaries...",
  "Looking for the bottleneck you knew was there...",
  "Reading between the lines of your code...",
  "Building a better mousetrap...",
  "Applying algorithmic intuition...",
  "Make the code not just faster — smarter...",
  "On-device intelligence at work...",
  "Zero network calls. Zero data leaves your machine...",
  "Local AI doing its best...",
  "Crunching numbers entirely on your device...",
  "Crafting optimizations that actually matter...",
  "Ensuring the output is real, not theater...",
  "Being honest: sometimes the original is already great.",
  "Checking if anything actually needs changing...",
  "Applying engineering judgment, not just pattern matching...",
  "Giving it the full 100%...",
  "Finding the 20% effort that gives 80% improvement...",
  "Running a sanity check...",
];

type OutputTab = 'code' | 'diff' | 'explain' | 'overview';



// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Stage Display (inside output panel)
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_ORDER = ['Understanding Code', 'Optimizing', 'Refining Optimization', 'Finalizing Output'];

function PipelineStages({ current }: { current: string }) {
  return (
    <div className="pipeline-stages">
      {STAGE_ORDER.map((stage, i) => {
        const currentIdx = STAGE_ORDER.indexOf(current);
        const isDone = i < currentIdx;
        const isActive = stage === current;
        return (
          <div key={stage} className={`pipeline-stage ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
            <div className="stage-dot">
              {isDone ? '✓' : isActive ? <span className="stage-pulse" /> : '○'}
            </div>
            <span className="stage-label">{stage}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function CodeOptimizerTab() {
  const currentSdkState = useSDKState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastRunRef = useRef<{ code: string; language: string; focus: OptimizationFocus } | null>(null);

  const [codeInput, setCodeInput] = useState('');
  const [language, setLanguage] = useState<string>('TypeScript');
  const [focus, setFocus] = useState<OptimizationFocus>('all');
  const [optimizing, setOptimizing] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string>('idle');
  const [result, setResult] = useState<OptimizationResult | null>(null);

  // Streaming
  const [streamedCode, setStreamedCode] = useState('');
  const [isStreamingCode, setIsStreamingCode] = useState(false);
  const [showStreamingBox, setShowStreamingBox] = useState(true);
  const streamBufferRef = useRef('');
  const reqFrameRef = useRef<number | null>(null);

  const [originalForDiff, setOriginalForDiff] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outputTab, setOutputTab] = useState<OutputTab>('code');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Loading message rotation
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  // Sub-stage and chunk progress (real-time from worker)
  const [subStage, setSubStage] = useState('');
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null);
  const [streamActive, setStreamActive] = useState(false);



  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ code: string; language?: string }>).detail;
      if (!detail?.code) return;
      setCodeInput(detail.code);
      if (detail.language) setLanguage(detail.language);
      showToast('Loaded from history');
    };

    window.addEventListener('optimizer:load_code', handler as EventListener);
    return () => window.removeEventListener('optimizer:load_code', handler as EventListener);
  }, [showToast]);

  // ── Worker message handler ─────────────────────────────────────────────────
  useEffect(() => {
    const handleWorkerMessage = (e: MessageEvent<any>) => {
      const msg = e.data;
      if (msg.type === 'stage') {
        setPipelineStage(msg.value);
        setSubStage('');
        setChunkProgress(null);
      } else if (msg.type === 'substage') {
        setSubStage(msg.value);
      } else if (msg.type === 'chunk_progress') {
        setChunkProgress(msg.value);
      } else if (msg.type === 'stream_active') {
        setStreamActive(true);
        setShowStreamingBox(true);
      } else if (msg.type === 'stream_idle') {
        setStreamActive(false);
      } else if (msg.type === 'retry_clear') {
        // Worker is retrying — clear streamed preview for fresh output
        streamBufferRef.current = '';
        setStreamedCode('');
      } else if (msg.type === 'chunk') {
        streamBufferRef.current += msg.value;
      } else if (msg.type === 'done') {
        const parsed: OptimizationResult = msg.value;
        const lastRun = lastRunRef.current;
        if (lastRun) {
          const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: Date.now(),
            language: lastRun.language,
            focus: lastRun.focus,
            inputCode: lastRun.code,
            result: parsed,
          };
          addHistoryEntry(entry);
          window.dispatchEvent(new CustomEvent('optimizer:history_updated'));
        }
        streamBufferRef.current = '';
        setResult(parsed);
        setPipelineStage('done');
        setIsStreamingCode(false);
        setOptimizing(false);
        setSubStage('');
        setChunkProgress(null);
        setStreamActive(false);
        setShowStreamingBox(false);
        setOutputTab('explain');
        showToast('Optimization complete!');
      } else if (msg.type === 'error') {
        streamBufferRef.current = '';
        setError(msg.value);
        setOptimizing(false);
        setIsStreamingCode(false);
        setPipelineStage('idle');
        setSubStage('');
        setChunkProgress(null);
        setStreamActive(false);
        setShowStreamingBox(false);
      }
    };

    globalWorker.addEventListener('message', handleWorkerMessage);
    return () => {
      globalWorker.removeEventListener('message', handleWorkerMessage);
      if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
    };
  }, [showToast, language, focus]);

  // ── Loading message rotation — 10s interval, random pick ──────────────────
  useEffect(() => {
    if (!optimizing) return;

    const pick = () => {
      setLoadingMsgIdx(Math.floor(Math.random() * LOADING_MESSAGES.length));
    };
    pick(); // pick immediately
    const interval = setInterval(pick, 10_000);
    return () => clearInterval(interval);
  }, [optimizing]);

  // ── requestAnimationFrame streaming loop ───────────────────────────────────
  useEffect(() => {
    if (!isStreamingCode) {
      if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
      return;
    }

    const loop = () => {
      if (streamBufferRef.current.length > 0) {
        const str = streamBufferRef.current.slice(0, 60);
        streamBufferRef.current = streamBufferRef.current.slice(60);
        setStreamedCode(prev => prev + str);
      }
      reqFrameRef.current = requestAnimationFrame(loop);
    };

    reqFrameRef.current = requestAnimationFrame(loop);
    return () => { if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current); };
  }, [isStreamingCode]);



  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    globalWorker.postMessage({ type: 'CANCEL_OPTIMIZATION' });
    if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
    streamBufferRef.current = '';
    setOptimizing(false);
    setIsStreamingCode(false);
    setPipelineStage('idle');
    setStreamedCode('');
    setSubStage('');
    setChunkProgress(null);
    setStreamActive(false);
    setShowStreamingBox(false);
  }, []);

  const clearAll = useCallback(() => {
    if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
    streamBufferRef.current = '';
    setCodeInput('');
    setResult(null);
    setStreamedCode('');
    setIsStreamingCode(false);
    setError(null);
    setPipelineStage('idle');
  }, []);

  const optimize = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return setError('Please paste some code to optimize.');
    if (optimizing) return;

    if (currentSdkState.status !== 'ready') {
      return setError('Model not ready. Please wait for the AI to load.');
    }

    setOptimizing(true);
    setError(null);
    setResult(null);
    setStreamedCode('');
    setIsStreamingCode(true);
    setShowStreamingBox(true);
    setOriginalForDiff(code);
    lastRunRef.current = { code, language, focus };
    setOutputTab('code');

    globalWorker.postMessage({
      type: 'START_OPTIMIZATION',
      payload: { code, language, focus, fastMode }
    });
  }, [codeInput, optimizing, currentSdkState.status, language, focus, fastMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = navigator.platform.toUpperCase().includes('MAC') ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); if (!optimizing) optimize(); }
      if (mod && e.key === 'k') { e.preventDefault(); if (!optimizing) clearAll(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [optimize, clearAll, optimizing]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const outputCode = result ? result.optimized_code : '';
  const charCount = codeInput.length;
  const lineCount = codeInput.split('\n').length;

  const modelStatus = currentSdkState.status;
  const isModelLoading = modelStatus !== 'ready' && modelStatus !== 'error' && modelStatus !== 'idle';
  const isModelError = modelStatus === 'error';
  const isModelIdle = modelStatus === 'idle';
  const isModelReady = modelStatus === 'ready';

  const formatBytes = (n: number) => {
    const gb = 1024 ** 3;
    const mb = 1024 ** 2;
    if (n >= gb) return `${(n / gb).toFixed(2)} GB`;
    return `${Math.round(n / mb)} MB`;
  };

  const downloadLabel = (() => {
    const loaded = currentSdkState.downloadedBytes;
    const total = currentSdkState.totalBytes;
    if (typeof loaded === 'number' && typeof total === 'number' && total > 0) {
      return `Downloading ${formatBytes(loaded)} / ${formatBytes(total)}`;
    }
    if (typeof loaded === 'number') {
      return `Downloaded ${formatBytes(loaded)}`;
    }
    return null;
  })();

  const MODELS = [
    { id: 'qwen2.5-0.5b-instruct-q4_0', name: 'Qwen2.5 0.5B (Fast)' },
    { id: 'qwen2.5-1.5b-instruct-q4_0', name: 'Qwen2.5 1.5B (Balanced)' },
    { id: 'qwen2.5-3b-instruct-q4_0', name: 'Qwen2.5 3B (Best quality)' },
  ] as const;

  const isProcessing = optimizing || isStreamingCode;
  const isResult = !optimizing && !isStreamingCode && result !== null;

  // No-change: code is identical before and after
  const isNoChange = isResult && result !== null && result._no_change === true;

  // Performance improvement display logic
  const shouldShowImprovement = isResult && result !== null
    && !result._no_change
    && typeof result.confidence === 'number'
    && result.confidence >= 70;

  // ── Output panel copy / export ─────────────────────────────────────────────

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copied to clipboard!'))
      .catch(() => showToast('Failed to copy.'));
  };

  const exportToFile = (code: string) => {
    const extMap: Record<string, string> = {
      TypeScript: 'ts', JavaScript: 'js', Python: 'py', Java: 'java',
      'C++': 'cpp', 'C': 'c', Rust: 'rs', Go: 'go', 'C#': 'cs',
    };
    const ext = extMap[language] || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `optimized.${ext}`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('File exported!');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      setCodeInput(content);
      setLanguage(detectLanguageFromFilename(file.name));
      showToast(`Imported ${file.name}`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Language support label ─────────────────────────────────────────────────
  const langSupportLabel = () => {
    if (isFullySupported(language)) {
      return (
        <span title="Language-specific optimizations available" style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 8px',
          borderRadius: '99px', background: 'rgba(34,197,94,0.12)',
          color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)',
          marginLeft: '8px',
        }}>✓ Full support</span>
      );
    }
    return null; // All supported languages now, no warning needed
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="tab-panel optimizer-panel">
      {/* Toast */}
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}

      {/* Error */}
      {error && (
        <div className="optimizer-error" role="alert">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Controls */}
      <div className="optimizer-controls">
        <div className="control-group">
          <label className="control-label">Language</label>
          <select
            className="optimizer-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            disabled={optimizing}
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="control-group">
          <label className="control-label">Optimization Focus</label>
          <select
            className="optimizer-select"
            value={focus}
            onChange={e => setFocus(e.target.value as OptimizationFocus)}
            disabled={optimizing}
          >
            <option value="all">All Optimizations</option>
            <option value="performance">Performance</option>
            <option value="readability">Readability</option>
            <option value="security">Security</option>
            <option value="best-practices">Best Practices</option>
          </select>
        </div>

        <div className="code-length-indicator">
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            LOC: <strong style={{ color: 'var(--text)' }}>{lineCount}</strong> | Chars: <strong style={{ color: 'var(--text)' }}>{charCount.toLocaleString()}</strong>
          </span>
          {langSupportLabel()}
        </div>
      </div>

      {/* Workspace */}
      <div className="optimizer-workspace">
        {/* Input */}
        <div className="code-section">
          <div className="code-section-header">
            <h3>Input Code</h3>
            <div className="code-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.cc,.cxx,.c,.cs,.go,.rs,.php,.rb,.swift,.kt,.html,.htm,.css,.sql,.sh,.bash,.dart,.scala,.txt"
                onChange={handleFileImport}
                style={{ display: 'none' }}
              />
              <button className="btn btn-sm btn-import" onClick={() => fileInputRef.current?.click()} disabled={optimizing}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                Import
              </button>

              <button className="btn btn-sm" onClick={clearAll} disabled={optimizing}>Clear</button>
              <button className="btn btn-sm" onClick={() => copyToClipboard(codeInput)} disabled={!codeInput}>Copy</button>
            </div>
          </div>
          <textarea
            className="code-textarea"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            placeholder={`Paste your ${language} code here — any size supported...`}
            disabled={optimizing}
            spellCheck={false}
          />
        </div>

        {/* Output */}
        <div className="code-section output-section">
          <div className="code-section-header">
            {isResult && (
              <div className="output-tabs">
                <button
                  className={`output-tab ${outputTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setOutputTab('overview')}
                >Overview</button>
                <button
                  className={`output-tab ${outputTab === 'code' ? 'active' : ''}`}
                  onClick={() => setOutputTab('code')}
                  style={isNoChange ? { opacity: 0.5 } : {}}
                >Code</button>
                <button
                  className={`output-tab ${outputTab === 'diff' ? 'active' : ''}`}
                  onClick={() => setOutputTab('diff')}
                >Diff</button>
                <button
                  className={`output-tab ${outputTab === 'explain' ? 'active' : ''}`}
                  onClick={() => setOutputTab('explain')}
                >Explain</button>
              </div>
            )}

            {isResult && !isNoChange && (
              <div className="code-actions">
                <button className="btn btn-sm btn-primary" onClick={() => setCodeInput(outputCode)}>Use Optimized</button>
                <button className="btn btn-sm" onClick={() => copyToClipboard(outputCode)}>Copy</button>
                <button className="btn btn-sm" onClick={() => exportToFile(outputCode)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Export
                </button>
              </div>
            )}
          </div>

          <div className="code-output">

            {/* ─── MODEL LOADING STATE (inside output panel) ─── */}
            {(isModelLoading || isModelIdle) && !isProcessing && !isResult && (
              <div className="empty-state">
                {isModelIdle ? (
                  <div style={{ width: '100%', maxWidth: '520px', textAlign: 'center', margin: '0 auto' }}>
                    <h3 style={{ marginBottom: '6px' }}>Choose a model</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: '0 auto', fontSize: '13px', textAlign: 'center', maxWidth: '520px' }}>
                      Pick a Qwen model to download and load on-device. Nothing downloads until you select one.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginTop: '14px' }}>
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          className="btn"
                          style={{
                            textAlign: 'left',
                            padding: '12px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                          }}
                          onClick={() => initializeSDKWithModel({ id: m.id, name: m.name })}
                        >
                          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{m.id}</span>
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Download & Load</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="spinner" style={{ marginBottom: '1.5rem', width: '32px', height: '32px' }} />
                    <h3>
                      {currentSdkState.isCached ? 'Restoring model...' : 'Downloading model...'}
                      {currentSdkState.selectedModel?.name ? (
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginTop: '6px', color: 'var(--text-secondary)' }}>
                          {currentSdkState.selectedModel.name}
                        </span>
                      ) : null}
                    </h3>
                    {/* Progress bar — only meaningful during first download */}
                    {!currentSdkState.isCached && currentSdkState.progress > 0 && currentSdkState.progress < 1 && (
                      <div style={{ width: '200px', margin: '12px auto', height: '4px', borderRadius: '2px', background: 'var(--border)' }}>
                        <div style={{
                          height: '100%', borderRadius: '2px',
                          background: 'var(--accent)',
                          width: `${Math.round(currentSdkState.progress * 100)}%`,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    )}
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '13px' }}>
                      {currentSdkState.isCached
                        ? 'Loading weights into memory — this takes 5–15s on every page load'
                        : (downloadLabel || 'Downloading model to your device. Cached locally after the first download.')}
                    </p>
                  </>
                )}
                {/* GPU badge */}
                {currentSdkState.accelerationMode === 'webgpu' && (
                  <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '11px', fontWeight: 600, color: 'var(--accent)',
                    background: 'var(--accent-light)', border: '1px solid rgba(61,214,245,0.25)',
                    borderRadius: '99px', padding: '3px 10px' }}>
                    ⚡ GPU Accelerated
                  </div>
                )}
              </div>
            )}

            {/* ─── MODEL ERROR STATE ─── */}
            {isModelError && !isProcessing && !isResult && (
              <div className="empty-state">
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
                <h3 style={{ color: 'var(--error)' }}>Failed to load model</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '600px' }}>
                  {currentSdkState.error || 'An error occurred during initialization.'}
                </p>
                <div style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '16px', 
                  borderRadius: '8px', 
                  marginBottom: '16px',
                  maxWidth: '600px',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '8px' }}>Troubleshooting:</strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                    <li>Use Chrome 96+ or Edge 96+ (recommended: 120+)</li>
                    <li>Ensure WebAssembly is enabled in your browser</li>
                    <li>Check your internet connection (model download required on first use)</li>
                    <li>Close other tabs/apps to free up memory (requirements depend on the selected model)</li>
                    <li>Try clearing browser cache and refreshing</li>
                    <li>Check browser console (F12) for detailed error messages</li>
                    <li>Ensure SharedArrayBuffer is available (requires HTTPS or localhost)</li>
                    {currentSdkState.error?.includes('insufficient memory') && (
                      <li style={{ color: 'var(--error)', fontWeight: 'bold' }}>
                        ⚠️ Low memory detected: Close other applications and try again
                      </li>
                    )}
                    {currentSdkState.error?.includes('corrupted') && (
                      <li style={{ color: 'var(--error)', fontWeight: 'bold' }}>
                        ⚠️ Corrupted model file: Clear browser cache/storage and refresh
                      </li>
                    )}
                    {currentSdkState.error?.includes('error state') && (
                      <li style={{ color: 'var(--error)', fontWeight: 'bold' }}>
                        ⚠️ Model in error state: Click "Clear Cache & Retry" to reset and re-download
                      </li>
                    )}
                    {currentSdkState.error?.includes('status is') && (
                      <li style={{ color: 'var(--error)', fontWeight: 'bold' }}>
                        ⚠️ Model state issue: The model download may have failed. Use "Clear Cache & Retry" to force a fresh download.
                      </li>
                    )}
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
                  <button 
                    className="btn" 
                    onClick={() => {
                      // Clear OPFS storage if available
                      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
                        navigator.storage.getDirectory().then(async (dir) => {
                          try {
                            // Try to clear the directory (OPFS iterator support varies by TS DOM lib version)
                            const iter = (dir as any).values?.() ?? (dir as any).entries?.();
                            if (iter) {
                              for await (const entry of iter as AsyncIterable<any>) {
                                const name = Array.isArray(entry) ? entry[0] : entry?.name;
                                if (!name) continue;
                                try {
                                  await dir.removeEntry(name, { recursive: true });
                                } catch {}
                              }
                            }
                            alert('Cache cleared. Please refresh the page.');
                            window.location.reload();
                          } catch {
                            alert('Could not clear cache automatically. Please clear browser storage manually and refresh.');
                          }
                        }).catch(() => {
                          window.location.reload();
                        });
                      } else {
                        window.location.reload();
                      }
                    }}
                    title="Clear model cache and retry"
                  >
                    Clear Cache & Retry
                  </button>
                </div>
              </div>
            )}

            {/* ─── IDLE STATE (model ready, no result yet) ─── */}
            {isModelReady && !isProcessing && !isResult && (
              <div className="empty-state">
                <h3>Ready to optimize</h3>
                <p>Paste your code and click Optimize to detect inefficiencies and improve performance</p>
                <ul className="idle-bullets" style={{ textAlign: 'left', margin: '20px auto', display: 'inline-block', color: 'var(--text-secondary)' }}>
                  <li>Detects real bottlenecks — not guesses</li>
                  <li>Returns original if no improvement found</li>
                  <li>Runs 100% on-device, no data sent anywhere</li>
                </ul>
                <div className="keyboard-hints">
                  <kbd>Ctrl+Enter</kbd> to optimize · <kbd>Ctrl+K</kbd> to clear
                </div>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', fontSize: '11px', color: 'var(--text-light)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                  {currentSdkState.accelerationMode === 'webgpu' ? 'GPU Mode (Fast)' : 'CPU Mode (Stable)'}
                </div>
              </div>
            )}

            {/* ─── PROCESSING STATE ─── */}
            {isProcessing && (
              <div className="processing-state" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px' }}>
                <PipelineStages current={pipelineStage} />

                {/* Chunk progress bar (real progress) */}
                {chunkProgress && chunkProgress.total > 0 && (
                  <div style={{ margin: '12px 0 0', padding: '0 4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-light)', marginBottom: '4px' }}>
                      <span>Processing chunk {chunkProgress.current} of {chunkProgress.total}</span>
                      <span>{Math.round((chunkProgress.current / chunkProgress.total) * 100)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '3px', borderRadius: '2px', background: 'var(--border)' }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        background: 'var(--accent)',
                        width: `${Math.round((chunkProgress.current / chunkProgress.total) * 100)}%`,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )}

                <div className="pipeline-overlay" style={{ marginTop: '16px', textAlign: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p className="pipeline-text" style={{ color: 'var(--text-secondary)', fontSize: '13px', minHeight: '20px' }}>
                    {subStage || LOADING_MESSAGES[loadingMsgIdx]}
                  </p>
                </div>

                <div className="stream-box" style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className="stream-box-toggle"
                    onClick={() => setShowStreamingBox(v => !v)}
                  >
                    <span>Streaming output</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      {streamActive && <span className="stream-live-pill">LIVE</span>}
                      <span aria-hidden>{showStreamingBox ? '▾' : '▸'}</span>
                    </span>
                  </button>

                  {showStreamingBox && (
                    <pre className="stream-box-body">
                      {streamedCode || (!streamActive ? 'Waiting for first token…' : '')}
                      {streamActive && <span className="stream-cursor">▍</span>}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* ─── RESULT: OVERVIEW TAB ─── */}
            {isResult && outputTab === 'overview' && (
              <OverviewPanel result={result} />
            )}

            {/* ─── RESULT: CODE TAB ─── */}
            {isResult && outputTab === 'code' && (
              isNoChange ? (
                <div className="empty-state">
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✅</div>
                  <h3>No changes needed</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    This code is already well-optimized. No meaningful improvements were found.
                  </p>
                  <button className="btn btn-sm" style={{ marginTop: '16px' }} onClick={() => setOutputTab('explain')}>
                    View Analysis →
                  </button>
                </div>
              ) : (
                <pre className="code-preview">{outputCode}</pre>
              )
            )}

            {/* ─── RESULT: DIFF TAB ─── */}
            {isResult && outputTab === 'diff' && (
              isNoChange ? (
                <div className="empty-state">
                  <h3 style={{ color: 'var(--text-secondary)' }}>No diff available</h3>
                  <p>The code was not changed — 0 lines added, 0 lines removed.</p>
                </div>
              ) : (
                <DiffViewer original={originalForDiff} optimized={outputCode} />
              )
            )}

            {/* ─── RESULT: EXPLAIN TAB ─── */}
            {isResult && outputTab === 'explain' && (
              <ExplainPanel
                result={result}
                isLoading={false}
                shouldShowImprovement={shouldShowImprovement}
              />
            )}
          </div>
        </div>
      </div>



      {/* Actions */}
      <div className="optimizer-actions">
        {optimizing ? (
          <button className="btn btn-lg btn-cancel" onClick={handleCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            Cancel
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              className="btn btn-primary btn-lg optimize-btn"
              onClick={optimize}
              disabled={!codeInput.trim() || !isModelReady}
              title={isModelLoading ? 'Loading on-device AI...' : 'Ctrl+Enter'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              {isModelLoading ? 'Loading model...' : isModelError ? 'Model unavailable' : fastMode ? 'Optimize (Fast)' : 'Optimize Code'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="fast-mode-toggle"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                disabled={optimizing}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="fast-mode-toggle"
                className={`fast-mode-toggle ${fastMode ? 'active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${fastMode ? 'var(--accent)' : 'var(--border)'}`,
                  background: fastMode ? 'var(--accent-light)' : 'var(--bg-card)',
                  color: fastMode ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: optimizing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  userSelect: 'none',
                }}
                title="Fast mode: shorter prompts, fewer retries, quicker results"
              >
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '4px',
                    border: `2px solid ${fastMode ? 'var(--accent)' : 'var(--border)'}`,
                    background: fastMode ? 'var(--accent)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {fastMode && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </span>
                Fast
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
