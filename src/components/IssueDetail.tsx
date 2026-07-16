import React from 'react';
import { useRepair } from '../state/RepairStore';
import { FixDiff } from './FixDiff';

// Detail view for the selected issue: its message, the records/lines involved,
// and each suggested fix with a reviewable diff and an Accept button.

export function IssueDetail() {
  const { state, dispatch } = useRepair();
  const { db, selectedIssueId } = state;
  const issue = state.issues.find((i) => i.id === selectedIssueId);

  if (!db) return null;
  if (!issue) {
    return (
      <div className="issue-detail empty">
        <p>Select an issue to review it.</p>
      </div>
    );
  }

  return (
    <div className="issue-detail">
      <h2>
        <span className={`badge severity-${issue.severity}`}>{issue.category}</span>
      </h2>
      <p className="issue-message">{issue.message}</p>
      {issue.recordIds.length > 0 && (
        <p className="issue-meta">
          Records: {issue.recordIds.map((id) => `@${id}@`).join(', ')}
          {issue.lineNumbers.length > 0 &&
            ` · line ${issue.lineNumbers.join(', ')}`}
        </p>
      )}

      {issue.suggestedFixes.length === 0 ? (
        <p className="issue-meta">
          No automatic fix — this record needs to be edited by hand.
        </p>
      ) : (
        <div className="fix-list">
          <h3>Suggested {issue.suggestedFixes.length === 1 ? 'fix' : 'fixes'}</h3>
          {issue.suggestedFixes.map((sf, i) => (
            <div key={i} className="suggested-fix">
              <div className="suggested-fix-header">
                <span>{sf.label}</span>
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
