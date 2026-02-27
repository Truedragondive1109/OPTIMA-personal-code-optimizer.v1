import { useState, useEffect } from 'react';
import OptimizerWorker from '../workers/optimizer.worker?worker';

export type LoaderState = 'idle' | 'initializing' | 'loading_model' | 'ready' | 'error';

export type AvailableModel = {
  id: string;
  name: string;
};

const CACHE_KEY = 'optima_model_cached_v1';

// Global mutable state
export const sdkState = {
  status: 'idle' as LoaderState,
  progress: 0,
  error: null as string | null,
  accelerationMode: 'cpu' as 'cpu' | 'webgpu',
  selectedModel: null as AvailableModel | null,
  downloadedBytes: null as number | null,
  totalBytes: null as number | null,
  // Did the worker tell us the file is already in OPFS?
  isCached: (() => {
    try { return localStorage.getItem(CACHE_KEY) === 'true'; } catch { return false; }
  })(),
};

const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// Singleton worker
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

    case 'download_bytes':
      sdkState.downloadedBytes = msg.value?.loadedBytes ?? null;
      sdkState.totalBytes = msg.value?.totalBytes ?? null;
      notifyListeners();
      break;

    case 'accelerationMode':
      sdkState.accelerationMode = msg.value;
      notifyListeners();
      break;

    case 'cached':
      // Worker confirmed file is in OPFS — persist so next load knows immediately
      sdkState.isCached = msg.value as boolean;
      try { localStorage.setItem(CACHE_KEY, String(msg.value)); } catch {}
      notifyListeners();
      break;

    case 'model_selected':
      sdkState.selectedModel = msg.value as AvailableModel;
      notifyListeners();
      break;

    case 'init-error':
      sdkState.status = 'error';
      sdkState.error = msg.value;
      // If it errored, the cache might be corrupt — clear the flag
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      notifyListeners();
      break;
  }
});

export function useSDKState() {
  const [state, setState] = useState({ ...sdkState });

  useEffect(() => {
    setState({ ...sdkState });
    const handler = () => setState({ ...sdkState });
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return state;
}

export function initializeSDK() {
  if (sdkState.status !== 'idle' && sdkState.status !== 'error') return;

  sdkState.status = 'initializing';
  sdkState.error = null;
  sdkState.progress = 0;
  notifyListeners();

  setTimeout(() => {
    if (sdkState.status === 'initializing') {
      globalWorker.postMessage({ type: 'INIT', payload: { modelId: sdkState.selectedModel?.id ?? null } });
    }
  }, 100);
}

export function initializeSDKWithModel(model: AvailableModel) {
  if (sdkState.status !== 'idle' && sdkState.status !== 'error') return;
  sdkState.selectedModel = model;
  sdkState.downloadedBytes = null;
  sdkState.totalBytes = null;
  initializeSDK();
}
