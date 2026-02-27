import type { LoaderState } from '../hooks/useModelLoader';

interface Props {
    state: LoaderState;
    progress: number;
    error: string | null;
    onRetry: () => void;
    executionMode: 'cpu' | 'webgpu';
}

export function ModelStatusBar({ state, progress, error, onRetry, executionMode }: Props) {
    const pct = Math.round(progress * 100);

    const getStatusAriaLabel = (): string => {
        switch (state) {
            case 'ready': return 'On-device AI model is ready. You can now optimize code.';
            case 'initializing': return `Downloading AI model: ${pct}% complete`;
            case 'loading_model': return 'Initializing on-device AI model. Please wait.';
            case 'idle': return 'Preparing AI model for use.';
            case 'error': return `Model error: ${error || 'Unknown error'}. Please retry.`;
            default: return 'Loading model...';
        }
    };

    return (
        <div className="model-status-bar">
            {/* Model State */}
            <div className="model-status-left">
                <div 
                    className={`model-indicator ${state}`}
                    role="status"
                    aria-live="polite"
                    aria-label={getStatusAriaLabel()}
                >
                    {state === 'ready' && <span className="pulse-dot" aria-hidden="true" />}
                    {(state === 'initializing' || state === 'loading_model') && (
                        <div className="progress-ring-wrap">
                            <svg className="progress-ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                                <circle cx="11" cy="11" r="9" fill="none" stroke="var(--border)" strokeWidth="2.5" />
                                <circle
                                    cx="11" cy="11" r="9" fill="none"
                                    stroke="var(--primary)" strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 9}`}
                                    strokeDashoffset={`${2 * Math.PI * 9 * (1 - (state === 'loading_model' ? 0.85 : progress))}`}
                                    style={{ transition: 'stroke-dashoffset 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '11px 11px' }}
                                />
                            </svg>
                            {state === 'loading_model' && <span className="ring-spin" aria-hidden="true" />}
                        </div>
                    )}
                    {state === 'error' && <span className="error-dot" aria-hidden="true">!</span>}
                    {state === 'idle' && <span className="idle-dot" aria-hidden="true" />}
                </div>

                <div className="model-status-text">
                    {state === 'idle' && <span className="status-label">Preparing AI model...</span>}
                    {state === 'initializing' && (
                        <span className="status-label">
                            <span className="status-icon" aria-hidden="true">⬇️</span> Downloading model <strong>{pct}%</strong>
                            <span className="status-sub" aria-hidden="true"> — cached locally after first download</span>
                        </span>
                    )}
                    {state === 'loading_model' && (
                        <span className="status-label">
                            <span className="status-icon" aria-hidden="true">⚙️</span> Initializing on-device AI...
                        </span>
                    )}
                    {state === 'ready' && (
                        <span className="status-label ready">
                            <span className="status-icon" aria-hidden="true">✅</span> On-device AI ready
                        </span>
                    )}
                    {state === 'error' && (
                        <span className="status-label error">
                            <span className="status-icon" aria-hidden="true">❌</span> Model error: {error}
                            <button 
                                className="retry-link" 
                                onClick={onRetry}
                                aria-label="Retry model initialization"
                            >
                                Retry
                            </button>
                        </span>
                    )}
                </div>
            </div>

            {/* Execution Mode Toggle */}
            <div className="model-status-right">
                {state === 'initializing' && (
                    <div className="progress-bar-inline" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="progress-fill-inline" style={{ width: `${pct}%` }} />
                    </div>
                )}
                {executionMode === 'webgpu' && (
                    <div
                        className="mode-toggle webgpu"
                        title="WebGPU acceleration active"
                        aria-label="GPU acceleration enabled"
                        role="img"
                        style={{ cursor: 'default' }}
                    >
                        <span className="mode-icon" aria-hidden="true">⚡</span>
                        <span className="mode-label">Accelerated</span>
                    </div>
                )}
            </div>
        </div>
    );
}
