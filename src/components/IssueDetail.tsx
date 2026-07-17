import React from 'react';
import { useRepair, visibleIssues } from '../state/RepairStore';
import { FixDiff } from './FixDiff';

// Detail view for the selected issue: prev/next navigation, a plain-language
// description above the precise technical one, the records/lines involved, and
// each suggested fix with a reviewable diff and an Accept button.

export function IssueDetail() {
  const { state, dispatch } = useRepair();
  const { db, selectedIssueId } = state;
  const active = state.issues.find((i) => i.id === selectedIssueId);
  const issue = active ?? state.resolved.find((i) => i.id === selectedIssueId);
  const isResolved = !active && issue !== undefined;

  if (!db) return null;
  if (!issue) {
    return (
      <div className="issue-detail empty">
        <p>Select an issue to review it.</p>
      </div>
    );
  }

  // Prev/next cycle through the currently-visible active issues.
  const visible = visibleIssues(state.issues, state.filter);
  const idx = visible.findIndex((i) => i.id === selectedIssueId);
  const showNav = idx >= 0 && visible.length > 1;
  const go = (delta: number) => {
    const next = idx + delta;
    if (next < 0 || next >= visible.length) return;
    dispatch({ type: 'SELECT_ISSUE', id: visible[next].id });
  };

  return (
    <div className="issue-detail">
      {showNav && (
        <div className="issue-nav">
          {idx > 0 ? (
            <button onClick={() => go(-1)}>← Previous</button>
          ) : (
            <span />
          )}
          <span className="issue-nav-pos">
            Issue {idx + 1} of {visible.length}
          </span>
          {idx < visible.length - 1 ? (
            <button onClick={() => go(1)}>Next →</button>
          ) : (
            <span />
          )}
        </div>
      )}

      <h2>
        <span className={`badge severity-${issue.severity}`}>{issue.category}</span>
        {isResolved && <span className="badge resolved-badge">✓ Resolved</span>}
      </h2>

      <p className="issue-message human">{issue.humanMessage ?? issue.message}</p>
      {issue.humanMessage && (
        <p className="issue-message technical">{issue.message}</p>
      )}

      {issue.recordIds.length > 0 && (
        <p className="issue-meta">
          Records:{' '}
          {issue.recordIds.map((id) => (
            <button
              key={id}
              className="record-link"
              onClick={() => dispatch({ type: 'EDIT_RECORD', id })}
              title={`Edit @${id}@`}
            >
              @{id}@
            </button>
          ))}
          {issue.lineNumbers.length > 0 &&
            ` · line ${issue.lineNumbers.join(', ')}`}
        </p>
      )}

      {isResolved ? (
        <p className="issue-meta">
          This issue has been resolved. Undo from the toolbar to bring it back.
        </p>
      ) : issue.suggestedFixes.length === 0 ? (
        <p className="issue-meta">
          No automatic fix — this record needs to be edited by hand.
        </p>
      ) : (
        <div className="fix-list">
          <h3>Suggested {issue.suggestedFixes.length === 1 ? 'fix' : 'fixes'}</h3>
          {issue.suggestedFixes.map((sf, i) => (
            <div key={i} className="suggested-fix">
              <div className="suggested-fix-header">
                <div className="suggested-fix-labels">
                  <span className="fix-human">{sf.humanLabel ?? sf.label}</span>
                  {sf.humanLabel && (
                    <span className="fix-technical">{sf.label}</span>
                  )}
                </div>
                <button
                  onClick={() => dispatch({ type: 'APPLY_FIX', fix: sf.fix })}
                >
                  Accept
                </button>
              </div>
              <FixDiff db={db} fix={sf.fix} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
