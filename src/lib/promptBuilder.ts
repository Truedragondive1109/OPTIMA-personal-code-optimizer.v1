import type { StaticAnalysis } from './staticAnalyzer';

export type { StaticAnalysis };

export type OptimizationFocus = 'performance' | 'readability' | 'security' | 'best-practices' | 'all';

export interface OptimizationResult {
    algorithm: string;
    complexity_before: string;
    complexity_after: string;
    bottleneck: string;
    bottleneck_summary?: string;
    strategy: string;
    optimization_strategy: string;
    tradeoffs: string;
    estimated_improvement: string;
    confidence: number;
    explanation: string;
    optimized_code: string;
    time_complexity?: string;
    time_complexity_after?: string;
    detected_patterns?: Array<{ type: string; description: string; severity: string }>;
    possible_optimizations?: Array<{ action: string; rationale: string; expectedImpact: string }>;
    static_confidence_score?: number;
    _parsed: boolean;
    _no_change: boolean;
    _c_language?: boolean;
    _parse_warning?: string;
}

const FULLY_SUPPORTED = new Set(['JavaScript', 'TypeScript', 'Python', 'Java', 'C++']);

export function isFullySupported(language: string): boolean {
    return FULLY_SUPPORTED.has(language);
}

function normalizeCode(code: string): string {
    return code
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .trim();
}

// ---------------------------------------------------------------------------
// Prompt building
//
// Small LLMs (< 1B params) respond best to:
//   1. Short, direct system prompts — long rule lists cause them to lose focus
//   2. A concrete few-shot example showing input → output format exactly
//   3. Explicit output markers so extraction is robust
//   4. Ending the prompt right before where the model should start writing
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fix 4: Per-language few-shot examples.
// Small LLMs anchor their output format on the example, so the language must
// match the actual input to avoid JS/Python syntax bleed.
// ---------------------------------------------------------------------------

const FEW_SHOT_EXAMPLES: Record<string, string> = {
    JavaScript: `
### EXAMPLE
Input:
\`\`\`javascript
function add(a, b) {
  var result = a + b;
  var unused = 0;
  return result;
}
\`\`\`
Output:
\`\`\`javascript
function add(a, b) {
  const result = a + b;
  return result;
}
\`\`\`
### END EXAMPLE`.trim(),

    TypeScript: `
### EXAMPLE
Input:
\`\`\`typescript
function getNames(users: Array<{ name: string }>): string[] {
  var result: string[] = [];
  for (var i = 0; i < users.length; i++) {
    result.push(users[i].name);
  }
  return result;
}
\`\`\`
Output:
\`\`\`typescript
function getNames(users: Array<{ name: string }>): string[] {
  return users.map(u => u.name);
}
\`\`\`
### END EXAMPLE`.trim(),

    Python: `
### EXAMPLE
Input:
\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
\`\`\`
Output:
\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        swapped = False
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr
\`\`\`
### END EXAMPLE`.trim(),

    Java: `
### EXAMPLE
Input:
\`\`\`java
public int sumArray(int[] arr) {
    int sum = 0;
    for (int i = 0; i < arr.length; i++) {
        sum = sum + arr[i];
    }
    return sum;
}
\`\`\`
Output:
\`\`\`java
public int sumArray(int[] arr) {
    int sum = 0;
    for (int val : arr) {
        sum += val;
    }
    return sum;
}
\`\`\`
### END EXAMPLE`.trim(),

    'C++': `
### EXAMPLE
Input:
\`\`\`cpp
int findMax(std::vector<int>& v) {
    int max = v[0];
    for (int i = 1; i < v.size(); i++) {
        if (v[i] > max) max = v[i];
    }
    return max;
}
\`\`\`
Output:
\`\`\`cpp
int findMax(const std::vector<int>& v) {
    return *std::max_element(v.begin(), v.end());
}
\`\`\`
### END EXAMPLE`.trim(),
};

/** Returns the few-shot example whose language matches the input code. */
function getFewShotExample(language: string): string {
    return FEW_SHOT_EXAMPLES[language] ?? FEW_SHOT_EXAMPLES['JavaScript'];
}

