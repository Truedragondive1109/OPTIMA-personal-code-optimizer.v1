/**
 * Centralized configuration and constants for the OPTIMA application.
 * Single source of truth for storage keys, UI labels, limits, and timeouts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Storage & Persistence
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  HISTORY: 'code_optimizer_history_v1',
  DARK_MODE: 'darkMode',
  MODEL_CACHE: 'optima_model_cached_v1',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// UI Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const OUTPUT_TABS = ['code', 'diff', 'explain', 'overview'] as const;
export type OutputTab = typeof OUTPUT_TABS[number];

export const OPTIMIZATION_FOCUS = ['performance', 'readability', 'security', 'best-practices', 'all'] as const;
export type OptimizationFocus = typeof OPTIMIZATION_FOCUS[number];

export const SUPPORTED_LANGUAGES = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'C++',
] as const;

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  py: 'Python',
  java: 'Java',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  c: 'C++',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Stages
// ─────────────────────────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  'Understanding Code',
  'Optimizing',
  'Refining Optimization',
  'Finalizing Output',
] as const;

export const PIPELINE_STAGE_DESCRIPTION: Record<string, string> = {
  'Understanding Code': 'Analyzing code structure and identifying patterns',
  'Optimizing': 'Finding inefficiencies and optimization opportunities',
  'Refining Optimization': 'Improving the optimization strategy',
  'Finalizing Output': 'Preparing the final optimized code',
};

// ─────────────────────────────────────────────────────────────────────────────
// Limits & Timeouts
// ─────────────────────────────────────────────────────────────────────────────

export const CONSTRAINTS = {
  HISTORY_MAX_ENTRIES: 50,
  MAX_INPUT_LINES: 80,
  INFERENCE_TIMEOUT_MS: 90_000,
  LOADING_MSG_ROTATION_MS: 10_000,
  TOAST_DURATION_MS: 3_000,
  STREAM_CHUNK_SIZE: 60,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LLM Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const LLM_CONFIG = {
  TEMPERATURE: 0.05,
  MAX_TOKENS_TINY: 300,        // <= 15 lines
  MAX_TOKENS_MEDIUM: 600,      // <= 40 lines
  MAX_TOKENS_LARGE: 900,       // <= 80 lines
  MAX_TOKENS_XLARGE: 1200,     // > 80 lines
  MAX_TOKENS_FAST_TINY: 150,
  MAX_TOKENS_FAST_MEDIUM: 300,
  MAX_TOKENS_FAST_LARGE: 500,
  MAX_TOKENS_FAST_XLARGE: 600,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Error Messages
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_MESSAGES = {
  EMPTY_CODE: 'Please paste some code to optimize.',
  MODEL_NOT_READY: 'Model not ready. Please wait for the AI to load.',
  OPTIMIZATION_IN_PROGRESS: 'Optimization already in progress.',
  INVALID_WORKER_message: 'Invalid worker message received',
  INFERENCE_TIMEOUT: 'LLM inference timed out',
  NO_MODEL_SELECTED: 'No model selected. Please pick a model to download and load.',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Success Messages
// ─────────────────────────────────────────────────────────────────────────────

export const SUCCESS_MESSAGES = {
  OPTIMIZATION_COMPLETE: 'Optimization complete!',
  LOADED_FROM_HISTORY: 'Loaded from history',
  HISTORY_CLEARED: 'History cleared',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Loading Messages (rotating motivational text)
// ─────────────────────────────────────────────────────────────────────────────

export const LOADING_MESSAGES = [
  // Code understanding
  'Understanding your code structure...',
  'Parsing abstract syntax tree...',
  'Mapping call graph and dependencies...',
  'Tracing data flow across functions...',
  'Building internal representation...',
  'Reading your intent carefully...',
  'Understanding what your code does...',
  'Identifying code entry points...',
  // Pattern detection
  'Looking for inefficiencies...',
  'Detecting nested loop hazards...',
  'Scanning for O(n²) anti-patterns...',
  'Auditing memory allocation patterns...',
  'Identifying redundant computations...',
  'Counting branch misprediction risks...',
  'Estimating cache miss probability...',
  'Checking for duplicate logic...',
  'Looking for dead code...',
  'Searching for unnecessary allocations...',
  'Measuring algorithmic complexity...',
  'Detecting early exit opportunities...',
  // Optimization actions
  'Refactoring for performance...',
  'Rewriting hot paths for CPU cache efficiency...',
  'Collapsing O(n/8) to O(n/64)...',
  'Applying memoization where applicable...',
  'Replacing verbose loops with idiomatic patterns...',
  'Refactoring for zero-overhead abstractions...',
  'Inlining critical inner loops...',
  'Squeezing cycles out of tight loops...',
  'Vectorising data-parallel operations...',
  'Eliminating unnecessary heap allocations...',
  'Collapsing redundant passes into one...',
  'Selecting the optimal data structure...',
  'Converting O(n) search to O(1) lookup...',
  'Pruning unreachable branches...',
  'Short-circuiting early termination paths...',
  'Aligning struct fields for cache line packing...',
  'Unrolling small loops for pipeline efficiency...',
  'Hoisting invariant computations out of loops...',
  'Reducing function call overhead...',
  'Rearranging operations for better ILP...',
  'Profiling hot execution paths...',
  'Eliminating common subexpressions...',
  // Quality / correctness
  'Optimizing like it\'s production code...',
  'Compilers would approve this...',
  'Turning spaghetti into clean logic...',
  'Making it readable AND fast...',
  'Ensuring correctness first, speed second...',
  'Honoring the original algorithm\'s intent...',
  'Checking for subtle edge cases...',
  'Validating output against safety rules...',
  'Cross-checking complexity claims...',
  'Ensuring idiomatic style for this language...',
  'Confirming no behavior is changed...',
  // Humour / personality
  'Making your future self proud... 😌',
  'Did you know? Faster code = happier users.',
  'Consulting the ancient runtime profiling scrolls...',
  'Negotiating with the garbage collector...',
  'Feeding the compiler some carrots 🥕...',
  'Teaching the CPU new tricks...',
  'Untangling code spaghetti... 🍝',
  'Polishing the critical path to a mirror finish...',
  'Measuring twice, optimizing once...',
  'Whispering sweet nothings to the branch predictor...',
  'Compressing cognitive load byte by byte...',
  'Reasoning about asymptotic behaviour...',
  'Asking the model to behave nicely... 🙏',
  'Thinking hard so you don\'t have to...',
  'Running it through the mental compiler...',
  'Applying the principle of least surprise...',
  'Remembering Donald Knuth\'s warnings...',
  'Checking if we can cheat (we can\'t)...',
  'Turning O(n³) into something you won\'t be embarrassed by...',
  'Debating tabs vs spaces... just kidding.',
  'Double-checking the math...',
  'Making sure no kittens are harmed during this optimization...',
  'Being careful with C pointers... very careful...',
  'Respecting memory boundaries...',
  'Looking for the bottleneck you knew was there...',
  'Reading between the lines of your code...',
  'Building a better mousetrap...',
  'Applying algorithmic intuition...',
  'Make the code not just faster — smarter...',
  'On-device intelligence at work...',
  'Zero network calls. Zero data leaves your machine...',
  'Local AI doing its best...',
  'Crunching numbers entirely on your device...',
  'Crafting optimizations that actually matter...',
  'Ensuring the output is real, not theater...',
  'Being honest: sometimes the original is already great.',
  'Checking if anything actually needs changing...',
  'Applying engineering judgment, not just pattern matching...',
  'Giving it the full 100%...',
  'Finding the 20% effort that gives 80% improvement...',
  'Running a sanity check...',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility
// ─────────────────────────────────────────────────────────────────────────────

export const ARIA_LABELS = {
  OPTIMIZE_BUTTON: 'Optimize code (Ctrl+Enter)',
  CANCEL_BUTTON: 'Cancel optimization',
  CLEAR_BUTTON: 'Clear all inputs and results',
  UPLOAD_FILE: 'Upload a code file',
  COPY_CODE: 'Copy optimized code to clipboard',
  LOAD_FROM_HISTORY: 'Load code from history',
  TAB_CODE: 'View optimized code',
  TAB_DIFF: 'View diff comparison',
  TAB_EXPLAIN: 'View detailed explanation',
  TAB_OVERVIEW: 'View optimization overview',
  LANGUAGE_SELECT: 'Select programming language',
  FOCUS_SELECT: 'Select optimization focus',
  FAST_MODE_TOGGLE: 'Toggle fast optimization mode',
  STREAMING_CODE: 'Real-time optimized code preview',
} as const;

export const STATUS_ICONS = {
  PENDING: '⏳',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  CONFIDENCE_HIGH: '⚡',
  CONFIDENCE_MEDIUM: '💡',
  CONFIDENCE_LOW: '🔍',
} as const;
