/**
 * staticAnalyzer.ts — Deterministic, zero-latency code pre-analysis.
 *
 * Stage 1 of the OPTIMA Hybrid Pipeline:
 *
 *   staticAnalyzer  →  structuredPrompt  →  LLM  →  validator  →  UI
 *
 * This module produces a `StaticAnalysis` report that:
 *  - Classifies detected patterns with concrete evidence
 *  - Estimates algorithmic complexity
 *  - Lists specific, actionable optimization suggestions
 *  - Computes an optimizability confidence score (0–1)
 *  - Signals `is_optimizable` for the early-exit gate
 *
 * All analysis runs synchronously in <50ms for typical code sizes.
 * No LLM, no network, no I/O.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A single detected anti-pattern or structural issue. */
export interface DetectedPattern {
  type:
  | 'nested_loops'
  | 'repeated_computation'
  | 'inefficient_data_structure'
  | 'redundant_condition'
  | 'string_concat_in_loop'
  | 'n_plus_one_query'
  | 'unnecessary_recomputation'
  | 'missing_early_exit'
  | 'excessive_nesting'
  | 'large_function';
  description: string;
  /** Estimated severity for priority ranking */
  severity: 'high' | 'medium' | 'low';
  /** Line range where issue was detected (approximate) */
  lineHint?: string;
}

/** A concrete optimization suggestion tied to detected patterns. */
export interface OptimizationSuggestion {
  action: string;           // e.g. "Replace array lookup with hash set"
  rationale: string;        // e.g. "Eliminates O(n) scan inside O(n) loop"
  expectedImpact: 'high' | 'medium' | 'low';
}

/** Full static analysis report — the input to buildStructuredPrompt(). */
export interface StaticAnalysis {
  // Core facts
  lineCount: number;
  charCount: number;
  functionCount: number;
  loopCount: number;
  nestingDepth: number;
  language: string;

  // Pattern classification
  detected_patterns: DetectedPattern[];

  // Complexity estimation
  estimated_complexity: string;   // Big-O string, e.g. "O(n²)"
  detected_algorithm: string;     // e.g. "Bubble Sort", "Custom Logic"

  // Actionable hints
  possible_optimizations: OptimizationSuggestion[];

  // Optimizability signal
  confidence_score: number;       // 0.0–1.0
  is_optimizable: boolean;        // gate: false → early exit before LLM

  // Chunking for long code
  chunks: string[];
  isTruncated: boolean;
}

/**
 * Legacy alias kept for backward compatibility with any consumers
 * that still import StaticMeta by name.
 */
export type StaticMeta = StaticAnalysis;

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 3_200; // chars per LLM chunk

// ─────────────────────────────────────────────────────────────────────────────
// Algorithm heuristics
// ─────────────────────────────────────────────────────────────────────────────

interface AlgoPattern {
  pattern: RegExp;
  label: string;
  complexity: string;
}

