import { useState, useEffect, useMemo, useCallback } from 'react';
import { CodeOptimizerTab } from './components/CodeOptimizerTab';

type OptimizationFocus = 'performance' | 'readability' | 'security' | 'best-practices' | 'all';

type OptimizationResult = {
  optimized_code: string;
  explanation?: string;
  algorithm?: string;
  complexity_before?: string;
  complexity_after?: string;
  confidence?: number;
  _no_change?: boolean;
};

type HistoryEntry = {
  id: string;
  createdAt: number;
  language: string;
  focus: OptimizationFocus;
  inputCode: string;
  result: OptimizationResult;
};

const HISTORY_STORAGE_KEY = 'code_optimizer_history_v1';

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

export function App() {
  const [darkMode, setDarkMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('darkMode') ?? 'true'); }
    catch { return true; }
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark-mode');
    else document.documentElement.classList.remove('dark-mode');
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark-mode');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = useCallback(() => {
    const entries = safeLoadHistory();
    setHistoryEntries(entries);
    setSelectedHistoryId((prev) => {
      if (prev && entries.some(e => e.id === prev)) return prev;
      return entries[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    refreshHistory();
  }, [historyOpen, refreshHistory]);

  useEffect(() => {
    const handler = () => {
      if (!historyOpen) return;
      refreshHistory();
    };
    window.addEventListener('optimizer:history_updated', handler as EventListener);
    return () => window.removeEventListener('optimizer:history_updated', handler as EventListener);
  }, [historyOpen, refreshHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyOpen]);

  const selectedHistoryEntry = useMemo(() => {
    if (!selectedHistoryId) return null;
    return historyEntries.find(h => h.id === selectedHistoryId) ?? null;
  }, [historyEntries, selectedHistoryId]);

  const clearHistory = useCallback(() => {
    safeSaveHistory([]);
    setHistoryEntries([]);
    setSelectedHistoryId(null);
  }, []);

  const loadIntoOptimizer = useCallback((code: string, language?: string) => {
    window.dispatchEvent(new CustomEvent('optimizer:load_code', { detail: { code, language } }));
    setHistoryOpen(false);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <img src="/optima.png" alt="OPTIMA" className="logo-mark" />
          <div className="title-text">
            <h1>OPTIMA</h1>
            <span className="app-subtitle">On-Device Code Intelligence Engine</span>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open history"
            title="History"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 4v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 3V1M10 19V17M17 10H19M1 10H3M15.5 4.5L16.5 3.5M3.5 16.5L4.5 15.5M15.5 15.5L16.5 16.5M3.5 3.5L4.5 4.5M14 10C14 12.2091 12.2091 14 10 14C7.79086 14 6 12.2091 6 10C6 7.79086 7.79086 6 10 6C12.2091 6 14 7.79086 14 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 10.5C16.8 14.7 13.3 18 9 18C4.6 18 1 14.4 1 10C1 5.9 4 2.5 8 2.1C7.4 2.7 7 3.6 7 4.5C7 6.4 8.6 8 10.5 8C11.4 8 12.3 7.6 12.9 7C13.3 11 13.3 10.1 17 10.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {historyOpen && (
        <div className="history-overlay" role="dialog" aria-modal="true">
          <button className="history-overlay-backdrop" type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history" />
          <div className="history-modal">
            <div className="history-modal-header">
              <div>
                <div className="history-modal-title">History</div>
                <div className="history-modal-subtitle">Previous code + analysis snapshots</div>
              </div>
              <div className="history-modal-actions">
                <button className="btn btn-sm" onClick={clearHistory} disabled={historyEntries.length === 0}>Clear</button>
                <button className="btn btn-sm" onClick={() => setHistoryOpen(false)} aria-label="Close">✕</button>
              </div>
            </div>

            <div className="history-modal-body">
              <div className="history-sidebar">
                {historyEntries.length === 0 ? (
                  <div className="history-empty">No history yet</div>
                ) : (
                  historyEntries.map((h) => {
                    const dt = new Date(h.createdAt);
                    const active = h.id === selectedHistoryId;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        className={`history-sidebar-item ${active ? 'active' : ''}`}
                        onClick={() => setSelectedHistoryId(h.id)}
                      >
                        <div className="history-item-meta">
                          <span className="history-language">{h.language}</span>
                          <span className="history-focus">{h.focus}</span>
                          {h.result?.algorithm && <span className="history-algo">{h.result.algorithm}</span>}
                          <span className="history-time">{dt.toLocaleString()}</span>
                        </div>
                        {h.result?.complexity_before && (
                          <div className="history-complexity">
                            {h.result.complexity_before} → {h.result.complexity_after || h.result.complexity_before}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="history-detail">
                {!selectedHistoryEntry ? (
                  <div className="history-empty">Select a run to view details</div>
                ) : (
                  <>
                    <div className="history-detail-actions">
                      <button className="btn btn-sm" onClick={() => loadIntoOptimizer(selectedHistoryEntry.inputCode, selectedHistoryEntry.language)}>Load input</button>
                      {!selectedHistoryEntry.result?._no_change && (
                        <button className="btn btn-sm btn-primary" onClick={() => loadIntoOptimizer(selectedHistoryEntry.result.optimized_code, selectedHistoryEntry.language)}>Load optimized</button>
                      )}
                    </div>

                    <div className="history-detail-section">
                      <div className="history-detail-section-title">Optimized code</div>
                      <pre className="code-preview" style={{ margin: 0 }}>
                        {selectedHistoryEntry.result?._no_change ? selectedHistoryEntry.inputCode : (selectedHistoryEntry.result.optimized_code || '')}
                      </pre>
                    </div>

                    <div className="history-detail-section">
                      <div className="history-detail-section-title">Explanation</div>
                      <div className="history-detail-text">
                        {selectedHistoryEntry.result?.explanation || 'No explanation captured.'}
                      </div>
                    </div>

                    <div className="history-detail-section">
                      <div className="history-detail-section-title">Input code</div>
                      <pre className="code-preview" style={{ margin: 0 }}>
                        {selectedHistoryEntry.inputCode}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="main-content">
        <CodeOptimizerTab />
      </main>
    </div>
  );
}
