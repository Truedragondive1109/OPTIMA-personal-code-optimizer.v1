/**
 * Unit tests for core OPTIMA functionality.
 * Uses Vitest framework (compatible with Jest API).
 */

import { describe, it, expect } from 'vitest';
import { isValidWorkerMessage, isWorkerMessageType, isValidWorkerRequest } from '../types/index';
import type { WorkerMessage, WorkerRequest } from '../types/index';
import { STORAGE_KEYS, CONSTRAINTS, ERROR_MESSAGES } from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Type Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidWorkerMessage', () => {
  it('should validate correct READY message', () => {
    const msg: WorkerMessage = { type: 'READY' };
    expect(isValidWorkerMessage(msg)).toBe(true);
  });

  it('should validate correct status message', () => {
    const msg: WorkerMessage = { type: 'status', value: 'ready' };
    expect(isValidWorkerMessage(msg)).toBe(true);
  });

  it('should validate correct stage message', () => {
    const msg: WorkerMessage = { type: 'stage', value: 'Understanding Code' };
    expect(isValidWorkerMessage(msg)).toBe(true);
  });

  it('should validate correct done message', () => {
    const msg: WorkerMessage = {
      type: 'done',
      value: {
        algorithm: 'merge_sort',
        complexity_before: 'O(n²)',
        complexity_after: 'O(n log n)',
        bottleneck: 'nested_loops',
        strategy: 'replace with sorted',
        optimization_strategy: 'use built-in sort',
        tradeoffs: 'none',
        estimated_improvement: '2x faster',
        confidence: 0.9,
        explanation: 'test',
        optimized_code: 'code',
        _parsed: true,
        _no_change: false,
      },
    };
    expect(isValidWorkerMessage(msg)).toBe(true);
  });

  it('should reject message without type', () => {
    const msg = { value: 'test' };
    expect(isValidWorkerMessage(msg)).toBe(false);
  });

  it('should reject invalid type', () => {
    const msg = { type: 'invalid_type' };
    expect(isValidWorkerMessage(msg)).toBe(false);
  });

  it('should reject null', () => {
    expect(isValidWorkerMessage(null)).toBe(false);
  });

  it('should reject non-object', () => {
    expect(isValidWorkerMessage('not an object')).toBe(false);
    expect(isValidWorkerMessage(123)).toBe(false);
    expect(isValidWorkerMessage(undefined)).toBe(false);
  });
});

describe('isWorkerMessageType', () => {
  it('should narrow message to done type', () => {
    const msg: WorkerMessage = { type: 'progress', value: 0.5 };

    if (isWorkerMessageType(msg, 'progress')) {
      expect(msg.value).toBe(0.5);
    } else {
      throw new Error('Should narrow to progress message');
    }
  });

  it('should return false for non-matching type', () => {
    const msg: WorkerMessage = { type: 'READY' };
    expect(isWorkerMessageType(msg, 'progress')).toBe(false);
  });
});

describe('isValidWorkerRequest', () => {
  it('should validate INIT_SDK request', () => {
    const req: WorkerRequest = { type: 'INIT_SDK', modelId: null };
    expect(isValidWorkerRequest(req)).toBe(true);
  });

  it('should validate OPTIMIZE request', () => {
    const req: WorkerRequest = {
      type: 'OPTIMIZE',
      code: 'const x = 1;',
      language: 'JavaScript',
      focus: 'performance',
      fastMode: false,
    };
    expect(isValidWorkerRequest(req)).toBe(true);
  });

  it('should validate CANCEL_OPTIMIZATION request', () => {
    const req: WorkerRequest = { type: 'CANCEL_OPTIMIZATION' };
    expect(isValidWorkerRequest(req)).toBe(true);
  });

  it('should reject invalid request type', () => {
    const req = { type: 'INVALID_REQUEST' };
    expect(isValidWorkerRequest(req)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('STORAGE_KEYS', () => {
  it('should have all required storage keys', () => {
    expect(STORAGE_KEYS.HISTORY).toBe('code_optimizer_history_v1');
    expect(STORAGE_KEYS.DARK_MODE).toBe('darkMode');
    expect(STORAGE_KEYS.MODEL_CACHE).toBe('optima_model_cached_v1');
  });

  it('should be constant and immutable', () => {
    expect(() => {
      (STORAGE_KEYS as any).HISTORY = 'modified';
    }).toThrow();
  });
});

describe('CONSTRAINTS', () => {
  it('should define maximum history entries', () => {
    expect(CONSTRAINTS.HISTORY_MAX_ENTRIES).toBe(50);
  });

  it('should define inference timeout', () => {
    expect(CONSTRAINTS.INFERENCE_TIMEOUT_MS).toBe(90_000);
  });

  it('should define toast duration', () => {
    expect(CONSTRAINTS.TOAST_DURATION_MS).toBe(3_000);
  });

  it('should all be positive numbers', () => {
    Object.values(CONSTRAINTS).forEach((value) => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThan(0);
      }
    });
  });
});

describe('ERROR_MESSAGES', () => {
  it('should have user-friendly error messages', () => {
    expect(ERROR_MESSAGES.EMPTY_CODE).toContain('code');
    expect(ERROR_MESSAGES.MODEL_NOT_READY).toContain('Model');
    expect(ERROR_MESSAGES.INVALID_WORKER_message).toContain('worker');
  });

  it('should not be overly technical', () => {
    Object.values(ERROR_MESSAGES).forEach((msg) => {
      expect(msg.length).toBeLessThan(100); // Keep messages concise
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker Message Flow', () => {
  it('should handle complete optimization flow', () => {
    // Request
    const request: WorkerRequest = {
      type: 'OPTIMIZE',
      code: 'for(let i=0;i<n;i++)for(let j=0;j<n;j++){}',
      language: 'JavaScript',
      focus: 'performance',
      fastMode: false,
    };
    expect(isValidWorkerRequest(request)).toBe(true);

    // Responses
    const stageMsg: WorkerMessage = { type: 'stage', value: 'Understanding Code' };
    expect(isValidWorkerMessage(stageMsg)).toBe(true);

    const progressMsg: WorkerMessage = { type: 'progress', value: 0.5 };
    expect(isValidWorkerMessage(progressMsg)).toBe(true);

    const doneMsg: WorkerMessage = {
      type: 'done',
      value: {
        algorithm: 'nested_loops',
        complexity_before: 'O(n²)',
        complexity_after: 'O(n)',
        bottleneck: 'nested loop',
        strategy: 'refactor',
        optimization_strategy: 'extract inner loop',
        tradeoffs: 'none',
        estimated_improvement: '10x',
        confidence: 0.95,
        explanation: 'Nested loops can be optimized',
        optimized_code: 'const result = [];',
        _parsed: true,
        _no_change: false,
      },
    };
    expect(isValidWorkerMessage(doneMsg)).toBe(true);
  });

  it('should handle error scenarios', () => {
    const errorMsg: WorkerMessage = {
      type: 'error',
      value: 'Something went wrong',
    };
    expect(isValidWorkerMessage(errorMsg)).toBe(true);

    const initErrorMsg: WorkerMessage = {
      type: 'init-error',
      value: 'Model download failed',
    };
    expect(isValidWorkerMessage(initErrorMsg)).toBe(true);
  });
});