const ALGO_PATTERNS: AlgoPattern[] = [
  { pattern: /quicksort|partition|pivot/i, label: 'Quick Sort', complexity: 'O(n log n) avg' },
  { pattern: /mergesort|merge_sort|merge\s*\(/i, label: 'Merge Sort', complexity: 'O(n log n)' },
  { pattern: /heapsort|heap_sort|heapify/i, label: 'Heap Sort', complexity: 'O(n log n)' },
  { pattern: /bubblesort|bubble_sort/i, label: 'Bubble Sort', complexity: 'O(n²)' },
  { pattern: /insertionsort|insertion_sort/i, label: 'Insertion Sort', complexity: 'O(n²)' },
  { pattern: /selectionsort|selection_sort/i, label: 'Selection Sort', complexity: 'O(n²)' },
  { pattern: /binarysearch|binary_search/i, label: 'Binary Search', complexity: 'O(log n)' },
  { pattern: /\bbfs\b|breadth.first/i, label: 'BFS', complexity: 'O(V+E)' },
  { pattern: /\bdfs\b|depth.first/i, label: 'DFS', complexity: 'O(V+E)' },
  { pattern: /dijkstra/i, label: "Dijkstra's", complexity: 'O((V+E) log V)' },
  { pattern: /dynamic.program|dp\[|memo\[|memoiz/i, label: 'Dynamic Programming', complexity: 'O(n²) typical' },
  { pattern: /fibonacci|fib\(/i, label: 'Fibonacci', complexity: 'O(2ⁿ) naive' },
  { pattern: /factorial/i, label: 'Factorial', complexity: 'O(n)' },
  { pattern: /hash.*map|hashmap|new Map\(/i, label: 'Hash Map Lookup', complexity: 'O(1) avg' },
  { pattern: /\.sort\s*\(/i, label: 'Array Sort', complexity: 'O(n log n)' },
  { pattern: /\.filter\s*\(|\.map\s*\(|\.reduce/i, label: 'Functional Pipeline', complexity: 'O(n)' },
  { pattern: /fetch\s*\(|axios\.|http\./i, label: 'HTTP/API Call', complexity: 'O(1) network' },
  { pattern: /regex|RegExp|\.match\(/i, label: 'Regex Processing', complexity: 'O(n·m) worst' },
  { pattern: /class\s+\w+|interface\s+\w+/i, label: 'OOP / Class Design', complexity: 'N/A' },
];

function detectAlgorithm(code: string): { label: string; complexity: string } {
  for (const { pattern, label, complexity } of ALGO_PATTERNS) {
    if (pattern.test(code)) return { label, complexity };
  }
  return { label: 'Custom Logic', complexity: 'Unknown' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural metrics
// ─────────────────────────────────────────────────────────────────────────────

interface StructuralMetrics {
  maxDepth: number;
  loopCount: number;
  loopNestingDepth: number;
  fnCount: number;
  lineCount: number;
}

function measureStructure(code: string): StructuralMetrics {
  const lines = code.split('\n');
  let depth = 0;
  let maxDepth = 0;
  let loopCount = 0;
  let fnCount = 0;

  let loopNestingDepth = 0;
  let loopDepthStack: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/\b(for|while|do)\b/.test(trimmed)) loopCount++;
    if (/\b(function|def |fn |=>\s*\{|async\s+\w+\s*\()/.test(trimmed)) fnCount++;

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Track loop nesting based on block depth at loop entry.
    // This avoids falsely inflating complexity due to non-loop braces.
    if (/\b(for|while|do)\b/.test(trimmed)) {
      loopDepthStack.push(depth);
      loopNestingDepth = Math.max(loopNestingDepth, loopDepthStack.length);
    }

    depth += opens - closes;
    if (depth > maxDepth) maxDepth = depth;

    // Remove loops whose scope has closed.
    loopDepthStack = loopDepthStack.filter(d => depth > d);
  }

  return { maxDepth, loopCount, loopNestingDepth, fnCount, lineCount: lines.length };
}

function detectRecursion(code: string): { isRecursive: boolean; isDivideAndConquer: boolean } {
  // Very lightweight heuristic:
  // - Find function names and see if they call themselves.
  // - If we see two+ self calls and mid/left/right-ish identifiers, assume divide-and-conquer.
  const fnNames = new Set<string>();

  const jsFn = code.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
  for (const m of jsFn) fnNames.add(m[1]);

  const pyFn = code.matchAll(/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
  for (const m of pyFn) fnNames.add(m[1]);

  // Simple TS/JS method-style: name(...) { ... }
  const methodFn = code.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/gm);
  for (const m of methodFn) fnNames.add(m[1]);

  let isRecursive = false;
  let isDivideAndConquer = false;
  for (const name of fnNames) {
    const callRe = new RegExp(`\\b${name}\\s*\\(`, 'g');
    const callCount = (code.match(callRe) || []).length;
    // One match is the definition itself for `function name(` / `def name(`.
    if (callCount >= 2) {
      isRecursive = true;
      const midLike = /\b(mid|middle|pivot|left|right|lo|hi)\b/i.test(code);
      if (callCount >= 3 && midLike) {
        isDivideAndConquer = true;
      }
      break;
    }
  }

  return { isRecursive, isDivideAndConquer };
}

function estimateComplexityFromMetrics(
  loopCount: number,
  loopNestingDepth: number,
  algoComplexity: string,
  recursion: { isRecursive: boolean; isDivideAndConquer: boolean },
): string {
  if (algoComplexity !== 'Unknown') return algoComplexity;

  // Recursion heuristics trump raw loop counts.
  if (recursion.isDivideAndConquer) return 'O(n log n) typical';
  if (recursion.isRecursive) return 'O(n) to O(2ⁿ) (recursive)';

  if (loopNestingDepth >= 3) return 'O(n³) or worse';
  if (loopNestingDepth === 2) return 'O(n²)';
  if (loopCount >= 1) return 'O(n)';
  return 'O(1)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern detectors — each returns a DetectedPattern or null
// ─────────────────────────────────────────────────────────────────────────────

function detectNestedLoops(code: string): DetectedPattern | null {
  // Heuristic: two or more for/while on adjacent depth levels
  const lines = code.split('\n');
  let depth = 0;
  let loopDepthStack: number[] = [];
  let maxLoopDepth = 0;

  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (/\b(for|while|do)\b/.test(line)) {
      loopDepthStack.push(depth);
      maxLoopDepth = Math.max(maxLoopDepth, loopDepthStack.length);
    }
    depth += opens - closes;
    // Remove loops whose scope has closed
    loopDepthStack = loopDepthStack.filter(d => depth > d);
  }

  if (maxLoopDepth >= 2) {
    return {
      type: 'nested_loops',
      description: `Nested loops detected (depth ${maxLoopDepth}) — likely O(n${maxLoopDepth > 2 ? '³' : '²'}) behaviour`,
      severity: maxLoopDepth >= 3 ? 'high' : 'medium',
    };
  }
  return null;
}

function detectRepeatedComputation(code: string): DetectedPattern | null {
  // Heuristic: same method call appears 3+ times or .length/.size inside a loop
  const insideLoopLength = /\b(for|while)\b[^{]*\{[^}]*(\.length|\.size\(\)|\.count\(\))[^}]*}/s.test(code);
  const repeatedCall = (() => {
    const calls = code.match(/\b\w+\.\w+\([^)]*\)/g) || [];
    const seen = new Map<string, number>();
    for (const c of calls) { seen.set(c, (seen.get(c) || 0) + 1); }
    return [...seen.entries()].some(([, count]) => count >= 3);
  })();

  if (insideLoopLength || repeatedCall) {
    return {
      type: 'repeated_computation',
      description: insideLoopLength
        ? 'Array .length / .size() called inside loop body — cache before loop'
        : 'Same expression computed 3+ times — consider caching result',
      severity: 'medium',
    };
  }
  return null;
}

function detectInefficientDataStructure(code: string): DetectedPattern | null {
  // Array used where Set/Map would give O(1)
  const arrayIncludes = /\.includes\s*\(|\.indexOf\s*\(/.test(code);
  const linearSearch = /for\s*\([^)]+\)\s*\{[^}]*===?\s*\w+/s.test(code);

  if (arrayIncludes && linearSearch) {
    return {
      type: 'inefficient_data_structure',
      description: 'Array.includes/indexOf used for membership test — a Set would give O(1) lookup',
      severity: 'high',
    };
  }
  if (arrayIncludes) {
    return {
      type: 'inefficient_data_structure',
      description: 'Array.includes() for lookup — consider Set for O(1) membership checks',
      severity: 'medium',
    };
  }
  return null;
}

function detectRedundantConditions(code: string): DetectedPattern | null {
  // Double-negation, always-true/false trivial conditions
  const doubleNegation = /!\s*!\s*\w+/.test(code);
  const trivialTrueFalse = /if\s*\(\s*(true|false)\s*\)/.test(code);
  const redundantElse = /return\s+[^;]+;\s*\}\s*else\s*\{/.test(code);

  if (doubleNegation || trivialTrueFalse || redundantElse) {
    let desc = '';
    if (doubleNegation) desc = 'Double negation (!!) detected — simplify condition';
    else if (trivialTrueFalse) desc = 'Trivial always-true/false condition found';
    else desc = 'Redundant else after return — early exit already handled';
    return { type: 'redundant_condition', description: desc, severity: 'low' };
  }
  return null;
}

function detectStringConcatInLoop(code: string): DetectedPattern | null {
  // String += inside for/while loop
  const concat = /\b(for|while)\b[^{]*\{[^}]*\+=\s*["'`]/s.test(code);
  if (concat) {
    return {
      type: 'string_concat_in_loop',
      description: 'String concatenation inside loop — use array.join() or StringBuilder equivalent',
      severity: 'high',
    };
  }
  return null;
}

function detectExcessiveNesting(code: string, maxDepth: number): DetectedPattern | null {
  if (maxDepth >= 5) {
    return {
      type: 'excessive_nesting',
      description: `Nesting depth of ${maxDepth} detected — extract helpers or use early returns`,
      severity: maxDepth >= 7 ? 'high' : 'medium',
    };
  }
  return null;
}

function detectLargeFunction(code: string, lineCount: number): DetectedPattern | null {
  // Single function body > 80 lines
  const fnBodyMatch = code.match(/\bfunction\s+\w+[^{]*\{([\s\S]*?)\}/);
  if (fnBodyMatch) {
    const bodyLines = fnBodyMatch[1].split('\n').length;
    if (bodyLines > 80) {
      return {
        type: 'large_function',
        description: `Function body of ~${bodyLines} lines — consider splitting into smaller, focused functions`,
        severity: 'medium',
      };
    }
  }
  // Also flag if entire code is very long without function boundaries
  if (lineCount > 200) {
    return {
      type: 'large_function',
      description: `Large code block (${lineCount} lines) — modularization may improve maintainability`,
      severity: 'low',
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimization suggestions — derived from patterns
// ─────────────────────────────────────────────────────────────────────────────

function buildSuggestions(patterns: DetectedPattern[], complexity: string): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  for (const p of patterns) {
    switch (p.type) {
      case 'nested_loops':
        suggestions.push({
          action: 'Flatten or eliminate inner loop using a hash map / precomputed lookup',
          rationale: 'Replaces O(n²) nested iteration with O(n) traversal',
          expectedImpact: 'high',
        });
        break;
      case 'repeated_computation':
        suggestions.push({
          action: 'Cache repeated computation in a local variable before the loop',
          rationale: 'Avoids redundant evaluation of the same expression on each iteration',
          expectedImpact: 'medium',
        });
        break;
      case 'inefficient_data_structure':
        suggestions.push({
          action: 'Replace Array.includes/indexOf membership test with a Set',
          rationale: 'Set.has() is O(1) vs Array.includes() which is O(n)',
          expectedImpact: 'high',
        });
        break;
      case 'redundant_condition':
        suggestions.push({
          action: 'Simplify redundant conditional logic or use early return pattern',
          rationale: 'Reduces cognitive load and may eliminate dead branches',
          expectedImpact: 'low',
        });
        break;
      case 'string_concat_in_loop':
        suggestions.push({
          action: 'Collect into an array and join once after the loop',
          rationale: 'Avoids O(n²) string copying from repeated concatenation',
          expectedImpact: 'high',
        });
        break;
      case 'excessive_nesting':
        suggestions.push({
          action: 'Extract inner blocks into named helper functions, use guard clauses',
          rationale: 'Reduces cognitive overhead and makes control flow testable in isolation',
          expectedImpact: 'medium',
        });
        break;
      case 'large_function':
        suggestions.push({
          action: 'Decompose into smaller functions with single responsibilities',
          rationale: 'Improves readability, testability, and reusability',
          expectedImpact: 'low',
        });
        break;
    }
  }

  // Complexity-driven suggestion
  if (/O\(n[²³2³]\)|O\(n\^[23]\)|worse/.test(complexity) && !suggestions.some(s => s.action.includes('hash'))) {
    suggestions.push({
      action: 'Look for opportunities to use hash-based lookups (Map/Set) to reduce complexity',
      rationale: `Current complexity is ${complexity} — hash structures may bring it to O(n)`,
      expectedImpact: 'high',
    });
  }

  return suggestions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence score computation
// ─────────────────────────────────────────────────────────────────────────────

function computeConfidence(
  patterns: DetectedPattern[],
  suggestions: OptimizationSuggestion[],
  complexity: string,
  lineCount: number,
): number {
  let score = 0.0;

  // Pattern weight
  for (const p of patterns) {
    if (p.severity === 'high') score += 0.25;
    else if (p.severity === 'medium') score += 0.15;
    else score += 0.05;
  }

  // Complexity bonus
  if (/O\(n[²³]|worse|O\(2/.test(complexity)) score += 0.25;
  else if (/O\(n\^?2\)/.test(complexity)) score += 0.20;
  else if (/O\(n\)/.test(complexity)) score += 0.05;

  // Suggestion weight
  score += Math.min(suggestions.filter(s => s.expectedImpact === 'high').length * 0.15, 0.30);

  // Code size penalty for very tiny code (less to optimize)
  if (lineCount < 5) score *= 0.3;
  else if (lineCount < 10) score *= 0.6;

  return Math.min(parseFloat(score.toFixed(2)), 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Language detection fallback
// ─────────────────────────────────────────────────────────────────────────────

function detectLanguage(code: string): string {
  if (/def\s+\w+\s*\(|import\s+\w+\s*$|:\s*$/.test(code)) return 'Python';
  if (/fn\s+\w+\s*\(|let\s+mut\s+|println!/.test(code)) return 'Rust';
  if (/package\s+main|func\s+\w+\s*\(|fmt\./.test(code)) return 'Go';
  if (/::\w+|std::|->/g.test(code)) return 'C++';
  if (/#include\s*</.test(code)) return 'C';
  if (/public\s+class|System\.out\.println/.test(code)) return 'Java';
  if (/:\s*(string|number|boolean|any|void)\b/.test(code)) return 'TypeScript';
  return 'JavaScript';
}

// ─────────────────────────────────────────────────────────────────────────────
// Code chunking — split at natural function/class boundaries
// ─────────────────────────────────────────────────────────────────────────────

function chunkCode(code: string): string[] {
  if (code.length <= CHUNK_SIZE) return [code];

  const chunks: string[] = [];
  const lines = code.split('\n');
  let current = '';
  let inChunk = false;

  for (const line of lines) {
    const isBoundary = /^(function |class |def |fn |public |private |protected |export |async function )/.test(line.trim());

    if (isBoundary && inChunk && current.length > CHUNK_SIZE / 2) {
      chunks.push(current.trim());
      current = line + '\n';
    } else {
      current += line + '\n';
      if (current.length >= CHUNK_SIZE) {
        chunks.push(current.trim());
        current = '';
      }
    }
    inChunk = true;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [code.slice(0, CHUNK_SIZE)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — Stage 1 of the pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * analyzeCode — deterministic static analysis, runs in <50ms.
 *
 * Returns a `StaticAnalysis` report that drives:
 *  1. Early-exit decision (is_optimizable)
 *  2. Structured LLM prompt construction
 *  3. UI pattern cards in the Explain tab
 */
export function analyzeCode(code: string, selectedLanguage: string): StaticAnalysis {
  const { maxDepth, loopCount, loopNestingDepth, fnCount, lineCount } = measureStructure(code);
  const { label: algoLabel, complexity: algoComplexity } = detectAlgorithm(code);
  const recursion = detectRecursion(code);
  const estimated_complexity = estimateComplexityFromMetrics(loopCount, loopNestingDepth, algoComplexity, recursion);

  const language = selectedLanguage !== 'TypeScript'
    ? selectedLanguage
    : detectLanguage(code) || selectedLanguage;

  // Collect detected patterns
  const rawPatterns = [
    detectNestedLoops(code),
    detectRepeatedComputation(code),
    detectInefficientDataStructure(code),
    detectRedundantConditions(code),
    detectStringConcatInLoop(code),
    detectExcessiveNesting(code, maxDepth),
    detectLargeFunction(code, lineCount),
  ].filter((p): p is DetectedPattern => p !== null);

  const possible_optimizations = buildSuggestions(rawPatterns, estimated_complexity);
  const confidence_score = computeConfidence(rawPatterns, possible_optimizations, estimated_complexity, lineCount);

  // is_optimizable = true when we have high enough confidence AND something to work on
  const is_optimizable = confidence_score >= 0.5 && (rawPatterns.length > 0 || /O\(n[²³]|O\(2/.test(estimated_complexity));

  const chunks = chunkCode(code);

  return {
    lineCount,
    charCount: code.length,
    functionCount: fnCount,
    loopCount,
    nestingDepth: maxDepth,
    language,
    detected_patterns: rawPatterns,
    estimated_complexity,
    detected_algorithm: algoLabel,
    possible_optimizations,
    confidence_score,
    is_optimizable,
    chunks,
    isTruncated: chunks.length > 1,
  };
}
