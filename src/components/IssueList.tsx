import React from 'react';
import { Issue, Severity } from '../lib/model/Issue';
import { useRepair } from '../state/RepairStore';

// The list of detected issues, with a small summary header.

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function IssueList() {
  const { state, dispatch } = useRepair();
  const issues = [...state.issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const counts = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="issue-list">
      <div className="issue-summary">
        {issues.length === 0 ? (
          <span className="ok">No issues found.</span>
        ) : (
          <span>
            {issues.length} issue{issues.length === 1 ? '' : 's'}
            {counts.error ? ` · ${counts.error} error` : ''}
            {counts.warning ? ` · ${counts.warning} warning` : ''}
          </span>
        )}
      </div>
      <ul>
        {issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            selected={issue.id === state.selectedIssueId}
            onSelect={() => dispatch({ type: 'SELECT_ISSUE', id: issue.id })}
          />
        ))}
      </ul>
    </div>
  );
}

function IssueRow({
  issue,
  selected,
  onSelect,
}: {
  issue: Issue;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      className={`issue-row severity-${issue.severity}${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <span className={`badge severity-${issue.severity}`}>{issue.category}</span>
      <span className="issue-message">{issue.message}</span>
    </li>
  );
}
