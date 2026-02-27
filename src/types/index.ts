/**
 * Type-safe definitions for worker messages and optimization results.
 * Ensures all communication between main thread and worker is validated.
 */

import type { OptimizationResult, StaticAnalysis } from '../lib/promptBuilder';
import type { OptimizationFocus } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Worker → Main Thread Messages (Discriminated Union)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkerStatusMessage = {
  type: 'status';
  value: 'initializing' | 'loading_model' | 'ready' | 'error';
};

export type WorkerProgressMessage = {
  type: 'progress';
  value: number; // 0–1
};

export type WorkerReadyMessage = {
  type: 'READY';
};

export type WorkerDownloadBytesMessage = {
  type: 'download_bytes';
  value: {
    loadedBytes: number | null;
    totalBytes: number | null;
  };
};

export type WorkerAccelerationModeMessage = {
  type: 'accelerationMode';
  value: 'cpu' | 'webgpu';
};

export type WorkerCachedMessage = {
  type: 'cached';
  value: boolean;
};

export type WorkerModelSelectedMessage = {
  type: 'model_selected';
  value: {
    id: string;
    name: string;
  };
};

export type WorkerInitErrorMessage = {
  type: 'init-error';
  value: string; // error message
};

export type WorkerStageMessage = {
  type: 'stage';
  value: string; // pipeline stage name
};

export type WorkerSubStageMessage = {
  type: 'substage';
  value: string;
};

export type WorkerChunkProgressMessage = {
  type: 'chunk_progress';
  value: {
    current: number;
    total: number;
  };
};

export type WorkerStreamActiveMessage = {
  type: 'stream_active';
};

export type WorkerStreamIdleMessage = {
  type: 'stream_idle';
};

export type WorkerRetryCleanMessage = {
  type: 'retry_clear';
};

export type WorkerChunkMessage = {
  type: 'chunk';
  value: string; // code chunk
};

export type WorkerDoneMessage = {
  type: 'done';
  value: OptimizationResult;
};

export type WorkerErrorMessage = {
  type: 'error';
  value: string; // error message
};

/**
 * Union of all possible worker messages.
 * Use discriminated union pattern to safely handle in consumer code.
 */
export type WorkerMessage =
  | WorkerStatusMessage
  | WorkerProgressMessage
  | WorkerReadyMessage
  | WorkerDownloadBytesMessage
  | WorkerAccelerationModeMessage
  | WorkerCachedMessage
  | WorkerModelSelectedMessage
  | WorkerInitErrorMessage
  | WorkerStageMessage
  | WorkerSubStageMessage
  | WorkerChunkProgressMessage
  | WorkerStreamActiveMessage
  | WorkerStreamIdleMessage
  | WorkerRetryCleanMessage
  | WorkerChunkMessage
  | WorkerDoneMessage
  | WorkerErrorMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Main → Worker Messages (Requests)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkerInitRequest = {
  type: 'INIT_SDK';
  modelId: string | null;
};

export type WorkerOptimizeRequest = {
  type: 'OPTIMIZE';
  code: string;
  language: string;
  focus: OptimizationFocus;
  fastMode: boolean;
};

export type WorkerCancelRequest = {
  type: 'CANCEL_OPTIMIZATION';
};

/**
 * Union of all possible requests sent to worker.
 */
export type WorkerRequest =
  | WorkerInitRequest
  | WorkerOptimizeRequest
  | WorkerCancelRequest;

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that a message matches the WorkerMessage type signature.
 * Use this before processing any message from the worker.
 *
 * @example
 * worker.addEventListener('message', (e) => {
 *   if (isValidWorkerMessage(e.data)) {
 *     handleMessage(e.data); // now type-safe
 *   } else {
 *     console.error('Invalid worker message:', e.data);
 *   }
 * });
 */
export function isValidWorkerMessage(data: unknown): data is WorkerMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const msg = data as Record<string, unknown>;

  // Check for required 'type' field
  if (typeof msg.type !== 'string') {
    return false;
  }

  // Whitelist of valid message types
  const validTypes = new Set([
    'status',
    'progress',
    'READY',
    'download_bytes',
    'accelerationMode',
    'cached',
    'model_selected',
    'init-error',
    'stage',
    'substage',
    'chunk_progress',
    'stream_active',
    'stream_idle',
    'retry_clear',
    'chunk',
    'done',
    'error',
  ]);

  return validTypes.has(msg.type);
}

/**
 * Type guard to narrow a WorkerMessage to a specific message type.
 * Useful for pattern matching.
 *
 * @example
 * if (isWorkerMessageType(msg, 'done')) {
 *   const result = msg.value; // OptimizationResult
 * }
 */
export function isWorkerMessageType<T extends WorkerMessage['type']>(
  msg: WorkerMessage,
  type: T,
): msg is Extract<WorkerMessage, { type: T }> {
  return msg.type === type;
}

/**
 * Validates a request before sending to worker.
 */
export function isValidWorkerRequest(data: unknown): data is WorkerRequest {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const msg = data as Record<string, unknown>;

  if (typeof msg.type !== 'string') {
    return false;
  }

  const validTypes = new Set(['INIT_SDK', 'OPTIMIZE', 'CANCEL_OPTIMIZATION']);
  return validTypes.has(msg.type);
}

// ─────────────────────────────────────────────────────────────────────────────
// History & State
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  createdAt: number;
  language: string;
  focus: OptimizationFocus;
  inputCode: string;
  result: OptimizationResult;
}

/**
 * Safe type-checked result that always has a discriminant.
 */
export type ParsedResult =
  | { kind: 'success'; data: OptimizationResult }
  | { kind: 'nochange'; data: OptimizationResult }
  | { kind: 'error'; error: string };
