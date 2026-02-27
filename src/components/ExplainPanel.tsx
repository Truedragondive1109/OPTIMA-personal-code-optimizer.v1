import type { OptimizationResult } from '../lib/promptBuilder';

interface Props {
    result: OptimizationResult | null;
    isLoading: boolean;
    /** When false, improvement % and performance section are hidden (confidence <70% or no-change) */
    shouldShowImprovement?: boolean;
}

function ComplexityBadge({ label, color }: { label: string; color: 'red' | 'green' | 'blue' | 'gray' }) {
    // Add non-color icons for colorblind accessibility
    const getIcon = (c: string) => {
        switch (c) {
            case 'green': return '✅'; // Excellent
            case 'blue': return '👍'; // Good
            case 'red': return '⚠️'; // Warning
            default: return 'ℹ️'; // Info
        }
    };
    
    const getAriaLabel = (c: string) => {
        switch (c) {
            case 'green': return 'Excellent complexity';
            case 'blue': return 'Good complexity';
            case 'red': return 'Poor complexity - optimization recommended';
            default: return 'Unspecified complexity';
        }
    };
    
    return (
        <span 
            className={`complexity-badge complexity-${color}`}
            aria-label={getAriaLabel(color)}
            title={getAriaLabel(color)}
        >
            {getIcon(color)} {label}
        </span>
    );
}

/**
 * Determine complexity color for UI display.
 * Also consider accessibility: colors alone are insufficient for colorblind users.
 * Pair with icons and text labels in ComplexityBadge component.
 */
function getComplexityColor(complexity: string | undefined): 'red' | 'green' | 'blue' | 'gray' {
    if (!complexity) return 'gray';
    if (/O\(1\)|O\(log n\)/i.test(complexity)) return 'green';
    if (/O\(n\)\b|O\(n log n\)/i.test(complexity)) return 'blue';
    if (/O\(n[²2]\)|O\(n\^2\)|O\(n[³3]\)|worse/i.test(complexity)) return 'red';
    return 'gray';
}

const SEVERITY_COLOR: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#6b7280',
};