// Map language names to their fenced-code-block identifiers
const FENCE_TAG: Record<string, string> = {
    JavaScript:  'javascript',
    TypeScript:  'typescript',
    Python:      'python',
    Java:        'java',
    'C++':       'cpp',
};


const SYSTEM_PROMPT = `You are an expert code optimizer specializing in conservative, performance-focused improvements. You work with the Qwen2.5 model, which excels at understanding code patterns and making precise optimizations.

Your core principles:
1. **Preserve functionality** - Never break existing logic
2. **Minimal changes** - Only modify what clearly improves performance
3. **Maintain readability** - Keep code clean and understandable
4. **Focus on bottlenecks** - Target actual performance issues
5. **Respect language idioms** - Use language-appropriate patterns

Optimization priorities (in order):
1. Algorithmic improvements (O(n²) → O(n), etc.)
2. Memory usage optimization
3. Loop efficiency
4. Redundant operation removal
5. Modern language features

Always return complete, valid code. If no meaningful optimization is possible, return the original code unchanged.`;

export function buildStructuredPrompt(
    code: string,
    analysis: StaticAnalysis,
    focus: OptimizationFocus,
): { fullPrompt: string; systemPrompt: string; userPrompt: string } {
    const focusMap: Record<OptimizationFocus, string> = {
        performance:      'improve speed and reduce complexity',
        readability:      'improve clarity and naming',
        security:         'fix security issues',
        'best-practices': 'apply cleaner patterns',
        all:              'improve overall quality',
    };
    const focusHint = focusMap[focus];
    const lang = analysis.language || 'JavaScript';

    // Fix 4: pick the example that matches the actual input language
    const fewShotExample = getFewShotExample(lang);
    const fenceTag = FENCE_TAG[lang] ?? lang.toLowerCase();

    // Few-shot example teaches the model the exact output format
    const userPrompt = `${fewShotExample}

### YOUR TASK
Optimize this ${lang} (focus: ${focusHint}).
Return COMPLETE code in a fenced code block. Do not cut it off.

Input:
\`\`\`${fenceTag}
${code}
\`\`\`
Output:`;

    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;
    return { fullPrompt, systemPrompt: SYSTEM_PROMPT, userPrompt };
}

export function buildPrompt(
    code: string,
    _language: string,
    focus: OptimizationFocus,
    meta: StaticAnalysis,
): string {
    const { fullPrompt } = buildStructuredPrompt(code, meta, focus);
    return fullPrompt;
}

// ---------------------------------------------------------------------------
// Code element extraction — used for validation
// ---------------------------------------------------------------------------

