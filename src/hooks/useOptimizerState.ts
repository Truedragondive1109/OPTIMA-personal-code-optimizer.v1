/**
 * Custom hook for managing optimizer state.
 * Extracted from CodeOptimizerTab to improve testability and component organization.
 */

import { useState, useRef, useCallback } from 'react';
import type { OptimizationResult, OptimizationFocus } from '../lib/promptBuilder';
import type { HistoryEntry } from '../types';
import { STORAGE_KEYS, CONSTRAINTS } from '../lib/constants';

/**
 * History persistence with localStorage fallbacks
 */
function safeLoadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
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
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(entries));
  } catch {
    // silently ignore localStorage errors
  }
}

export function useOptimizerState() {
  // Code input state
  const [codeInput, setCodeInput] = useState('');
  const [language, setLanguage] = useState<string>('TypeScript');
  const [focus, setFocus] = useState<OptimizationFocus>('all');

  // Optimization state
  const [optimizing, setOptimizing] = useState(false);
  const [fastMode, setFastMode] = useState(false);

  // Pipeline state
  const [pipelineStage, setPipelineStage] = useState<string>('idle');
  const [subStage, setSubStage] = useState('');
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null);

  // Output state
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [originalForDiff, setOriginalForDiff] = useState('');

  // Streaming state
  const [streamedCode, setStreamedCode] = useState('');
  const [isStreamingCode, setIsStreamingCode] = useState(false);
  const [showStreamingBox, setShowStreamingBox] = useState(true);
  const [streamActive, setStreamActive] = useState(false);
  const streamBufferRef = useRef('');
  const reqFrameRef = useRef<number | null>(null);

  // UI state
  const [outputTab, setOutputTab] = useState<'code' | 'diff' | 'explain' | 'overview'>('code');
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Loading message state
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>(safeLoadHistory());

  // Last run tracking
  const lastRunRef = useRef<{ code: string; language: string; focus: OptimizationFocus } | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // History Management
  // ─────────────────────────────────────────────────────────────────────────

  const addHistoryEntry = useCallback((entry: HistoryEntry) => {
    const current = safeLoadHistory();
    const next = [entry, ...current].slice(0, CONSTRAINTS.HISTORY_MAX_ENTRIES);
    safeSaveHistory(next);
    setHistory(next);
  }, []);

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch {
      // ignore
    }
    setHistory([]);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Streaming Management
  // ─────────────────────────────────────────────────────────────────────────

  const clearStreamBuffer = useCallback(() => {
    streamBufferRef.current = '';
    setStreamedCode('');
    if (reqFrameRef.current) {
      cancelAnimationFrame(reqFrameRef.current);
      reqFrameRef.current = null;
    }
  }, []);

  const setStreamingActive = useCallback(() => {
    setStreamActive(true);
    setShowStreamingBox(true);
    setIsStreamingCode(true);
  }, []);

  const setStreamingIdle = useCallback(() => {
    setStreamActive(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Reset Functions
  // ─────────────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    clearStreamBuffer();
    setCodeInput('');
    setResult(null);
    setError(null);
    setPipelineStage('idle');
    setSubStage('');
    setChunkProgress(null);
    setStreamActive(false);
    setShowStreamingBox(false);
    setOutputTab('code');
  }, [clearStreamBuffer]);

  const resetOptimization = useCallback(() => {
    clearStreamBuffer();
    setOptimizing(false);
    setIsStreamingCode(false);
    setPipelineStage('idle');
    setSubStage('');
    setChunkProgress(null);
    setStreamActive(false);
    setShowStreamingBox(false);
  }, [clearStreamBuffer]);

  const setToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  return {
    // Code input
    codeInput,
    setCodeInput,
    language,
    setLanguage,
    focus,
    setFocus,

    // Optimization
    optimizing,
    setOptimizing,
    fastMode,
    setFastMode,

    // Pipeline
    pipelineStage,
    setPipelineStage,
    subStage,
    setSubStage,
    chunkProgress,
    setChunkProgress,

    // Output
    result,
    setResult,
    originalForDiff,
    setOriginalForDiff,

    // Streaming
    streamedCode,
    setStreamedCode,
    isStreamingCode,
    setIsStreamingCode,
    showStreamingBox,
    setShowStreamingBox,
    streamActive,
    setStreamActive,
    streamBufferRef,
    reqFrameRef,
    clearStreamBuffer,
    setStreamingActive,
    setStreamingIdle,

    // UI
    outputTab,
    setOutputTab,
    error,
    setError,
    toastMessage,
    setToastMessage,
    setToast,

    // Loading messages
    loadingMsgIdx,
    setLoadingMsgIdx,

    // History
    history,
    addHistoryEntry,
    clearHistory,

    // Last run
    lastRunRef,

    // Batch operations
    reset,
    resetOptimization,
  };
}
