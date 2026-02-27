import type { OptimizationResult } from '../lib/promptBuilder';

interface OverviewPanelProps {
  result: OptimizationResult;
}

type IconName =
  | 'overview'
  | 'algorithm'
  | 'time'
  | 'space'
  | 'patterns'
  | 'confidence'
  | 'insights'
  | 'bottleneck'
  | 'performance';

function UiIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'overview':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'algorithm':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
        </svg>
      );
    case 'time':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        </svg>
      );
    case 'space':
      return (
        <svg {...common}>
          <path d="m12 3 8 4-8 4-8-4 8-4Z" />
          <path d="m4 11 8 4 8-4" />
          <path d="m4 15 8 4 8-4" />
        </svg>
      );
    case 'patterns':
      return (
        <svg {...common}>
          <path d="M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14" />
        </svg>
      );
    case 'confidence':
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20v-3" />
        </svg>
      );
    case 'insights':
      return (
        <svg {...common}>
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 13c.7.6 1.2 1.4 1.5 2.2h5c.3-.8.8-1.6 1.5-2.2A7 7 0 0 0 12 2Z" />
        </svg>
      );
    case 'bottleneck':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
      );
    case 'performance':
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
      );
  }
}

function OverviewPanel({ result }: OverviewPanelProps) {
  const {
    algorithm,
    complexity_before,
    complexity_after,
    bottleneck,
    strategy,
    confidence,
    detected_patterns = [],
    possible_optimizations = []
  } = result;

  // Calculate complexity improvement
  const complexityImproved = complexity_before !== complexity_after;
  const complexityColor = (complexity: string) => {
    if (complexity.includes('O(1)')) return 'green';
    if (complexity.includes('O(log n)')) return 'green';
    if (complexity.includes('O(n)')) return 'blue';
    if (complexity.includes('O(n log n)')) return 'blue';
    if (complexity.includes('O(n²)') || complexity.includes('O(nÂ²)') || complexity.includes('O(n^2)')) return 'orange';
    if (complexity.includes('O(n³)') || complexity.includes('O(nÂ³)') || complexity.includes('O(n^3)')) return 'red';
    return 'gray';
  };

  const getComplexityIcon = (complexity: string) => {
    if (complexity.includes('O(1)')) return 'C';
    if (complexity.includes('O(log n)')) return 'L';
    if (complexity.includes('O(n)')) return 'N';
    if (complexity.includes('O(n log n)')) return 'NL';
    if (complexity.includes('O(n²)') || complexity.includes('O(nÂ²)') || complexity.includes('O(n^2)')) return 'N2';
    if (complexity.includes('O(n³)') || complexity.includes('O(nÂ³)') || complexity.includes('O(n^3)')) return 'N3';
    return '?';
  };

  const getComplexityExplanation = (complexity: string) => {
    if (complexity.includes('O(1)')) return 'Constant time - executes in fixed time regardless of input size';
    if (complexity.includes('O(log n)')) return 'Logarithmic time - very efficient, grows slowly with input';
    if (complexity.includes('O(n)')) return 'Linear time - grows proportionally with input size';
    if (complexity.includes('O(n log n)')) return 'Linearithmic time - typical of efficient sorting algorithms';
    if (complexity.includes('O(n²)') || complexity.includes('O(nÂ²)') || complexity.includes('O(n^2)')) return 'Quadratic time - slows down quickly with larger inputs';
    if (complexity.includes('O(n³)') || complexity.includes('O(nÂ³)') || complexity.includes('O(n^3)')) return 'Cubic time - very slow, avoid for large datasets';
    return 'Unknown complexity';
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      padding: '20px',
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      maxHeight: 'calc(100vh - 200px)',
      overflowY: 'auto',
    }}>
      
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="overview" size={20} /></span>
        <h3 style={{ 
          margin: 0, 
          fontSize: '18px', 
          fontWeight: 700, 
          color: 'var(--text)' 
        }}>
          Code Analysis Overview
        </h3>
      </div>

      {/* Algorithm Information */}
      <div style={{
        background: 'var(--bg-glass)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '14px', 
          fontWeight: 600, 
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="algorithm" /></span>
          Algorithm & Logic
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Detected Pattern:</span>
            <span style={{ 
              fontSize: '13px', 
              fontWeight: 600, 
              color: 'var(--text)',
              background: 'var(--bg-secondary)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
            }}>
              {algorithm || 'Unknown Algorithm'}
            </span>
          </div>
          
          <div style={{ marginTop: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Strategy Used:</span>
            <p style={{ 
              margin: '4px 0 0 0', 
              fontSize: '13px', 
              color: 'var(--text-secondary)',
              lineHeight: '1.4',
            }}>
              {strategy || 'No specific strategy applied'}
            </p>
          </div>
        </div>
      </div>

      {/* Time Complexity Analysis */}
      <div style={{
        background: 'var(--bg-glass)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '14px', 
          fontWeight: 600, 
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="time" /></span>
          Time Complexity Analysis
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {complexityImproved ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>Before</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    fontSize: '16px', 
                    fontWeight: 700, 
                    color: `var(--complexity-${complexityColor(complexity_before)})`,
                    background: 'var(--bg-secondary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    minWidth: '80px',
                    textAlign: 'center',
                  }}>
                    {getComplexityIcon(complexity_before)} {complexity_before}
                  </span>
                  <span style={{ fontSize: '16px', color: 'var(--text-light)', margin: '0 8px' }}>-&gt;</span>
                  <span style={{ 
                    fontSize: '16px', 
                    fontWeight: 700, 
                    color: `var(--complexity-${complexityColor(complexity_after)})`,
                    background: 'var(--bg-secondary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    minWidth: '80px',
                    textAlign: 'center',
                  }}>
                    {getComplexityIcon(complexity_after)} {complexity_after}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-light)', display: 'block', marginTop: '4px' }}>
                  {getComplexityExplanation(complexity_before)}
                </span>
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>After</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    fontSize: '16px', 
                    fontWeight: 700, 
                    color: `var(--complexity-${complexityColor(complexity_after)})`,
                    background: 'var(--bg-secondary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    minWidth: '80px',
                    textAlign: 'center',
                  }}>
                    {getComplexityIcon(complexity_after)} {complexity_after}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-light)', display: 'block', marginTop: '4px' }}>
                  {getComplexityExplanation(complexity_after)}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <span style={{ 
                fontSize: '16px', 
                fontWeight: 700, 
                color: `var(--complexity-${complexityColor(complexity_before)})`,
                background: 'var(--bg-secondary)',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                display: 'inline-block',
                minWidth: '120px',
              }}>
                {getComplexityIcon(complexity_before)} {complexity_before}
              </span>
              <p style={{ 
                margin: '8px 0 0 0', 
                fontSize: '12px', 
                color: 'var(--text-secondary)',
                lineHeight: '1.4',
              }}>
                {getComplexityExplanation(complexity_before)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Space Complexity Analysis */}
      <div style={{
        background: 'var(--bg-glass)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '14px', 
          fontWeight: 600, 
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="space" /></span>
          Space Complexity Analysis
        </h4>
        
        <div style={{ textAlign: 'center' }}>
          <span style={{ 
            fontSize: '16px', 
            fontWeight: 700, 
            color: 'var(--complexity-blue)',
            background: 'var(--bg-secondary)',
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            display: 'inline-block',
            minWidth: '120px',
          }}>
            O(n) - O(n log n)
          </span>
          <p style={{ 
            margin: '8px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-secondary)',
            lineHeight: '1.4',
          }}>
            Linear to linearithmic space usage - typical for algorithms that store data proportional to input size with some logarithmic overhead
          </p>
        </div>
      </div>

      {/* Detected Patterns */}
      {detected_patterns && detected_patterns.length > 0 && (
        <div style={{
          background: 'var(--bg-glass)',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <h4 style={{ 
            margin: '0 0 12px 0', 
            fontSize: '14px', 
            fontWeight: 600, 
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="patterns" /></span>
            Detected Code Patterns
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {detected_patterns.map((pattern, index) => (
              <div key={index} style={{
                background: 'var(--bg-secondary)',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                borderLeft: `4px solid var(--${pattern.severity === 'high' ? 'error' : pattern.severity === 'medium' ? 'warning' : 'success'})`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      color: 'var(--text)' 
                    }}>
                      {pattern.type}
                    </span>
                    <p style={{ 
                      margin: '4px 0 0 0', 
                      fontSize: '11px', 
                      color: 'var(--text-secondary)',
                      lineHeight: '1.3',
                    }}>
                      {pattern.description}
                    </p>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    background: `var(--${pattern.severity === 'high' ? 'error' : pattern.severity === 'medium' ? 'warning' : 'success'})`,
                    color: 'white',
                  }}>
                    {pattern.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimization Confidence */}
      <div style={{
        background: 'var(--bg-glass)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '14px', 
          fontWeight: 600, 
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="confidence" /></span>
          Analysis Confidence
        </h4>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '8px',
              background: 'var(--border)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                background: `var(--${confidence >= 80 ? 'success' : confidence >= 60 ? 'warning' : 'error'})`,
                borderRadius: '4px',
                width: `${Math.max(confidence, 10)}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>
              {Math.round(confidence)}%
            </span>
            <p style={{ 
              margin: '4px 0 0 0', 
              fontSize: '11px', 
              color: 'var(--text-secondary)',
              lineHeight: '1.3',
            }}>
              {confidence >= 80 ? 'High confidence in analysis and recommendations' :
               confidence >= 60 ? 'Moderate confidence - some uncertainty in optimizations' :
               'Low confidence - review recommendations carefully'}
            </p>
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div style={{
        background: 'var(--bg-glass)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '14px', 
          fontWeight: 600, 
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><UiIcon name="insights" /></span>
          Key Insights
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ 
              fontSize: '20px', 
              color: 'var(--text-light)',
              minWidth: '24px',
              textAlign: 'center',
            }}>
              <UiIcon name="bottleneck" size={18} />
            </span>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Primary Bottleneck:</span>
              <p style={{ 
                margin: '2px 0 0 0', 
                fontSize: '11px', 
                color: 'var(--text-secondary)',
                lineHeight: '1.3',
              }}>
                {bottleneck || 'No specific bottleneck identified'}
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ 
              fontSize: '20px', 
              color: 'var(--text-light)',
              minWidth: '24px',
              textAlign: 'center',
            }}>
              <UiIcon name="performance" size={18} />
            </span>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Performance Impact:</span>
              <p style={{ 
                margin: '2px 0 0 0', 
                fontSize: '11px', 
                color: 'var(--text-secondary)',
                lineHeight: '1.3',
              }}>
                {complexityImproved ? 'Algorithmic complexity improved - better scalability expected' : 'No complexity improvement - code already optimal'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OverviewPanel;
