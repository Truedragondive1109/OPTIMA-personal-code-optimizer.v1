import { useState, useRef, useCallback, useEffect } from 'react';
import { useSDKState, globalWorker, initializeSDK } from '../hooks/useModelLoader';
import { ExplainPanel } from './ExplainPanel';
import { DiffViewer } from './DiffViewer';
import OverviewPanel from './OverviewPanel';
import { type OptimizationResult, type OptimizationFocus, isFullySupported } from '../lib/promptBuilder';

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
  // currentIdx is -1 when stage is 'idle' — treat as nothing active yet
  const currentIdx = STAGE_ORDER.indexOf(current);

  return (
    <div className="pipeline-stages">
      {STAGE_ORDER.map((stage, i) => {
        const isDone   = currentIdx > 0 && i < currentIdx;
        const isActive = currentIdx >= 0 && stage === current;
        const isPending = currentIdx < 0 || i > currentIdx;

        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Connector line between stages */}
            {i > 0 && (
              <div style={{
                width: '24px',
                height: '2px',
                borderRadius: '2px',
                flexShrink: 0,
                transition: 'background 0.4s ease',
                background: isDone
                  ? 'var(--success)'
                  : isActive
                  ? 'linear-gradient(90deg, var(--success) 0%, var(--primary) 100%)'
                  : 'rgba(255,255,255,0.08)',
              }} />
            )}

            <div className={[
              'pipeline-stage',
              isDone   ? 'done'    : '',
              isActive ? 'active'  : '',
              isPending && currentIdx >= 0 ? 'pending' : '',
            ].filter(Boolean).join(' ')}>

              {/* Dot / icon */}
              <div className="stage-dot">
                {isDone
                  ? <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700 }}>✓</span>
                  : isActive
                  ? <span className="stage-pulse" />
                  : <span style={{
                      display: 'inline-block',
                      width: '7px', height: '7px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.2)',
                    }} />
                }
              </div>

              <span className="stage-label">{stage}</span>
            </div>
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

  const [codeInput, setCodeInput] = useState('');
  const [language, setLanguage] = useState<string>('TypeScript');
  const [focus, setFocus] = useState<OptimizationFocus>('all');
  const [optimizing, setOptimizing] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string>('idle');
  const [result, setResult] = useState<OptimizationResult | null>(null);

  // Streaming
  const [streamedCode, setStreamedCode] = useState('');
  const [isStreamingCode, setIsStreamingCode] = useState(false);
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
        streamBufferRef.current = '';
        setResult(parsed);
        setPipelineStage('done');
        setIsStreamingCode(false);
        setOptimizing(false);
        setSubStage('');
        setChunkProgress(null);
        setStreamActive(false);
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
    setOriginalForDiff(code);
    setOutputTab('code');

    globalWorker.postMessage({
      type: 'START_OPTIMIZATION',
      payload: { code, language, focus }
    });
  }, [codeInput, optimizing, currentSdkState.status, language, focus]);

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
                <div className="spinner" style={{ marginBottom: '1.5rem', width: '32px', height: '32px' }} />
                <h3>Loading on-device model...</h3>
                {currentSdkState.progress > 0 && currentSdkState.progress < 1 && (
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
                  Initializing local AI engine — runs fully on your device
                </p>
                <p style={{ color: 'var(--text-light)', fontSize: '11px', marginTop: '4px' }}>
                  First load downloads the model (~250 MB)
                </p>
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
                    <li>Close other tabs/apps to free up memory (~250MB needed)</li>
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
                  <button className="btn btn-primary" onClick={initializeSDK}>Retry</button>
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
                          initializeSDK();
                        });
                      } else {
                        initializeSDK();
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

                {/* Streaming code preview — shows extracted code, never JSON */}
                {streamedCode && (
                  <pre className="code-preview" style={{ flex: 1, marginTop: '16px', padding: '12px', overflow: 'auto', fontSize: '12px', opacity: 0.85 }}>
                    {streamedCode}
                    <span className="stream-cursor">▍</span>
                  </pre>
                )}
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
          <button
            className="btn btn-primary btn-lg optimize-btn"
            onClick={optimize}
            disabled={!codeInput.trim() || !isModelReady}
            title={isModelLoading ? 'Loading on-device AI...' : 'Ctrl+Enter'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            {isModelLoading ? 'Loading model...' : isModelError ? 'Model unavailable' : 'Optimize Code'}
          </button>
        )}
      </div>
    </div>
  );
}
