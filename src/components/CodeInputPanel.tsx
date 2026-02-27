/**
 * CodeInputPanel: Handles user code input, language selection, and optimization triggers.
 * Extracted from CodeOptimizerTab for better component organization and accessibility.
 */

import { useRef, useCallback } from 'react';
import type { OptimizationFocus } from '../lib/promptBuilder';
import { SUPPORTED_LANGUAGES, OPTIMIZATION_FOCUS, ARIA_LABELS, STATUS_ICONS } from '../lib/constants';

interface CodeInputPanelProps {
  codeInput: string;
  setCodeInput: (code: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  focus: OptimizationFocus;
  setFocus: (focus: OptimizationFocus) => void;
  fastMode: boolean;
  setFastMode: (mode: boolean) => void;
  onOptimize: () => void;
  onCancel: () => void;
  onClear: () => void;
  optimizing: boolean;
  modelReady: boolean;
  error?: string | null;
}

export function CodeInputPanel(props: CodeInputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        props.setCodeInput(content);
        // Detect language from filename
        const ext = file.name.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
          js: 'JavaScript',
          jsx: 'JavaScript',
          ts: 'TypeScript',
          tsx: 'TypeScript',
          py: 'Python',
          java: 'Java',
          cpp: 'C++',
        };
        if (ext && langMap[ext]) {
          props.setLanguage(langMap[ext]);
        }
      }
    };
    reader.readAsText(file);
  }, [props]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (!props.optimizing && props.modelReady) {
        props.onOptimize();
      }
    }
  }, [props]);

  return (
    <div className="code-input-panel">
      <div className="input-controls">
        <div className="control-group">
          <label htmlFor="language-select" className="control-label">
            Language
          </label>
          <select
            id="language-select"
            value={props.language}
            onChange={(e) => props.setLanguage(e.target.value)}
            aria-label={ARIA_LABELS.LANGUAGE_SELECT}
            disabled={props.optimizing}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="focus-select" className="control-label">
            Focus
          </label>
          <select
            id="focus-select"
            value={props.focus}
            onChange={(e) => props.setFocus(e.target.value as OptimizationFocus)}
            aria-label={ARIA_LABELS.FOCUS_SELECT}
            disabled={props.optimizing}
          >
            {OPTIMIZATION_FOCUS.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="fast-mode-toggle" className="control-label">
            <input
              id="fast-mode-toggle"
              type="checkbox"
              checked={props.fastMode}
              onChange={(e) => props.setFastMode(e.target.checked)}
              aria-label={ARIA_LABELS.FAST_MODE_TOGGLE}
              disabled={props.optimizing}
            />
            <span>Fast Mode</span>
          </label>
        </div>
      </div>

      <div className="code-editor-wrapper">
        <textarea
          value={props.codeInput}
          onChange={(e) => props.setCodeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your code here... (or Ctrl+Enter to optimize)"
          className="code-input"
          aria-label="Code input area"
          aria-describedby="code-input-hint"
          disabled={props.optimizing}
          spellCheck="false"
        />
        <div id="code-input-hint" className="sr-only">
          Enter code you want to optimize. Press Ctrl+Enter to start optimization, or click the Optimize button.
        </div>

        <div className="editor-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.c"
            onChange={handleFileUpload}
            className="hidden-file-input"
            aria-label={ARIA_LABELS.UPLOAD_FILE}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
            disabled={props.optimizing}
            aria-label={ARIA_LABELS.UPLOAD_FILE}
          >
            📁 Upload File
          </button>

          <button
            onClick={props.onOptimize}
            disabled={props.optimizing || !props.modelReady || !props.codeInput.trim()}
            className="btn btn-primary"
            aria-label={ARIA_LABELS.OPTIMIZE_BUTTON}
            aria-busy={props.optimizing}
          >
            {props.optimizing ? `${STATUS_ICONS.PENDING} Optimizing...` : '✨ Optimize Code'}
          </button>

          {props.optimizing && (
            <button
              onClick={props.onCancel}
              className="btn btn-danger"
              aria-label={ARIA_LABELS.CANCEL_BUTTON}
            >
              ⏹️ Cancel
            </button>
          )}

          <button
            onClick={props.onClear}
            className="btn btn-secondary"
            disabled={props.optimizing}
            aria-label={ARIA_LABELS.CLEAR_BUTTON}
          >
            🗑️ Clear
          </button>
        </div>

        {props.error && (
          <div className="error-message" role="alert" aria-live="assertive">
            {STATUS_ICONS.ERROR} {props.error}
          </div>
        )}
      </div>
    </div>
  );
}
