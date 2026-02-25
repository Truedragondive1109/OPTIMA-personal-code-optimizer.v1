import { useState, useEffect } from 'react';
import OptimizerWorker from '../workers/optimizer_worker?worker';

export type LoaderState = 'idle' | 'initializing' | 'loading_model' | 'ready' | 'error';

// Global mutable state — shared across all React components without context overhead
export const sdkState = {
  status: 'idle' as LoaderState,
  progress: 0,
  error: null as string | null,
  accelerationMode: 'cpu' as 'cpu' | 'webgpu',
};

// Lightweight pub-sub for React hooks
const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// ─────────────────────────────────────────────────────────────────────────────
// Global singleton worker — created ONCE, shared across the whole app
// ─────────────────────────────────────────────────────────────────────────────
export const globalWorker: Worker = new OptimizerWorker();

globalWorker.addEventListener('message', (e) => {
  const msg = e.data;

  switch (msg.type) {
    case 'READY':
      sdkState.status = 'ready';
      sdkState.error = null;
      notifyListeners();
      break;

    case 'status':
      if (msg.value === 'initializing' || msg.value === 'loading_model') {
        sdkState.status = msg.value as LoaderState;
        notifyListeners();
      }
      break;

    case 'progress':
      sdkState.progress = msg.value;
      notifyListeners();
      break;

    case 'accelerationMode':
      sdkState.accelerationMode = msg.value;
      notifyListeners();
      break;

    case 'init-error':
      sdkState.status = 'error';
      sdkState.error = msg.value;
      notifyListeners();
      break;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// React hook — components subscribe to state changes
// ─────────────────────────────────────────────────────────────────────────────
export function useSDKState() {
  const [state, setState] = useState({ ...sdkState });

  useEffect(() => {
    // Sync on mount in case state changed before component rendered
    setState({ ...sdkState });
    const handler = () => setState({ ...sdkState });
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot function — called once from App.tsx on mount
// ─────────────────────────────────────────────────────────────────────────────
export function initializeSDK() {
  if (sdkState.status !== 'idle' && sdkState.status !== 'error') return;

  sdkState.status = 'initializing';
  sdkState.error = null;
  sdkState.progress = 0;
  notifyListeners();

  // Add small delay to prevent rapid successive calls during hot reload
  setTimeout(() => {
    if (sdkState.status === 'initializing') {
      globalWorker.postMessage({ type: 'INIT' });
    }
  }, 100);
}
