import { useEffect, useState } from 'react';
import { PIPELINE_STAGES, PIPELINE_STAGE_DESCRIPTION } from '../lib/constants';

interface Props {
    current: string; // Current stage name
    isLoading?: boolean;
}

const STAGE_ICONS: Record<string, string> = {
    'Understanding Code': '📄',
    'Optimizing': '⚙️',
    'Refining Optimization': '✨',
    'Finalizing Output': '📋',
};

export function PipelineIndicator({ current, isLoading }: Props) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (current !== 'idle') {
            setVisible(true);
        } else {
            const t = setTimeout(() => setVisible(false), 800);
            return () => clearTimeout(t);
        }
    }, [current]);

    if (!visible) return null;

    return (
        <div 
            className="pipeline-indicator"
            role="status"
            aria-live="polite"
            aria-label={isLoading ? `Processing: ${current}` : 'Optimization complete'}
        >
            <div className="pipeline-steps">
                {PIPELINE_STAGES.map((stage, i) => {
                    const idx = PIPELINE_STAGES.indexOf(stage);
                    const currentIdx = PIPELINE_STAGES.indexOf(current as any);
                    const isActive = stage === current;
                    const isDone = idx < currentIdx;
                    const isPending = idx > currentIdx;
                    const icon = STAGE_ICONS[stage] || '○';

                    return (
                        <div 
                            key={stage} 
                            className={`pipeline-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isPending ? 'pending' : ''}`}
                            aria-current={isActive ? 'step' : undefined}
                        >
                            <div className="step-icon" aria-hidden="true">
                                {isDone ? '✓' : isActive ? <span className="stage-pulse" /> : icon}
                            </div>
                            <span className="step-label">
                                {stage}
                            </span>
                            <span className="sr-only">
                                {isDone && 'completed'}
                                {isActive && 'in progress'}
                                {isPending && 'pending'}
                            </span>
                            <span className="sr-only">{PIPELINE_STAGE_DESCRIPTION[stage]}</span>
                            {i < PIPELINE_STAGES.length - 1 && (
                                <div className={`step-connector ${isDone ? 'done' : ''}`} aria-hidden="true" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