const IMPACT_COLOR: Record<string, string> = {
    high: 'var(--success)',
    medium: '#f59e0b',
    low: 'var(--text-light)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Complexity panel — always shown, covers both time AND space
// Space complexity is derived deterministically from static analysis data.
// ─────────────────────────────────────────────────────────────────────────────

function deriveSpaceComplexity(result: OptimizationResult): string {
    const patterns = result.detected_patterns ?? [];
    const algo     = result.algorithm ?? '';
    const time     = result.complexity_before ?? '';

    // Algorithm-specific known space complexities
    if (/merge sort/i.test(algo))              return 'O(n)';
    if (/quick sort/i.test(algo))              return 'O(log n)';
    if (/heap sort/i.test(algo))               return 'O(1)';
    if (/bubble|insertion|selection sort/i.test(algo)) return 'O(1)';
    if (/binary search/i.test(algo))           return 'O(1)';
    if (/dynamic programming/i.test(algo))     return 'O(n²) typical';
    if (/fibonacci/i.test(algo))               return 'O(n) — O(1) if iterative';
    if (/bfs/i.test(algo))                     return 'O(V+E)';
    if (/dfs/i.test(algo))                     return 'O(V) stack';
    if (/dijkstra/i.test(algo))                return 'O(V+E)';
    if (/hash map|hashmap/i.test(algo))        return 'O(n)';
    if (/functional pipeline/i.test(algo))     return 'O(n)';
    if (/regex/i.test(algo))                   return 'O(m) pattern';

    // Pattern-based heuristics
    const hasNestedLoops   = patterns.some(p => p.type === 'nested_loops');
    const hasHashStructure = patterns.some(p => p.type === 'inefficient_data_structure');
    const hasStringConcat  = patterns.some(p => p.type === 'string_concat_in_loop');
    const hasLargeFunc     = patterns.some(p => p.type === 'large_function');

    if (hasHashStructure) return 'O(n)';
    if (hasStringConcat)  return 'O(n)';
    if (hasNestedLoops)   return 'O(1) extra';
    if (hasLargeFunc)     return 'O(n) stack';

    // Fall back to time-based guess
    if (/O\(n[²2³3]\)/i.test(time)) return 'O(n) extra';
    if (/O\(n\)/i.test(time))       return 'O(1)–O(n)';
    if (/O\(log n\)/i.test(time))   return 'O(log n)';
    if (/O\(1\)/i.test(time))       return 'O(1)';

    return 'O(1)–O(n)';
}

function getSpaceComplexityColor(space: string): 'red' | 'green' | 'blue' | 'gray' {
    if (/O\(1\)/i.test(space))       return 'green';
    if (/O\(log n\)/i.test(space))   return 'green';
    if (/O\(n\)/i.test(space))       return 'blue';
    if (/O\(n[²2³3]\)/i.test(space)) return 'red';
    return 'gray';
}

function complexityExplain(complexity: string): string {
    if (/O\(1\)/i.test(complexity))        return 'Constant — does not grow with input size.';
    if (/O\(log n\)/i.test(complexity))    return 'Logarithmic — grows very slowly. Excellent for large inputs.';
    if (/O\(n log n\)/i.test(complexity))  return 'Linearithmic — typical of efficient sorting. Good for large inputs.';
    if (/O\(n\)/i.test(complexity))        return 'Linear — grows proportionally with input size. Generally acceptable.';
    if (/O\(n[²2]\)/i.test(complexity))   return 'Quadratic — doubles in cost for every doubling of input. Avoid for large n.';
    if (/O\(n[³3]\)/i.test(complexity))   return 'Cubic — very slow for large inputs. Usually a sign of nested loops.';
    if (/O\(2[ⁿn]\)/i.test(complexity))   return 'Exponential — grows explosively. Only feasible for tiny inputs.';
    if (/O\(V\+E\)/i.test(complexity))    return 'Graph traversal — proportional to vertices plus edges.';
    return 'Complexity depends on input structure.';
}

function ComplexityPanel({ result, isNoChange }: { result: OptimizationResult; isNoChange: boolean }) {
    // Ensure we always have some complexity values, even if the analyzer fails
    const timeBefore  = result.complexity_before || 'O(n)';
    const timeAfter   = result.complexity_after || timeBefore;
    const space       = deriveSpaceComplexity(result);
    const beforeColor = getComplexityColor(timeBefore);
    const afterColor  = getComplexityColor(timeAfter);
    const spaceColor  = getSpaceComplexityColor(space);
    const changed     = !isNoChange && timeBefore !== timeAfter;

    // Debug: Log the values to see what we're working with
    console.log('ComplexityPanel Debug:', {
        timeBefore,
        timeAfter,
        space,
        beforeColor,
        afterColor,
        spaceColor,
        changed,
        isNoChange,
        complexity_before: result.complexity_before,
        complexity_after: result.complexity_after,
        result_keys: Object.keys(result)
    });

    // Always render the panel, even with fallback data
    return (
        <div style={{
            margin: '0 16px 16px',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
            background: 'var(--bg-secondary)',
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 14px',
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '8px',
            }}>
                <span aria-hidden="true">📊</span>
                <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text)' }}>Complexity Analysis</span>
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Time complexity row */}
                <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: 'var(--text-light)', marginBottom: '8px' }}
                        id="complexity-time"
                    >
                        <span aria-hidden="true">⏱</span> Time Complexity
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>
                                {changed ? 'Before' : 'Current'}
                            </span>
                            <ComplexityBadge label={timeBefore} color={beforeColor} />
                        </div>
                        {changed && (
                            <>
                                <span style={{ color: 'var(--text-light)', fontSize: '16px' }}>→</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>After</span>
                                    <ComplexityBadge label={timeAfter} color={afterColor} />
                                </div>
                            </>
                        )}
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {complexityExplain(changed ? timeAfter : timeBefore)}
                    </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border)' }} />

                {/* Space complexity row */}
                <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: 'var(--text-light)', marginBottom: '8px' }}
                        id="complexity-space"
                    >
                        <span aria-hidden="true">🗄</span> Space Complexity
                    </div>
                    <ComplexityBadge label={space} color={spaceColor} />
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {complexityExplain(space)}
                    </div>
                </div>

            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual suggestions — shown when model couldn't optimize or found no change