function extractCriticalElements(code: string): {
    variables: Set<string>;
    functions: Set<string>;
    classes: Set<string>;
    imports: Set<string>;
} {
    const variables = new Set<string>();
    const functions = new Set<string>();
    const classes   = new Set<string>();
    const imports   = new Set<string>();

    for (const line of code.split('\n')) {
        const trimmed = line.trim();

        // JS/TS variable declarations
        const varMatch = trimmed.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (varMatch) variables.add(varMatch[1]);

        // Fix 6: multi-language function detection (single valid JS regex)
        //   Group 1 — JS/TS:  function foo(
        //   Group 2 — Python: def foo(
        //   Group 3 — JS/TS:  foo = function | foo = (...) =>
        //   Group 4 — Java/C++: [modifiers] returnType methodName(
        const funcMatch = trimmed.match(
            /(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function|\([^)]*\)\s*=>)|(?:(?:public|private|protected|static|final|synchronized|override|inline|virtual|explicit)\s+)+[\w<>\[\]*&:]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\()/
        );
        if (funcMatch) {
            const funcName = funcMatch[1] || funcMatch[2] || funcMatch[3] || funcMatch[4];
            if (funcName) functions.add(funcName);
        }

        // class detection: JS/TS/Java/C++/Python all use `class Name`
        const classMatch = trimmed.match(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (classMatch) classes.add(classMatch[1]);

        // JS/TS ES-module imports
        const importMatch = trimmed.match(/import\s+.*?from\s+['"]([^'"]+)['"]/);
        if (importMatch) imports.add(importMatch[1]);

        // Python imports: `import foo` / `from foo import bar`
        const pyImportMatch = trimmed.match(/^(?:from\s+(\S+)\s+)?import\s+(\S+)/);
        if (pyImportMatch) imports.add(pyImportMatch[1] ?? pyImportMatch[2]);

        // Java/C++ includes: `import java.util.*` / `#include <vector>`
        const javaImportMatch = trimmed.match(/^import\s+([\w.]+)/);
        if (javaImportMatch) imports.add(javaImportMatch[1]);
        const cppIncludeMatch = trimmed.match(/^#include\s*[<"]([^>"]+)[>"]/);
        if (cppIncludeMatch) imports.add(cppIncludeMatch[1]);
    }

    return { variables, functions, classes, imports };
}

function validateElementPreservation(
    original: string,
    optimized: string,
): {
    missingVariables: string[];
    missingFunctions: string[];
    missingClasses: string[];
    missingImports: string[];
} {
    const orig = extractCriticalElements(original);
    const opt  = extractCriticalElements(optimized);

    return {
        missingVariables: Array.from(orig.variables).filter(v => !opt.variables.has(v)),
        missingFunctions: Array.from(orig.functions).filter(f => !opt.functions.has(f)),
        missingClasses:   Array.from(orig.classes).filter(c  => !opt.classes.has(c)),
        missingImports:   Array.from(orig.imports).filter(i  => !opt.imports.has(i)),
    };
}

// ---------------------------------------------------------------------------
// Similarity score — what fraction of original lines survived
// ---------------------------------------------------------------------------

function calculateCodeSimilarity(original: string, optimized: string): number {
    const origLines = original.trim().split('\n').filter(l => l.trim());
    const optLines  = optimized.trim().split('\n').filter(l => l.trim());

    if (origLines.length === 0 || optLines.length === 0) return 0;

    let matchingLines = 0;
    const minLength = Math.min(origLines.length, optLines.length);

    for (let i = 0; i < minLength; i++) {
        const o = origLines[i].trim();
        const p = optLines[i].trim();
        if (
            o === p ||
            (o.length > 10 && p.length > 10 &&
                (o.includes(p.substring(0, 10)) || p.includes(o.substring(0, 10))))
        ) {
            matchingLines++;
        }
    }

    const lengthRatio = minLength / Math.max(origLines.length, optLines.length);
    return Math.round((matchingLines / Math.max(origLines.length, optLines.length)) * lengthRatio * 100);
}

// ---------------------------------------------------------------------------
// Bracket / brace balance repair
//
// Small models often truncate mid-block. This appends missing closing brackets
// so the code at least parses rather than throwing a hard syntax error.
// ---------------------------------------------------------------------------

function repairTruncatedCode(code: string): { repaired: string; wasRepaired: boolean } {
    const stack: string[] = [];
    const openers: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
    const closers = new Set(['}', ')', ']']);
    let inString   = false;
    let stringChar = '';

    for (let i = 0; i < code.length; i++) {
        const ch = code[i];

        if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
            inString   = true;
            stringChar = ch;
        } else if (inString && ch === stringChar && code[i - 1] !== '\\') {
            inString = false;
        } else if (!inString) {
            if (openers[ch]) {
                stack.push(openers[ch]);
            } else if (closers.has(ch) && stack.length > 0 && stack[stack.length - 1] === ch) {
                stack.pop();
            }
        }
    }

    if (stack.length === 0) return { repaired: code, wasRepaired: false };

    const suffix = stack.reverse().join('\n');
    return { repaired: code.trimEnd() + '\n' + suffix, wasRepaired: true };
}

// ---------------------------------------------------------------------------
// Truncation detection
// ---------------------------------------------------------------------------

