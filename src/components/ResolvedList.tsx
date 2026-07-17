import React from 'react';
import { useRepair, useLeaveGuard, sortIssues } from '../state/RepairStore';
import { VirtualList } from './VirtualList';

// Issues a fix has already cleared. Read-only; clicking one shows its (resolved)
// detail. Undoing a fix moves its issue back to the Issues tab automatically.

const ROW_HEIGHT = 64;

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

  const renderRow = (index: number, style?: React.CSSProperties) => {
    const issue = resolved[index];
    return (
      <div
        key={issue.id}
        className={`issue-row resolved${
          issue.id === state.selectedIssueId ? ' selected' : ''
        }`}
        style={style}
        onClick={() => {
          if (canLeave()) dispatch({ type: 'SELECT_ISSUE', id: issue.id });
        }}
      >
        <div className="issue-row-body">
          <span className="badge resolved-badge">✓ {issue.category}</span>
          <span className="issue-message" title={issue.message}>
            {issue.message}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="resolved-list">
      <VirtualList
        count={resolved.length}
        rowHeight={ROW_HEIGHT}
        className="issue-rows"
        render={renderRow}
      />
    </div>
  );
}