// Built deterministically from static analysis data — zero network, zero LLM.
// ─────────────────────────────────────────────────────────────────────────────

interface Suggestion {
    icon: string;
    title: string;
    detail: string;
    effort: 'low' | 'medium' | 'high';
}

function buildManualSuggestions(result: OptimizationResult, isFallback: boolean): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const patterns  = result.detected_patterns   ?? [];
    const opts      = result.possible_optimizations ?? [];
    const algo      = result.algorithm ?? '';
    const before    = result.complexity_before ?? '';
    const seen      = new Set<string>(); // dedupe

    const add = (s: Suggestion) => {
        if (!seen.has(s.title)) { seen.add(s.title); suggestions.push(s); }
    };

    // ── From detected patterns ────────────────────────────────────────────────
    for (const p of patterns) {
        if (p.type === 'nested_loops') {
            add({ icon: '🔁', effort: 'high',
                title: 'Flatten nested loops with a lookup table',
                detail: 'Replace the inner loop with a Map or Set built in a single pass before the outer loop. This brings the algorithm from O(n²) down to O(n).' });
        }
        if (p.type === 'repeated_computation') {
            add({ icon: '📌', effort: 'low',
                title: 'Cache repeated expressions in a variable',
                detail: 'Move any expression that is recalculated on every iteration (e.g. array.length, obj.property) into a const above the loop.' });
        }
        if (p.type === 'inefficient_data_structure') {
            add({ icon: '🗂️', effort: 'medium',
                title: 'Switch Array.includes() to a Set',
                detail: 'Build a Set once from your array, then use Set.has() for membership tests. Lookup drops from O(n) to O(1) for each check.' });
        }
        if (p.type === 'string_concat_in_loop') {
            add({ icon: '🧵', effort: 'low',
                title: 'Collect strings in an array, join once',
                detail: 'Push each fragment into an array inside the loop, then call array.join("") after. Eliminates O(n²) string copying from repeated concatenation.' });
        }
        if (p.type === 'redundant_condition') {
            add({ icon: '✂️', effort: 'low',
                title: 'Simplify conditional branches',
                detail: 'Look for if-else chains where both branches do the same thing, or conditions that are always true/false given earlier checks. Use early returns to reduce nesting.' });
        }
        if (p.type === 'excessive_nesting') {
            add({ icon: '📐', effort: 'medium',
                title: 'Reduce nesting with guard clauses',
                detail: 'Invert your conditions and return/continue early instead of wrapping logic in deep if blocks. Aim for a maximum of 2–3 levels of indentation.' });
        }
        if (p.type === 'large_function') {
            add({ icon: '✂️', effort: 'high',
                title: 'Split this function into smaller helpers',
                detail: 'Identify distinct steps (validation, transformation, output) and extract each into its own named function. Easier to test and read.' });
        }
        if (p.type === 'missing_early_exit') {
            add({ icon: '🚪', effort: 'low',
                title: 'Add an early-exit guard at the top',
                detail: 'If the function has a precondition (empty array, null input, etc.), check it first and return immediately. Avoids running the whole body for trivial cases.' });
        }
    }

    // ── From optimization suggestions (if patterns gave nothing) ──────────────
    for (const opt of opts.slice(0, 3)) {
        add({ icon: '⚡', effort: 'medium', title: opt.action, detail: opt.rationale });
    }

    // ── Complexity-based generic advice ──────────────────────────────────────
    if (/O\(2[ⁿn]|exponential/i.test(before)) {
        add({ icon: '🧮', effort: 'high',
            title: 'Add memoization to eliminate exponential blowup',
            detail: 'Cache results of recursive calls in a Map keyed by the input arguments. This is the standard fix for problems like Fibonacci or recursive subsets.' });
    }
    if (/O\(n[²2³3]\)/i.test(before) && !patterns.some(p => p.type === 'nested_loops')) {
        add({ icon: '🔁', effort: 'high',
            title: 'Look for a way to reduce the inner loop',
            detail: 'Quadratic complexity usually means a nested loop where the inner one could be replaced by a hash-based lookup, sorting, or a sliding-window technique.' });
    }

    // ── Algorithm-specific hints ──────────────────────────────────────────────
    if (/bubble sort|selection sort|insertion sort/i.test(algo)) {
        add({ icon: '📊', effort: 'medium',
            title: `Replace ${algo} with a built-in sort`,
            detail: `JavaScript's Array.sort(), Python's sorted(), and Java's Arrays.sort() all use O(n log n) algorithms. There is rarely a reason to implement O(n²) sorts manually.` });
    }
    if (/fibonacci/i.test(algo)) {
        add({ icon: '🧮', effort: 'medium',
            title: 'Use an iterative Fibonacci with two variables',
            detail: 'The recursive naive approach is O(2ⁿ). An iterative version using two variables prev and curr runs in O(n) time and O(1) space.' });
    }
    if (/regex/i.test(algo)) {
        add({ icon: '🔍', effort: 'medium',
            title: 'Compile the regex outside the loop',
            detail: 'If the same pattern is used repeatedly, compile it once with new RegExp(...) or a literal outside the loop so the engine does not re-parse the pattern on each call.' });
    }
    if (/http|api call|fetch/i.test(algo)) {
        add({ icon: '🌐', effort: 'high',
            title: 'Cache or batch repeated network requests',
            detail: 'If the same endpoint is called multiple times with the same arguments, cache the result in a Map. If multiple items need fetching, batch them into a single request.' });
    }

    // ── Fallback-specific tip ─────────────────────────────────────────────────
    if (isFallback && suggestions.length === 0) {
        add({ icon: '📝', effort: 'low',
            title: 'Try refactoring manually step by step',
            detail: 'The model struggled with this snippet. Consider breaking it into smaller pieces and optimizing each part individually, then recombining.' });
    }

    // ── Always-useful generic tips if we still have room ─────────────────────
    if (suggestions.length < 2) {
        add({ icon: '📖', effort: 'low',
            title: 'Add descriptive variable names',
            detail: 'Renaming short or cryptic variables to descriptive names helps future readers (and tools) understand intent, and sometimes reveals redundant logic.' });
        add({ icon: '🧪', effort: 'medium',
            title: 'Write a unit test for the edge cases',
            detail: `Once you have tests for empty input, single-item input, and maximum-size input, you'll be able to refactor with confidence and measure real improvements.` });
    }

    return suggestions.slice(0, 6); // cap at 6 cards
}

