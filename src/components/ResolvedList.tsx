import React from 'react';
import { useRepair, useLeaveGuard, sortIssues } from '../state/RepairStore';

// Issues a fix has already cleared. Read-only; clicking one shows its (resolved)
// detail. Undoing a fix moves its issue back to the Issues tab automatically.

export function ResolvedList() {
  const { state, dispatch } = useRepair();
  const canLeave = useLeaveGuard();
  const resolved = sortIssues(state.resolved);

  if (resolved.length === 0) {
    return (
      <div className="resolved-list">
        <p className="issue-empty">No issues resolved yet.</p>
      </div>
    );
  }

  return (
    <div className="resolved-list">
      <ul>
        {resolved.map((issue) => (
          <li
            key={issue.id}
            className={`issue-row resolved${
              issue.id === state.selectedIssueId ? ' selected' : ''
            }`}
            onClick={() => {
              if (canLeave()) dispatch({ type: 'SELECT_ISSUE', id: issue.id });
            }}
          >
            <span className="badge resolved-badge">✓ {issue.category}</span>
            <span className="issue-message">{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
