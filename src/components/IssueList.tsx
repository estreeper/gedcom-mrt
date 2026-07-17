import React from 'react';
import { Issue, IssueCategory } from '../lib/model/Issue';
import { useRepair, visibleIssues, IssueFilter } from '../state/RepairStore';

// The list of detected (active) issues, with a summary header and a
// filter-by-type control.

export function IssueList() {
  const { state, dispatch } = useRepair();
  const shown = visibleIssues(state.issues, state.filter);

  const counts = state.issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  // Category -> count, over all active issues, for the filter options.
  const byCategory = new Map<IssueCategory, number>();
  for (const i of state.issues) {
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
  }

  return (
    <div className="issue-list">
      <div className="issue-summary">
        {state.issues.length === 0 ? (
          <span className="ok">No issues found.</span>
        ) : (
          <span>
            {state.issues.length} issue{state.issues.length === 1 ? '' : 's'}
            {counts.error ? ` · ${counts.error} error` : ''}
            {counts.warning ? ` · ${counts.warning} warning` : ''}
          </span>
        )}
      </div>

      {state.issues.length > 0 && (
        <div className="issue-filter-bar">
          <label htmlFor="issue-filter">Type</label>
          <select
            id="issue-filter"
            className="issue-filter"
            value={state.filter}
            onChange={(e) =>
              dispatch({ type: 'SET_FILTER', filter: e.target.value as IssueFilter })
            }
          >
            <option value="ALL">All types ({state.issues.length})</option>
            {Array.from(byCategory.entries()).map(([cat, n]) => (
              <option key={cat} value={cat}>
                {cat} ({n})
              </option>
            ))}
          </select>
        </div>
      )}

      <ul>
        {shown.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            selected={issue.id === state.selectedIssueId}
            onSelect={() => dispatch({ type: 'SELECT_ISSUE', id: issue.id })}
          />
        ))}
        {state.issues.length > 0 && shown.length === 0 && (
          <li className="issue-empty">No issues of this type.</li>
        )}
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