function isCodeTruncated(code: string): boolean {
    const t = code.trimEnd();
    return (
        t.endsWith('...') ||
        t.endsWith('..') ||
        t.endsWith('->') ||
        /\b(if|for|while|function|class|def|struct)\s*$/.test(t) ||
        /[{(\[]\s*$/.test(t)
    );
}

// ---------------------------------------------------------------------------
// Code extraction from raw LLM output
// ---------------------------------------------------------------------------

function extractCode(rawText: string): string | null {
    let text = rawText.trim();
    if (!text) return null;

    // Strip preamble lines the model tends to emit before the code block
    text = text.replace(
        /^(?:here\s+is|below\s+is|the\s+optimized|optimized\s+(?:code|version)|output|result|answer|fixed|improved)[^\n]*:\s*\n/i,
        '',
    ).trim();

    // ── Strategy 1: complete fenced block ───────────────────────────────────
    const fencedComplete = text.match(/```[\w]*\s*\n([\s\S]*?)```/);
    if (fencedComplete) return fencedComplete[1].trim();

    // ── Strategy 2: truncated fenced block (model cut off before closing ```)
    const fencedOpen = text.match(/```[\w]*\s*\n([\s\S]+)$/);
    if (fencedOpen) {
        const candidate = fencedOpen[1].trim();
        if (candidate.length > 10) return candidate; // will be sent through repair
    }

    // ── Strategy 3: inline backtick ─────────────────────────────────────────
    const inlineCode = text.match(/^`([^`]+)`\s*$/);
    if (inlineCode) return inlineCode[1].trim();

    // ── Strategy 4: raw text ────────────────────────────────────────────────
    // Do NOT strip comment lines — // and /* are valid code.
    // Only drop lines that are clearly natural-language prose sentences.
    const lines = text.split('\n');
    const codeLines = lines.filter(line => {
        const t = line.trim();
        if (!t) return false;
        // A line that looks like a sentence (capital word, multiple words, ends with punctuation)
        // and contains no code-like characters is likely prose
        const looksLikeProse =
            /^[A-Z][a-z]+(?:\s+[a-z]+){2,}[.!?]\s*$/.test(t) &&
            !/[{}()[\];=<>/*]/.test(t);
        return !looksLikeProse;
    });

    const candidate = codeLines.join('\n').trim();
    return candidate || null;
}

// ---------------------------------------------------------------------------
// Main normalizer — turns raw LLM text into a validated OptimizationResult
// ---------------------------------------------------------------------------

export function normalizeLLMOutput(
    rawText: string,
    originalCode: string,
    analysis: StaticAnalysis,
    language?: string,
): OptimizationResult {
    const lang = language || analysis.language;
    const isC  = lang === 'C';

    const enrichment = {
        detected_patterns:       analysis.detected_patterns,
        possible_optimizations:  analysis.possible_optimizations,
        static_confidence_score: analysis.confidence_score,
        _c_language: isC || undefined,
    };

    // ── Step 1: extract code ─────────────────────────────────────────────────
    let extracted = extractCode(rawText);

    if (!extracted) {
        return makeFallback(originalCode, isC, enrichment, analysis,
            'Could not extract any code from model output.');
    }

    // ── Step 2: repair truncation ────────────────────────────────────────────
    let parseWarning: string | undefined;

    if (isCodeTruncated(extracted) || repairTruncatedCode(extracted).wasRepaired) {
        const { repaired, wasRepaired } = repairTruncatedCode(extracted);
        if (wasRepaired) {
            extracted    = repaired;
            parseWarning = 'Model output was truncated; missing closing brackets were appended automatically.';
        } else {
            return makeFallback(originalCode, isC, enrichment, analysis,
                'Model output was truncated and could not be repaired; original code preserved.');
        }
    }

    // ── Step 3: size sanity check ────────────────────────────────────────────
    // A small model legitimately produces shorter output — it removes blank lines,
    // condenses verbose code, or strips redundant comments. We must NOT reject
    // based on raw line count alone, which caused many false positives.
    //
    // We count only "meaningful" lines: non-blank, non-comment, non-lone-brace.
    // The acceptable drop threshold scales with code size:
    //   - Small code (≤ 10 meaningful lines): allow down to 1 line (model may
    //     genuinely collapse a 10-line verbose snippet to 2-3 clean lines)
    //   - Medium code (11–40 lines): allow down to 30% of original
    //   - Large code (> 40 lines): allow down to 40% of original
    // Only reject if the output is suspiciously tiny AND element checks below
    // don't catch the specific problem first.
    const countMeaningfulLines = (code: string) =>
        code.split('\n').filter(l => {
            const t = l.trim();
            return t.length > 0
                && !t.startsWith('//')
                && !t.startsWith('#')
                && !t.startsWith('*')
                && t !== '{'
                && t !== '}';
        }).length;

    const origMeaningful = countMeaningfulLines(originalCode);
    const optMeaningful  = countMeaningfulLines(extracted);

    const sizeThreshold = origMeaningful <= 10 ? 0.10
                        : origMeaningful <= 40 ? 0.30
                        : 0.40;

    const meaningfulRatio = origMeaningful > 0 ? optMeaningful / origMeaningful : 1;

    if (meaningfulRatio < sizeThreshold) {
        return makeFallback(originalCode, isC, enrichment, analysis,
            `Model output appears severely truncated (${optMeaningful} meaningful lines vs ${origMeaningful}); original preserved.`);
    }

    // ── Step 4: element preservation check ──────────────────────────────────
    const ev = validateElementPreservation(originalCode, extracted);

    // Trivial single-char or common loop/temp variable names that models
    // routinely inline — we do not count these as "missing" elements.
    const isTrivialVar = (name: string) => /^[a-z]$/.test(name) || ['i','j','k','n','m','x','y','z','tmp','temp','idx','len','val','res','ret','err','ok','cb'].includes(name);

    const meaningfulMissingVars = ev.missingVariables.filter(v => !isTrivialVar(v));
    const missingParts = [
        meaningfulMissingVars.length    > 0 ? `${meaningfulMissingVars.length} variable(s): ${meaningfulMissingVars.join(', ')}` : null,
        ev.missingFunctions.length      > 0 ? `${ev.missingFunctions.length} function(s): ${ev.missingFunctions.join(', ')}` : null,
        ev.missingClasses.length        > 0 ? `${ev.missingClasses.length} class(es): ${ev.missingClasses.join(', ')}` : null,
        ev.missingImports.length        > 0 ? `${ev.missingImports.length} import(s): ${ev.missingImports.join(', ')}` : null,
    ].filter(Boolean) as string[];

    if (missingParts.length > 0) {
        return makeFallback(originalCode, isC, enrichment, analysis,
            `Model dropped critical elements (${missingParts.join('; ')}); original code preserved to prevent data loss.`);
    }

    // ── Step 5: similarity check ─────────────────────────────────────────────
    const similarity = calculateCodeSimilarity(originalCode, extracted);
    const noChange   = normalizeCode(extracted) === normalizeCode(originalCode);

    // Fix 5: algorithm-aware similarity threshold.
    // Sorting/searching algorithms get legitimately restructured (e.g. bubble→timsort),
    // so a hard 50% floor wrongly rejects valid output. Lower it for detected algos.
    const isSortOrSearch =
        /sort|search|merge|partition|heap|bfs|dfs|binary/i.test(analysis.detected_algorithm ?? '');
    const similarityThreshold = isSortOrSearch ? 25 : 35;

    if (similarity < similarityThreshold && !noChange) {
        return makeFallback(originalCode, isC, enrichment, analysis,
            `Optimized code similarity too low (${similarity}%) — likely hallucination; original preserved.`);
    }

    // ── Step 6: build successful result ──────────────────────────────────────
    const explanation = noChange
        ? 'Code is already well-optimized. No meaningful changes found.'
        : `Applied conservative optimization (${similarity}% similarity preserved). ${buildExplanation(analysis)}`;

    let confidence = noChange ? 100 : Math.round(analysis.confidence_score * 100);
    if (isC && confidence > 70 && !noChange) confidence = 70;
    if (similarity < 80) confidence = Math.min(confidence, 60);
    if (parseWarning)    confidence = Math.min(confidence, 50); // repaired code is less certain

    const strategy = noChange
        ? 'No change needed'
        : (analysis.possible_optimizations[0]?.action || 'Conservative optimization applied');

    return {
        algorithm:               analysis.detected_algorithm || 'Custom Logic',
        complexity_before:       analysis.estimated_complexity || 'Unknown',
        complexity_after:        noChange
                                    ? (analysis.estimated_complexity || 'Unknown')
                                    : estimateImprovedComplexity(analysis),
        bottleneck:              analysis.detected_patterns[0]?.description || 'None detected',
        strategy,
        optimization_strategy:   strategy,
        tradeoffs:               'None',
        estimated_improvement:   noChange ? 'No measurable improvement' : estimateImprovement(analysis),
        confidence,
        explanation,
        optimized_code:          extracted,
        detected_patterns:       enrichment.detected_patterns,
        possible_optimizations:  enrichment.possible_optimizations,
        static_confidence_score: enrichment.static_confidence_score,
        _parsed:                 true,
        _no_change:              noChange,
        _c_language:             enrichment._c_language,
        ...(parseWarning ? { _parse_warning: parseWarning } : {}),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildExplanation(analysis: StaticAnalysis): string {
    const parts: string[] = [];

    if (analysis.detected_patterns.length > 0) {
        const highSev = analysis.detected_patterns.filter(p => p.severity === 'high');
        if (highSev.length > 0) {
            parts.push(`Fixed ${highSev.length} high-severity issue(s): ${highSev.map(p => p.description).join(', ')}.`);
        } else {
            parts.push(`Improved ${analysis.detected_patterns.length} detected pattern(s).`);
        }
    }

    if (analysis.possible_optimizations.length > 0) {
        parts.push(`Applied: ${analysis.possible_optimizations[0].action}.`);
    }

    return parts.join(' ') || 'Performance optimization applied.';
}

function estimateImprovedComplexity(analysis: StaticAnalysis): string {
    const current = analysis.estimated_complexity;
    if (current.includes('n²') || current.includes('n^2') || current.includes('nÂ²')) return 'O(n)';
    if (current.includes('n³') || current.includes('n^3') || current.includes('nÂ³')) return 'O(n²)';
    if (current.includes('n log n')) return 'O(n)';
    return current;
}

function estimateImprovement(analysis: StaticAnalysis): string {
    const hasHigh   = analysis.detected_patterns.some(p => p.severity === 'high');
    const hasMedium = analysis.detected_patterns.some(p => p.severity === 'medium');
    if (hasHigh)   return 'Significant - reduced time complexity';
    if (hasMedium) return 'Moderate - improved efficiency';
    return 'Minor optimization applied';
}

function makeFallback(
    originalCode: string,
    isC: boolean,
    enrichment: {
        detected_patterns?: OptimizationResult['detected_patterns'];
        possible_optimizations?: OptimizationResult['possible_optimizations'];
        static_confidence_score?: number;
        _c_language?: boolean;
    },
    analysis: StaticAnalysis,
    warn: string,
): OptimizationResult {
    return {
        algorithm:               analysis.detected_algorithm || 'Custom Logic',
        complexity_before:       analysis.estimated_complexity || 'Unknown',
        complexity_after:        analysis.estimated_complexity || 'Unknown',
        bottleneck:              analysis.detected_patterns[0]?.description || 'None detected',
        strategy:                'Fallback - original preserved',
        optimization_strategy:   'Fallback - original preserved',
        tradeoffs:               'None',
        estimated_improvement:   'No measurable improvement',
        confidence:              0,
        explanation:             warn,
        optimized_code:          originalCode,
        detected_patterns:       enrichment.detected_patterns,
        possible_optimizations:  enrichment.possible_optimizations,
        static_confidence_score: enrichment.static_confidence_score,
        _parsed:                 false,
        _no_change:              true,
        _c_language:             isC || undefined,
        _parse_warning:          warn,
    };
}