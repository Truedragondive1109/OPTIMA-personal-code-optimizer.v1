/**
 * OutputPanel: Manages tab switching and result display with accessibility features.
 * Extracted from CodeOptimizerTab.
 */

import { useRef, useEffect } from 'react';
import { ExplainPanel } from './ExplainPanel';
import { DiffViewer } from './DiffViewer';
import OverviewPanel from './OverviewPanel';
import { PipelineIndicator } from './PipelineIndicator';
import type { OptimizationResult } from '../lib/promptBuilder';
import { OUTPUT_TABS, ARIA_LABELS, STATUS_ICONS } from '../lib/constants';

type OutputTab = typeof OUTPUT_TABS[number];

interface OutputPanelProps {
  result: OptimizationResult | null;
  streamedCode: string;
  isStreamingCode: boolean;
  originalCode: string;
  outputTab: OutputTab;
  setOutputTab: (tab: OutputTab) => void;
  pipelineStage: string;
  isLoading: boolean;
  shouldShowImprovement?: boolean;
}

export function OutputPanel(props: OutputPanelProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  // Focus management for keyboard navigation
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let newIndex = index;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      newIndex = (index - 1 + OUTPUT_TABS.length) % OUTPUT_TABS.length;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      newIndex = (index + 1) % OUTPUT_TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      newIndex = OUTPUT_TABS.length - 1;
    }

    if (newIndex !== index) {
      const buttons = tabListRef.current?.querySelectorAll('[role="tab"]');
      (buttons?.[newIndex] as HTMLButtonElement)?.focus();
      props.setOutputTab(OUTPUT_TABS[newIndex]);
    }
  };

  return (
    <div className="output-panel">
      {/* Pipeline indicator */}
      <PipelineIndicator current={props.pipelineStage} isLoading={props.isLoading} />

      {/* Tab navigation */}
      <div
        className="output-tabs"
        ref={tabListRef}
        role="tablist"
        aria-label="Output views"
      >
        {OUTPUT_TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            selected={props.outputTab === tab}
            onClick={() => props.setOutputTab(tab)}
            onKeyDown={(e) => handleTabKeyDown(e, OUTPUT_TABS.indexOf(tab))}
            aria-selected={props.outputTab === tab}
            aria-controls={`tabpanel-${tab}`}
            className={`tab-button ${props.outputTab === tab ? 'active' : ''}`}
            disabled={!props.result && props.isLoading}
          >
            {tab === 'code' && '💻 Code'}
            {tab === 'diff' && '📊 Diff'}
            {tab === 'explain' && '📖 Explain'}
            {tab === 'overview' && '🎯 Overview'}
          </button>
        ))}
      </div>

      {/* Tab content panels */}
      {props.outputTab === 'code' && (
        <div
          id="tabpanel-code"
          role="tabpanel"
          aria-labelledby="tab-code"
          className="tab-content"
        >
          <div className="streaming-code-panel">
            {props.isStreamingCode && (
              <div className="streaming-indicator" role="status" aria-live="polite">
                {STATUS_ICONS.PENDING} Streaming optimized code...
              </div>
            )}
            <pre className="code-display">
              <code>{props.streamedCode || props.result?.optimized_code || ''}</code>
            </pre>
            {props.result?.optimized_code && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(props.result.optimized_code);
                }}
                aria-label={ARIA_LABELS.COPY_CODE}
                className="btn btn-secondary"
              >
                📋 Copy Code
              </button>
            )}
          </div>
        </div>
      )}

      {props.outputTab === 'diff' && (
        <div
          id="tabpanel-diff"
          role="tabpanel"
          aria-labelledby="tab-diff"
          className="tab-content"
        >
          {props.result && (
            <DiffViewer
              before={props.originalCode}
              after={props.result.optimized_code}
            />
          )}
        </div>
      )}

      {props.outputTab === 'explain' && (
        <div
          id="tabpanel-explain"
          role="tabpanel"
          aria-labelledby="tab-explain"
          className="tab-content"
        >
          <ExplainPanel
            result={props.result}
            isLoading={props.isLoading}
            shouldShowImprovement={props.shouldShowImprovement}
          />
        </div>
      )}

      {props.outputTab === 'overview' && (
        <div
          id="tabpanel-overview"
          role="tabpanel"
          aria-labelledby="tab-overview"
          className="tab-content"
        >
          {props.result && <OverviewPanel result={props.result} />}
        </div>
      )}
    </div>
  );
}