const EFFORT_LABEL: Record<string, string> = { low: 'Easy', medium: 'Medium', high: 'Involved' };
const EFFORT_COLOR: Record<string, string> = {
    low:    'rgba(34,197,94,0.15)',
    medium: 'rgba(251,191,36,0.15)',
    high:   'rgba(239,68,68,0.12)',
};
const EFFORT_TEXT: Record<string, string> = {
    low:    '#22c55e',
    medium: '#f59e0b',
    high:   '#ef4444',
};

function ManualSuggestionsPanel({ result, isFallback }: { result: OptimizationResult; isFallback: boolean }) {
    const suggestions = buildManualSuggestions(result, isFallback);
    if (suggestions.length === 0) return null;

    return (
        <div style={{ padding: '0 16px 16px' }}>
            <div style={{
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-light)',
                marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
                <span>📋</span> What you could try
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {suggestions.map((s, i) => (
                    <div key={i} style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: '4px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '14px' }}>{s.icon}</span>
                                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{s.title}</span>
                            </div>
                            <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '1px 7px',
                                borderRadius: '99px', whiteSpace: 'nowrap', flexShrink: 0,
                                background: EFFORT_COLOR[s.effort],
                                color: EFFORT_TEXT[s.effort],
                            }}>{EFFORT_LABEL[s.effort]}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', paddingLeft: '20px' }}>
                            {s.detail}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Static Analysis Insights section
// ─────────────────────────────────────────────────────────────────────────────

function StaticInsightsPanel({ result }: { result: OptimizationResult }) {
    const patterns = result.detected_patterns ?? [];
    const suggestions = result.possible_optimizations ?? [];
    const score = result.static_confidence_score;

    if (patterns.length === 0 && suggestions.length === 0) return null;

    return (
        <div className="static-insights">
            <div className="insights-header">
                <span>🔬</span>
                <span>Static Analysis Report</span>
                {typeof score === 'number' && (
                    <span style={{
                        marginLeft: 'auto', fontSize: '10px', fontWeight: 600,
                        padding: '2px 8px', borderRadius: '99px',
                        background: score >= 0.7 ? 'rgba(239,68,68,0.1)' : score >= 0.4 ? 'rgba(251,191,36,0.1)' : 'rgba(107,114,128,0.1)',
                        color: score >= 0.7 ? '#ef4444' : score >= 0.4 ? '#f59e0b' : 'var(--text-light)',
                        border: `1px solid ${score >= 0.7 ? 'rgba(239,68,68,0.3)' : score >= 0.4 ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
                    }}>
                        Optimizability: {Math.round(score * 100)}%
                    </span>
                )}
            </div>

            {patterns.length > 0 && (
                <div className="insights-section">
                    <div className="insights-section-title">Detected Patterns</div>
                    {patterns.map((p, i) => (
                        <div key={i} className="insight-item pattern-item">
                            <span className="insight-severity" style={{ color: SEVERITY_COLOR[p.severity] || 'var(--text-light)' }}>
                                {p.severity === 'high' ? '🔴' : p.severity === 'medium' ? '🟡' : '🟢'}
                            </span>
                            <span className="insight-desc">{p.description}</span>
                        </div>
                    ))}
                </div>
            )}

            {suggestions.length > 0 && (
                <div className="insights-section">
                    <div className="insights-section-title">Optimization Opportunities</div>
                    {suggestions.map((s, i) => (
                        <div key={i} className="insight-item suggestion-item">
                            <div className="suggestion-action">
                                <span style={{ color: IMPACT_COLOR[s.expectedImpact] || 'var(--text-light)', fontSize: '12px' }}>
                                    {s.expectedImpact === 'high' ? '⚡' : s.expectedImpact === 'medium' ? '→' : '·'}
                                </span>
                                <strong>{s.action}</strong>
                            </div>
                            <div className="suggestion-rationale">{s.rationale}</div>
                        </div>
                    ))}
                </div>
            )}


        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ExplainPanel
// ─────────────────────────────────────────────────────────────────────────────

export function ExplainPanel({ result, isLoading, shouldShowImprovement = true }: Props) {
    if (isLoading) {
        return (
            <div className="explain-panel">
                <div className="explain-grid">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="explain-card skeleton">
                            <div className="skeleton-line title" />
                            <div className="skeleton-line body" />
                            <div className="skeleton-line body short" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!result) {
        console.log('ExplainPanel: No result provided');
        return null;
    }

    console.log('ExplainPanel: Result received:', result);

    const isNoChange = result._no_change === true;
    const beforeColor = getComplexityColor(result.complexity_before);
    const afterColor = getComplexityColor(result.complexity_after);

    // ── NO-CHANGE STATE (both genuine and fallback) ─────────────────────────
    if (isNoChange) {
        const isFallback = !!result._parse_warning;
        console.log('ExplainPanel: Showing no-change state', { isFallback, isNoChange });
        return (
            <div className="explain-panel">
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: '28px 24px 16px', textAlign: 'center',
                    gap: '8px',
                }}>
                    <div style={{ fontSize: '2.5rem' }}>{isFallback ? '🔄' : '✅'}</div>
                    <h3 style={{ margin: 0 }}>
                        {isFallback ? 'Original Preserved' : 'Already Well-Optimized'}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: 0, fontSize: '13px' }}>
                        {isFallback
                            ? "The model couldn't produce a reliable change, so your original was kept. Here's what you could try manually:"
                            : "No automatic improvements were found. Here's what you could explore to take this further:"}
                    </p>
                    {result._parse_warning && (
                        <div className="explain-notice explain-notice--warn" style={{ marginTop: '8px', textAlign: 'left' }}>
                            <span>⚠️</span>
                            <span>{result._parse_warning}</span>
                        </div>
                    )}
                    {result._c_language && (
                        <div className="explain-notice explain-notice--info" style={{ marginTop: '4px' }}>
                            <span>🛡️</span>
                            <span>C optimizations are conservative — no transformation applied to preserve safety.</span>
                        </div>
                    )}
                </div>

                {/* Manual suggestions — always shown in no-change state */}
                <ManualSuggestionsPanel result={result} isFallback={isFallback} />

                {/* Complexity — always shown */}
                <ComplexityPanel result={result} isNoChange={true} />

                {/* Static analysis patterns */}
                <StaticInsightsPanel result={result} />
            </div>
        );
    }

    return (
        <div className="explain-panel">

            {/* C language conservative safety banner */}
            {result._c_language && (
                <div className="explain-notice explain-notice--info">
                    <span>🛡️</span>
                    <span>C optimizations are conservative to ensure safety — pointer logic, memory layout, and struct fields are never modified unless provably safe.</span>
                </div>
            )}

            {/* Parse warning / fallback notice */}
            {result._parse_warning && (
                <div className="explain-notice explain-notice--warn">
                    <span>⚠️</span>
                    <span>{result._parse_warning}</span>
                </div>
            )}

            {/* ── LLM Result Cards ── */}
            <div className="explain-grid">

                <div className="explain-card algo-card">
                    <div className="card-icon">🧠</div>
                    <div className="card-content">
                        <div className="card-title">Detected Pattern</div>
                        <div className="card-value">{result.algorithm}</div>
                        <div className="card-sub">{result.optimization_strategy || result.strategy}</div>
                    </div>
                </div>

                {/* Complexity card removed from grid — now shown as dedicated panel below */}

                <div className="explain-card bottleneck-card">
                    <div className="card-icon">🚨</div>
                    <div className="card-content">
                        <div className="card-title">Bottleneck</div>
                        <div className="card-value small">{result.bottleneck}</div>
                    </div>
                </div>

                <div className="explain-card explanation-card">
                    <div className="card-icon">💡</div>
                    <div className="card-content">
                        <div className="card-title">Explanation</div>
                        <div className="card-value small">{result.explanation}</div>
                    </div>
                </div>

                {result.tradeoffs && result.tradeoffs !== 'None' && result.tradeoffs !== 'Unknown' && (
                    <div className="explain-card" style={{ gridColumn: '1 / -1' }}>
                        <div className="card-icon">⚖️</div>
                        <div className="card-content">
                            <div className="card-title">Trade-offs</div>
                            <div className="card-value small">{result.tradeoffs}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Complexity — always shown ── */}
            <ComplexityPanel result={result} isNoChange={false} />

            {/* ── Static Analysis Insights (always shown) ── */}
            <StaticInsightsPanel result={result} />

            {/* ── Performance Confidence — only when high enough ── */}
            {shouldShowImprovement && (
                <div className="tradeoffs-section">
                    <div className="tradeoffs-header">
                        <span>⚡</span>
                        <span>Performance Assessment</span>
                    </div>
                    <div className="tradeoffs-body" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: '2px' }}>Confidence</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: result._c_language ? '#f59e0b' : 'var(--success)' }}>
                                {typeof result.confidence === 'number' ? `${result.confidence}%` : '—'}
                                {result._c_language && <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.7 }}>(C cap)</span>}
                            </div>
                        </div>
                        <div style={{ width: '1px', height: '30px', background: 'var(--border)' }}></div>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: '2px' }}>Estimated Improvement</div>
                            <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                                {result.estimated_improvement && result.estimated_improvement !== 'N/A'
                                    ? result.estimated_improvement
                                    : 'Minor optimization applied'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!shouldShowImprovement && (
                <div className="tradeoffs-section">
                    <div className="tradeoffs-body" style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '6px 0' }}>
                        ⚡ Optimization applied — model confidence below threshold to display improvement estimate.
                    </div>
                </div>
            )}
        </div>
    );
}
